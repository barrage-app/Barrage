// État de l'extension, partagé par les trois surfaces (service worker, onglets
// x.com, options). Chaque fonctionnalité écrit sa part dans son propre store.ts ;
// ce fichier ne fait que décrire la forme de l'état et le lire.
//
// chrome.storage.local plutôt que sync : sync plafonne chaque valeur à 8 Ko,
// trop peu pour une longue liste.
import { DEFAULT_HANDLES } from "../features/accounts/defaults.ts";
import { activeHandles, eligible, resultOf, type Result, type Results } from "../features/blocking/queue.ts";

export type ErrorReason = "auth" | "network" | "other";

/**
 * Erreur qui empêche tout blocage, affichée dans les options. `staleAt` :
 * au-delà, sans nouvelle écriture, l'onglet qui l'a vue est réputé fermé.
 */
export type BlockingError = {
  message: string;
  reason: ErrorReason;
  staleAt: number;
  /** Horodatage de l'erreur, en millisecondes. */
  at?: number;
  /** Erreur de session : empreinte de la session X en cause, voir sessionId. */
  session?: string;
};

export type State = {
  /**
   * Liste complète : liste partagée (celle de GitHub une fois reçue, sinon
   * celle intégrée à l'extension), puis comptes ajoutés par l'utilisateur.
   */
  handles: string[];
  /** Comptes ajoutés par l'utilisateur, jamais retirés par une mise à jour de la liste partagée. */
  added: string[];
  /** Dernière liste X reçue de GitHub, ou null tant qu'aucune n'a été reçue. */
  remote: string[] | null;
  /**
   * Comptes retirés de la liste partagée alors que Barrage les avait bloqués :
   * à débloquer sur X, voir unblockQueue.
   */
  retired: string[];
  results: Results;
  /** Comptes désactivés dans les options : Barrage ne les bloque plus et ne masque plus leurs tweets. */
  disabled: string[];
  /**
   * Déblocages demandés à la main, y compris pour un compte bloqué avant
   * Barrage. Les comptes désactivés que Barrage a bloqués s'y ajoutent d'eux-mêmes,
   * voir unblockQueue.
   */
  unblock: string[];
  /** Comptes de la liste vus dans le fil et pas encore bloqués, à traiter en priorité. */
  seen: string[];
  /** Notification sur x.com à chaque compte bloqué par Barrage. */
  notify: boolean;
  /** Fin de la limite imposée par X, en millisecondes. 0 si aucune. */
  pauseUntil: number;
  error: BlockingError | null;
};

// En stockage, `handles` ne contient que les comptes ajoutés par l'utilisateur.
// La liste partagée est fusionnée à la lecture : la modifier sur GitHub, ou
// dans lists/x.json avant un build, la met à jour chez tous les utilisateurs.
//
// Les résultats sont stockés un par compte, sous `result:<identifiant>` : un
// blocage n'écrit que sa propre clé, sans réécrire ni écraser ceux des autres.
const RESULT_PREFIX = "result:";

export const resultKey = (handle: string): string => RESULT_PREFIX + handle;

/** Compte dont la clé de stockage porte le résultat, ou null pour une autre clé. */
export function resultHandle(key: string): string | null {
  return key.startsWith(RESULT_PREFIX) ? key.slice(RESULT_PREFIX.length) : null;
}

/** Résultats à écrire, sous leurs clés de stockage. */
export function resultEntries(results: Results): Record<string, unknown> {
  return Object.fromEntries(Object.entries(results).map(([handle, result]) => [resultKey(handle), result]));
}

export type StateKey = keyof State;

/**
 * Clés dont la modification relance le traitement : liste changée, compte vu
 * dans le fil ou blocage demandé à la main.
 */
export const QUEUE_KEYS: readonly StateKey[] = [
  "handles",
  "remote",
  "retired",
  "disabled",
  "unblock",
  "results",
  "seen",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Comptes que Barrage traite : la liste moins ceux désactivés. */
export function active(state: State): string[] {
  return activeHandles(state.handles, state.disabled);
}

/** File de blocage : comptes de la liste vus dans le fil ou demandés à la main. */
export function queueOrder(state: State): string[] {
  return eligible(active(state), state.seen);
}

/**
 * Comptes à débloquer sur X : demandes à la main encore sur Off (ou sorties
 * de la liste depuis, la demande reste due), puis tout
 * compte sur Off ou retiré de la liste partagée que Barrage a bloqué. Calculée
 * plutôt que stockée, la file ne peut pas manquer un blocage qui aboutit juste
 * après le passage sur Off. Un déblocage refusé par X n'est relancé que par
 * une nouvelle demande.
 */
export function unblockQueue(state: State): string[] {
  const disabled = new Set(state.disabled);
  const blockedByUs = (h: string) => {
    const result = resultOf(state.results, h);
    return result?.state === "blocked" && !result.unblockFailed;
  };
  const listed = new Set(state.handles);
  return [
    ...new Set([
      ...state.unblock.filter((h) => disabled.has(h) || !listed.has(h)),
      ...state.disabled.filter(blockedByUs),
      // Un compte remis dans la liste entre-temps n'est plus à débloquer.
      ...state.retired.filter((h) => !listed.has(h) && blockedByUs(h)),
    ]),
  ];
}

/** Tout l'état en une lecture, valeurs corrompues ramenées aux défauts. */
export async function getState(): Promise<State> {
  const stored = (await chrome.storage.local.get(null)) as Record<string, unknown>;
  const results: Results = Object.create(null);
  for (const [key, value] of Object.entries(stored)) {
    const handle = resultHandle(key);
    if (handle !== null && isRecord(value)) results[handle] = value as Result;
  }
  const added = strings(stored.handles);
  const remote = Array.isArray(stored.remote) ? strings(stored.remote) : null;
  return {
    handles: [...new Set([...(remote ?? DEFAULT_HANDLES), ...added])],
    added,
    remote,
    retired: strings(stored.retired),
    disabled: strings(stored.disabled),
    unblock: strings(stored.unblock),
    results,
    seen: strings(stored.seen),
    notify: stored.notify !== false,
    pauseUntil: typeof stored.pauseUntil === "number" ? stored.pauseUntil : 0,
    error: isRecord(stored.error) ? (stored.error as BlockingError) : null,
  };
}

export type StateChanges = { [key: string]: chrome.storage.StorageChange };

/**
 * Appelle `listener` à chaque écriture de l'une des clés données, ou de
 * n'importe quelle clé si la liste est omise.
 */
export function onStateChange(listener: (changes: StateChanges) => void, keys?: readonly StateKey[]): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const matches = (key: StateKey) =>
      key === "results" ? Object.keys(changes).some((k) => resultHandle(k) !== null) : key in changes;
    if (!keys || keys.some(matches)) listener(changes);
  });
}

/** Résultats avant et après une écriture, limités aux comptes modifiés. */
export function resultChanges(changes: StateChanges): { before: Results; after: Results } {
  const before: Results = Object.create(null);
  const after: Results = Object.create(null);
  for (const [key, change] of Object.entries(changes)) {
    const handle = resultHandle(key);
    if (handle === null) continue;
    if (isRecord(change.oldValue)) before[handle] = change.oldValue as Result;
    if (isRecord(change.newValue)) after[handle] = change.newValue as Result;
  }
  return { before, after };
}
