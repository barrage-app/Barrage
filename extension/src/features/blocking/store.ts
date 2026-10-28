// Écritures du moteur de blocage : résultats, file de déblocage, pause imposée
// par X et erreur bloquante.
import { RUNNER_GRACE_MS } from "../../core/config.ts";
import { getState, resultEntries, type BlockingError, type ErrorReason } from "../../core/state.ts";
import { failure, isPending, resultOf, type Result, type Results } from "./queue.ts";

/**
 * Enregistre des résultats en une écriture, avec d'autres clés à écrire en
 * même temps. Seules les clés de ces comptes sont écrites.
 */
export async function setResults(entries: Results, extra: Record<string, unknown> = {}): Promise<void> {
  await chrome.storage.local.set({ ...resultEntries(entries), ...extra });
}

/** Déblocage terminé (ou sans objet) : le compte sort de la file. */
export async function finishUnblock(
  handle: string,
  result: Result | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { unblock, retired } = await getState();
  await setResults(result ? { [handle]: result } : {}, {
    unblock: unblock.filter((h) => h !== handle),
    retired: retired.filter((h) => h !== handle),
    ...extra,
  });
}

/** Échec d'un blocage : le compteur de tentatives progresse, d'après le résultat enregistré. */
export async function recordBlockFailure(handle: string, message: string, at: number): Promise<void> {
  const { results } = await getState();
  await setResults({ [handle]: failure(resultOf(results, handle), message, at) });
}

/**
 * Déblocage refusé par X : le compte sort de la file quand même, un refus se
 * répéterait à l'identique. Il reste bloqué, marqué pour que « Débloquer »
 * permette de réessayer.
 */
export async function refuseUnblock(handle: string, message: string): Promise<void> {
  const previous = resultOf((await getState()).results, handle);
  await finishUnblock(handle, previous ? { ...previous, unblockFailed: true, message } : null, {
    error: errorValue(`Déblocage de @${handle} impossible : ${message}`, "other", 0),
  });
}

export async function setPauseUntil(pauseUntil: number): Promise<void> {
  await chrome.storage.local.set({ pauseUntil });
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
): Promise<void> {
  await chrome.storage.local.set({ error: message ? errorValue(message, reason, expectedMs, session) : null });
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
export async function markAlreadyBlocked(handles: readonly string[]): Promise<void> {
  const state = await getState();
  const listed = new Set(state.handles);
  const at = Date.now();
  const entries: Results = Object.create(null);
  for (const handle of handles) {
    if (listed.has(handle) && isPending(resultOf(state.results, handle))) entries[handle] = { state: "already_blocked", at };
  }
  const marked = new Set(Object.keys(entries));
  if (!marked.size) return;
  await setResults(entries, { seen: state.seen.filter((h) => !marked.has(h)) });
}
