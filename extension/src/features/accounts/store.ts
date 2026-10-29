// Écritures de la liste de comptes : ajout, interrupteur « Blocage
// automatique », blocage et déblocage demandés à la main. La liste et les
// interrupteurs valent pour tous les comptes X ; un blocage ou un déblocage
// demandé à la main vise le compte X affiché, le dernier connecté sur x.com.
import { accountStates, getState, readStorage, resultKey, scoped } from "../../core/state.ts";
import { resultOf } from "../blocking/queue.ts";

export type AddResult = { added: string[]; existing: string[] };

/**
 * Ajoute des comptes, déjà normalisés par parseHandle, à la fin de la liste.
 * Ceux qui y sont déjà, ou en double dans la saisie, ne sont ajoutés qu'une fois.
 */
export async function addHandles(handles: readonly string[]): Promise<AddResult> {
  const state = await getState();
  const known = new Set(state.handles);
  const result: AddResult = { added: [], existing: [] };
  for (const handle of new Set(handles)) {
    (known.has(handle) ? result.existing : result.added).push(handle);
  }
  // En stockage, `handles` ne contient que les ajouts de l'utilisateur, voir getState.
  if (result.added.length) await chrome.storage.local.set({ handles: [...state.added, ...result.added] });
  return result;
}

/**
 * Blocage demandé à la main depuis les options : le compte passe en tête de
 * file. Un échec (même après le nombre maximal de tentatives), un déblocage
 * passé ou un « introuvable » (compte peut-être rétabli depuis) est oublié.
 */
export async function requestBlock(handle: string): Promise<void> {
  const { results, seen, prefix } = await getState();
  const previous = resultOf(results, handle);
  if (previous && !["failed", "unblocked", "not_found"].includes(previous.state)) return;
  if (previous) await chrome.storage.local.remove(resultKey(handle, prefix));
  await chrome.storage.local.set(scoped(prefix, { seen: [handle, ...seen.filter((h) => h !== handle)] }));
}

/**
 * Passe un compte sur Off. Un compte que Barrage a bloqué entre de lui-même
 * dans la file de déblocage (voir unblockQueue) ; `forceUnblock` y ajoute
 * aussi un compte bloqué avant Barrage, ou dont le déblocage a été refusé.
 */
async function disable(handle: string, forceUnblock: boolean): Promise<void> {
  const { disabled, unblock, seen, prefix } = await getState();
  await chrome.storage.local.set(
    scoped(prefix, {
      disabled: [...new Set([...disabled, handle])],
      ...(forceUnblock ? { unblock: [...new Set([...unblock, handle])] } : {}),
      seen: seen.filter((h) => h !== handle),
    }),
  );
}

/**
 * Déblocage demandé à la main depuis les options, y compris pour un compte que
 * l'utilisateur bloquait avant Barrage : c'est un choix explicite. Le blocage
 * automatique passe sur Off, sinon Barrage rebloquerait le compte aussitôt.
 */
export const requestUnblock = (handle: string): Promise<void> => disable(handle, true);

/**
 * Active ou désactive un compte. Désactiver un compte que Barrage a bloqué le
 * met en file de déblocage ; un compte que l'utilisateur bloquait déjà avant
 * Barrage n'est jamais débloqué. Réactiver annule un déblocage pas encore
 * fait, sur chaque compte X : l'interrupteur vaut pour tous.
 */
export async function setEnabled(handle: string, enabled: boolean): Promise<void> {
  if (!enabled) return disable(handle, false);
  const states = accountStates(await readStorage());
  const values: Record<string, unknown> = { disabled: states[0]?.disabled.filter((h) => h !== handle) ?? [] };
  for (const { unblock, prefix } of states) {
    if (unblock.includes(handle)) Object.assign(values, scoped(prefix, { unblock: unblock.filter((h) => h !== handle) }));
  }
  await chrome.storage.local.set(values);
}
