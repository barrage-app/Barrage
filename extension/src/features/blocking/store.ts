// Écritures du moteur de blocage : résultats, file de déblocage, pause imposée
// par X et erreur bloquante. Toutes visent un compte X : celui donné, ou par
// défaut le dernier connecté sur x.com.
import { RUNNER_GRACE_MS } from "../../core/config.ts";
import {
  active,
  getState,
  resultEntries,
  resultKey,
  scoped,
  type Account,
  type BlockingError,
  type ErrorReason,
} from "../../core/state.ts";
import { failure, isPending, resultOf, type Result, type Results } from "./queue.ts";

/**
 * Enregistre des résultats en une écriture, avec d'autres champs à écrire en
 * même temps. Seules les clés de ces comptes sont écrites.
 * @param prefix préfixe des clés du compte X, voir State.prefix
 */
export async function setResults(entries: Results, extra: Record<string, unknown> = {}, prefix = ""): Promise<void> {
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
  await setResults(
    result ? { [handle]: result } : {},
    {
      unblock: unblock.filter((h) => h !== handle),
      retired: retired.filter((h) => h !== handle),
      ...extra,
    },
    prefix,
  );
}

/** Échec d'un blocage : le compteur de tentatives progresse, d'après le résultat enregistré. */
export async function recordBlockFailure(
  handle: string,
  message: string,
  at: number,
  account?: string | null,
): Promise<void> {
  const { results, prefix } = await getState(account);
  await setResults({ [handle]: failure(resultOf(results, handle), message, at) }, {}, prefix);
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

export async function setPauseUntil(pauseUntil: number, prefix = ""): Promise<void> {
  await chrome.storage.local.set(scoped(prefix, { pauseUntil }));
}

/**
 * Erreur qui empêche tout blocage, ou null quand le blocage reprend.
 * @param expectedMs délai avant le prochain essai, qui prolonge l'affichage ;
 *   Infinity pour une erreur qui arrête le traitement, affichée jusqu'à sa résolution
 * @param session empreinte de la session X, pour une erreur de session
 */
export async function setError(
  message: string | null,
  reason: ErrorReason = "other",
  expectedMs = 0,
  session?: string,
  prefix = "",
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
  await setResults(entries, { seen: state.seen.filter((h) => !marked.has(h)) }, state.prefix);
}

/**
 * Onglet x.com connecté au compte X `account` : il devient le compte affiché
 * dans les options. Un compte encore jamais vu reçoit son propre état, et
 * toute la liste à vérifier auprès de X (voir State.audit). Le premier compte
 * vu reprend l'état d'avant la prise en charge de plusieurs comptes, vérifié
 * de même : il mêlait les blocages de tous les comptes du navigateur.
 */
export async function useAccount(account: string, handle: string | null): Promise<void> {
  const stored = await chrome.storage.local.get({ account: null, legacy: null, accounts: {} });
  const accounts = { ...(stored.accounts as Record<string, Account>) };
  const known = Object.hasOwn(accounts, account);
  const values: Record<string, unknown> = {};
  if (stored.account !== account) values.account = account;
  if (typeof stored.legacy !== "string") values.legacy = account;
  if (!known || (handle && accounts[account]?.handle !== handle)) {
    accounts[account] = handle ? { handle } : (accounts[account] ?? {});
    values.accounts = accounts;
  }
  if (Object.keys(values).length) await chrome.storage.local.set(values);
  if (known) return;
  const state = await getState(account);
  await chrome.storage.local.set(scoped(state.prefix, { audit: active(state) }));
}

/**
 * Vérification d'un paquet de comptes auprès de X (voir State.audit) : un
 * compte que X montre bloqué l'est, un compte que X montre non bloqué ne l'est
 * pas, quoi que Barrage ait enregistré. Les comptes vérifiés sortent de la liste.
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
  const state = await getState(account);
  const at = Date.now();
  const entries: Results = Object.create(null);
  const stale: string[] = [];
  for (const handle of batch) {
    const known = resultOf(state.results, handle)?.state;
    const claimed = known === "blocked" || known === "already_blocked";
    if (blocks.has(handle)) {
      if (!claimed) entries[handle] = { state: "already_blocked", at };
    } else if (exists.has(handle) && claimed) stale.push(handle);
  }
  const done = new Set(batch);
  if (stale.length) await chrome.storage.local.remove(stale.map((h) => resultKey(h, state.prefix)));
  await setResults(entries, { audit: state.audit.filter((h) => !done.has(h)), ...extra }, state.prefix);
}
