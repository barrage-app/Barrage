// Pastille de l'icône de l'extension : « ! » rouge quand une mise à jour est
// disponible, sinon le nombre de comptes en attente de blocage.
import { QUEUE_KEYS, getState, onStateChange, queueOrder } from "../../core/state.ts";
import { updateAvailable } from "../updates/version.ts";
import { pendingIn } from "./queue.ts";

const BLUE = "#1d9bf0";
const RED = "#f4212e";
const TITLE = "Barrage : liste et suivi";

async function refreshBadge(): Promise<void> {
  const state = await getState();
  if (updateAvailable(state.latestVersion)) {
    await chrome.action.setBadgeBackgroundColor({ color: RED });
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({ title: `${TITLE} (mise à jour disponible)` });
    return;
  }
  // Seuls les comptes vus dans le fil ou demandés à la main sont en file.
  const pending = pendingIn(queueOrder(state), state.results).length;
  await chrome.action.setBadgeBackgroundColor({ color: BLUE });
  await chrome.action.setBadgeText({ text: pending > 999 ? "999+" : pending ? String(pending) : "" });
  await chrome.action.setTitle({ title: TITLE });
}

export function watchBadge(): void {
  // La version publiée ne fait pas partie de la file : écoutée à part, pour ne
  // pas réveiller le traitement des onglets x.com.
  onStateChange(() => void refreshBadge(), [...QUEUE_KEYS, "latestVersion"]);
  chrome.runtime.onInstalled.addListener(() => void refreshBadge());
  chrome.runtime.onStartup.addListener(() => void refreshBadge());
}
