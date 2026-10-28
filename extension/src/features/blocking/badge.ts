// Nombre de comptes en attente de blocage, affiché sur l'icône de l'extension.
import { QUEUE_KEYS, getState, onStateChange, queueOrder } from "../../core/state.ts";
import { pendingIn } from "./queue.ts";

async function refreshBadge(): Promise<void> {
  // Seuls les comptes vus dans le fil ou demandés à la main sont en file.
  const state = await getState();
  const pending = pendingIn(queueOrder(state), state.results).length;
  await chrome.action.setBadgeText({ text: pending > 999 ? "999+" : pending ? String(pending) : "" });
}

function setup(): void {
  void chrome.action.setBadgeBackgroundColor({ color: "#1d9bf0" });
  void refreshBadge();
}

export function watchBadge(): void {
  onStateChange(() => void refreshBadge(), QUEUE_KEYS);
  chrome.runtime.onInstalled.addListener(setup);
  chrome.runtime.onStartup.addListener(setup);
}
