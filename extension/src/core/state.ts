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

/** Compte X connu, par identifiant numérique. */
export type Account = { handle?: string };

export type State = {
  /**
   * Compte X dont l'état est lu, identifiant numérique du cookie twid. null
   * tant qu'aucun onglet x.com connecté n'a été vu.
   */
  account: string | null;
  /** Comptes X vus dans ce navigateur : chacun a son propre état de blocage. */
  accounts: Record<string, Account>;
  /** Préfixe des clés de stockage du compte, voir scopePrefix. */
  prefix: string;
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
  /**
   * Comptes de la liste à vérifier auprès de X, une fois par compte X : son
   * état de blocage réel remplace celui que Barrage supposait.
   */
  audit: string[];
  /** Dernière version publiée de l'extension, voir features/updates. */
  latestVersion: string | null;
};

// En stockage, `handles` ne contient que les comptes ajoutés par l'utilisateur.
// La liste partagée est fusionnée à la lecture : la modifier sur GitHub, ou
// dans lists/x.json avant un build, la met à jour chez tous les utilisateurs.
//
// Les résultats sont stockés un par compte, sous `result:<identifiant>` : un
// blocage n'écrit que sa propre clé, sans réécrire ni écraser ceux des autres.
const RESULT_PREFIX = "result:";

// Chaque compte X a son propre état de blocage : un compte bloqué depuis l'un
// ne l'est pas sur l'autre. Ses clés portent le préfixe `acct:<id>/`, sauf
// celles du premier compte vu (`legacy`), qui garde les clés sans préfixe
// d'avant la prise en charge de plusieurs comptes : rien n'est déplacé.
const ACCOUNT_PREFIX_RE = /^acct:\d+\//;

/** Champs de l'état propres à chaque compte X. La liste et les réglages sont communs. */
const ACCOUNT_FIELDS = ["retired", "unblock", "seen", "pauseUntil", "error", "audit"] as const;

type AccountField = (typeof ACCOUNT_FIELDS)[number];

/** Préfixe des clés d'un compte X. */
export function scopePrefix(account: string | null, legacy: string | null): string {
  return account === null || account === legacy ? "" : `acct:${account}/`;
}

/** Champ de l'état porté par une clé de stockage, préfixe de compte retiré. */
function fieldOf(key: string): string {
  const field = key.replace(ACCOUNT_PREFIX_RE, "");
  return field.startsWith(RESULT_PREFIX) ? "results" : field;
}

export const resultKey = (handle: string, prefix = ""): string => prefix + RESULT_PREFIX + handle;

/** Compte dont la clé de stockage porte le résultat, pour le compte X de ce préfixe, ou null. */
export function resultHandle(key: string, prefix = ""): string | null {
  const start = prefix + RESULT_PREFIX;
  return key.startsWith(start) ? key.slice(start.length) : null;
}

/** Résultats à écrire, sous leurs clés de stockage. */
export function resultEntries(results: Results, prefix = ""): Record<string, unknown> {
  return Object.fromEntries(Object.entries(results).map(([handle, result]) => [resultKey(handle, prefix), result]));
}

/**
 * Valeurs à écrire, les champs propres à un compte X sous les clés de ce
 * compte. Les autres clés (liste, réglages) sont écrites telles quelles.
 */
export function scoped(prefix: string, values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      (ACCOUNT_FIELDS as readonly string[]).includes(key) ? prefix + (key as AccountField) : key,
      value,
    ]),
  );
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
  "audit",
  "account",
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

/**
 * Tout l'état en une lecture, valeurs corrompues ramenées aux défauts.
 * @param account compte X à lire ; par défaut, le dernier connecté sur x.com
 */
export async function getState(account?: string | null): Promise<State> {
  const stored = (await chrome.storage.local.get(null)) as Record<string, unknown>;
  const current = account ?? (typeof stored.account === "string" ? stored.account : null);
  const prefix = scopePrefix(current, typeof stored.legacy === "string" ? stored.legacy : null);
  const results: Results = Object.create(null);
  for (const [key, value] of Object.entries(stored)) {
    const handle = resultHandle(key, prefix);
    if (handle !== null && isRecord(value)) results[handle] = value as Result;
  }
  const own = (field: AccountField) => stored[prefix + field];
  const added = strings(stored.handles);
  const remote = Array.isArray(stored.remote) ? strings(stored.remote) : null;
  const pauseUntil = own("pauseUntil");
  const error = own("error");
  return {
    account: current,
    accounts: isRecord(stored.accounts) ? (stored.accounts as Record<string, Account>) : {},
    prefix,
    handles: [...new Set([...(remote ?? DEFAULT_HANDLES), ...added])],
    added,
    remote,
    retired: strings(own("retired")),
    disabled: strings(stored.disabled),
    unblock: strings(own("unblock")),
    results,
    seen: strings(own("seen")),
    notify: stored.notify !== false,
    pauseUntil: typeof pauseUntil === "number" ? pauseUntil : 0,
    error: isRecord(error) ? (error as BlockingError) : null,
    audit: strings(own("audit")),
    latestVersion: typeof stored.latestVersion === "string" ? stored.latestVersion : null,
  };
}

/** Préfixe des clés d'un compte X, sans lire tout l'état ; par défaut, le dernier connecté. */
export async function prefixFor(account?: string | null): Promise<string> {
  const { account: current, legacy } = await chrome.storage.local.get({ account: null, legacy: null });
  const resolved = account ?? (typeof current === "string" ? current : null);
  return scopePrefix(resolved, typeof legacy === "string" ? legacy : null);
}

export type StateChanges = { [key: string]: chrome.storage.StorageChange };

/**
 * Appelle `listener` à chaque écriture de l'une des clés données, ou de
 * n'importe quelle clé si la liste est omise. Un champ propre à un compte X
 * déclenche l'appel quel que soit le compte.
 */
export function onStateChange(listener: (changes: StateChanges) => void, keys?: readonly StateKey[]): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const fields = new Set(Object.keys(changes).map(fieldOf));
    if (!keys || keys.some((key) => fields.has(key))) listener(changes);
  });
}

/**
 * Résultats avant et après une écriture, limités aux comptes modifiés, pour
 * le compte X de ce préfixe.
 */
export function resultChanges(changes: StateChanges, prefix = ""): { before: Results; after: Results } {
  const before: Results = Object.create(null);
  const after: Results = Object.create(null);
  for (const [key, change] of Object.entries(changes)) {
    const handle = resultHandle(key, prefix);
    if (handle === null) continue;
    if (isRecord(change.oldValue)) before[handle] = change.oldValue as Result;
    if (isRecord(change.newValue)) after[handle] = change.newValue as Result;
  }
  return { before, after };
}
