import { active, getState, scoped } from "../../core/state.ts";
import { pendingIn } from "../blocking/queue.ts";

/**
 * Ajoute des comptes vus dans le fil à la file prioritaire. Ceux qui ne sont
 * plus dans la liste ou déjà traités en sortent : la file reste courte.
 */
export async function addSeen(handles: readonly string[], account?: string | null): Promise<void> {
  const state = await getState(account);
  const { results, seen } = state;
  const inList = new Set(active(state));
  const next = pendingIn([...new Set([...seen, ...handles])].filter((h) => inList.has(h)), results);
  if (next.length === seen.length && next.every((h, i) => h === seen[i])) return;
  await chrome.storage.local.set(scoped(state.prefix, { seen: next }));
}
