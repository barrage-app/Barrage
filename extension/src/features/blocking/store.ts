// Écritures du moteur de blocage : résultats, file de déblocage, pause imposée
// par X et erreur bloquante. Toutes visent un compte X : celles qui reçoivent
// un préfixe de clés l'exigent ; celles qui reçoivent un compte visent par
// défaut le dernier connecté sur x.com.
import { RUNNER_GRACE_MS } from "../../core/config.ts";
import {
  accountStates,
  accountsOf,
  active,
  getState,
  readState,
  readStorage,
  resultEntries,
  resultKey,
  scoped,
  type BlockingError,
  type ErrorReason,
} from "../../core/state.ts";
import { failure, isBlocked, isPending, resultOf, type Result, type Results } from "./queue.ts";

/**
 * Enregistre des résultats en une écriture, avec d'autres champs à écrire en
 * même temps. Seules les clés de ces comptes sont écrites.
 * @param prefix préfixe des clés du compte X, voir State.prefix
 */
export async function setResults(prefix: string, entries: Results, extra: Record<string, unknown> = {}): Promise<void> {
  await chrome.storage.local.set({ ...resultEntries(entries, prefix), ...scoped(prefix, extra) });
}

/** Déblocage terminé (ou sans objet) : le compte sort de la file. */
export async function finishUnblock(
  handle: string,
  result: Result | null,
  extra: Record<string, unknown> = {},
  account?: string | null,
): Promise<void> {
  const { unblock, retired, prefix } = await getState(account);
  await setResults(prefix, result ? { [handle]: result } : {}, {
    unblock: unblock.filter((h) => h !== handle),
    retired: retired.filter((h) => h !== handle),
    ...extra,
  });
}

/** Échec d'un blocage : le compteur de tentatives progresse, d'après le résultat enregistré. */
export async function recordBlockFailure(
  handle: string,
  message: string,
  at: number,
  account?: string | null,
): Promise<void> {
  const { results, prefix } = await getState(account);
  await setResults(prefix, { [handle]: failure(resultOf(results, handle), message, at) });
}

/**
 * Déblocage refusé par X : le compte sort de la file quand même, un refus se
 * répéterait à l'identique. Il reste bloqué, marqué pour que « Débloquer »
 * permette de réessayer.
 */
export async function refuseUnblock(handle: string, message: string, account?: string | null): Promise<void> {
  const previous = resultOf((await getState(account)).results, handle);
  await finishUnblock(
    handle,
    previous ? { ...previous, unblockFailed: true, message } : null,
    { error: errorValue(`Déblocage de @${handle} impossible : ${message}`, "other", 0) },
    account,
  );
}

export async function setPauseUntil(prefix: string, pauseUntil: number): Promise<void> {
  await chrome.storage.local.set(scoped(prefix, { pauseUntil }));
}

/**
 * Erreur qui empêche tout blocage, ou null quand le blocage reprend.
 * @param prefix préfixe des clés du compte X, voir State.prefix
 * @param expectedMs délai avant le prochain essai, qui prolonge l'affichage ;
 *   Infinity pour une erreur qui arrête le traitement, affichée jusqu'à sa résolution
 * @param session empreinte de la session X, pour une erreur de session
 */
export async function setError(
  prefix: string,
  message: string | null,
  reason: ErrorReason = "other",
  expectedMs = 0,
  session?: string,
): Promise<void> {
  const error = message ? errorValue(message, reason, expectedMs, session) : null;
  await chrome.storage.local.set(scoped(prefix, { error }));
}

function errorValue(message: string, reason: ErrorReason, expectedMs: number, session?: string): BlockingError {
  const at = Date.now();
  const staleAt = Number.isFinite(expectedMs) ? at + expectedMs + RUNNER_GRACE_MS : Number.MAX_SAFE_INTEGER;
  return { message, reason, staleAt, at, ...(session ? { session } : {}) };
}

/**
 * Comptes de la liste que X montre comme déjà bloqués par l'utilisateur
 * (page « Comptes bloqués », profil visité) : marqués « bloqué avant Barrage »,
 * sans aucune requête à X. Un compte bloqué par Barrage garde son état.
 */
export async function markAlreadyBlocked(handles: readonly string[], account?: string | null): Promise<void> {
  const state = await getState(account);
  const listed = new Set(state.handles);
  const at = Date.now();
  const entries: Results = Object.create(null);
  for (const handle of handles) {
    if (listed.has(handle) && isPending(resultOf(state.results, handle))) entries[handle] = { state: "already_blocked", at };
  }
  const marked = new Set(Object.keys(entries));
  if (!marked.size) return;
  await setResults(state.prefix, entries, { seen: state.seen.filter((h) => !marked.has(h)) });
}

/**
 * Onglet x.com connecté au compte X `account` : il devient le compte affiché
 * dans les options. Un compte encore jamais vu reçoit son propre état, et
 * toute la liste à vérifier auprès de X (voir State.audit). Le premier compte
 * vu reprend l'état d'avant la prise en charge de plusieurs comptes, vérifié
 * de même : il mêlait les blocages de tous les comptes du navigateur.
 */
export async function useAccount(account: string, handle: string | null): Promise<void> {
  const stored = await readStorage();
  const accounts = { ...accountsOf(stored) };
  const known = Object.hasOwn(accounts, account);
  const values: Record<string, unknown> = {};
  if (stored.account !== account) values.account = account;
  if (typeof stored.legacy !== "string") values.legacy = account;
  if (!known || (handle && accounts[account]?.handle !== handle)) {
    accounts[account] = handle ? { handle } : (accounts[account] ?? {});
    values.accounts = accounts;
  }
  if (!known) {
    // Une seule écriture : un compte connu a toujours sa vérification en place.
    // Le préfixe lu ici reste valable une fois le compte enregistré, voir scopePrefix.
    const state = readState(stored, account);
    Object.assign(values, scoped(state.prefix, { audit: active(state) }));
  }
  if (Object.keys(values).length) await chrome.storage.local.set(values);
}

/**
 * Compte bloqué par Barrage d'après l'état commun d'avant la prise en charge
 * de plusieurs comptes, repris sans préfixe par le premier compte X vu. Avant,
 * Barrage bloquait la liste sur chaque compte du navigateur : un compte qu'il
 * y notait bloqué l'a très probablement été par lui sur les autres aussi.
 * Lecture d'une seule clé par compte : pas de parcours de tout le stockage.
 */
function inheritedBlock(stored: Record<string, unknown>): (handle: string) => boolean {
  if (typeof stored.legacy !== "string") return () => false;
  return (handle) => (stored[resultKey(handle)] as Result | undefined)?.state === "blocked";
}

/**
 * Vérification d'un paquet de comptes auprès de X (voir State.audit) : un
 * compte que X montre bloqué l'est, un compte que X montre non bloqué ne l'est
 * pas, quoi que Barrage ait enregistré. X ne dit pas qui a bloqué : un blocage
 * inconnu de Barrage compte comme fait par l'utilisateur, sauf s'il figure
 * dans l'état commun d'avant (voir inheritedBlocks). Les comptes vérifiés
 * sortent de la liste.
 * @param blocking comptes bloqués d'après X, parmi `found`
 * @param found comptes que X connaît ; les autres gardent leur état
 */
export async function recordAudit(
  batch: readonly string[],
  found: readonly string[],
  blocking: readonly string[],
  extra: Record<string, unknown>,
  account?: string | null,
): Promise<void> {
  // Des tableaux plutôt que des Set : les messages entre contextes ne transportent que du JSON.
  const exists = new Set(found);
  const blocks = new Set(blocking);
  const stored = await readStorage();
  const state = readState(stored, account);
  const inherited = inheritedBlock(stored);
  const at = Date.now();
  const entries: Results = Object.create(null);
  const stale: string[] = [];
  for (const handle of batch) {
    const claimed = isBlocked(resultOf(state.results, handle));
    if (blocks.has(handle)) {
      if (!claimed) entries[handle] = { state: inherited(handle) ? "blocked" : "already_blocked", at };
    } else if (exists.has(handle) && claimed) stale.push(handle);
  }
  const done = new Set(batch);
  if (stale.length) await chrome.storage.local.remove(stale.map((h) => resultKey(h, state.prefix)));
  await setResults(state.prefix, entries, { audit: state.audit.filter((h) => !done.has(h)), ...extra });
}

/**
 * Répare les vérifications faites par la version 1.1.0, qui comptaient comme
 * « bloqué avant Barrage » tous les blocages d'un compte X autre que le
 * premier vu : ceux que l'état commun d'avant attribuait à Barrage lui
 * reviennent, pour être débloqués au passage sur Off. Sans requête à X, et
 * sans effet une fois appliquée.
 */
export async function repairInheritedBlocks(): Promise<void> {
  const stored = await readStorage();
  const inherited = inheritedBlock(stored);
  const values: Record<string, unknown> = {};
  for (const { results, prefix } of accountStates(stored)) {
    for (const handle of Object.keys(results)) {
      const result = resultOf(results, handle);
      if (result?.state === "already_blocked" && inherited(handle)) {
        values[resultKey(handle, prefix)] = { ...result, state: "blocked" };
      }
    }
  }
  if (Object.keys(values).length) await chrome.storage.local.set(values);
}
