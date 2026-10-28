// Le blocage passe par la session X de l'utilisateur, disponible seulement dans
// un onglet x.com. Ce module garantit qu'un tel onglet existe quand les options
// demandent un blocage ou un déblocage, et en ouvre un en arrière-plan sinon.
import { PING, isPingRequest, type PingReply } from "../../core/messages.ts";
import { signedIn } from "./api.ts";

export const X_TABS = ["https://x.com/*", "https://twitter.com/*"];

/**
 * Options : état des onglets x.com dont le content script répond. "connected" :
 * l'un d'eux a une session X ; "logged_out" : aucun. Après un rechargement de
 * l'extension, les onglets déjà ouverts n'ont plus de script vivant, d'où le
 * ping plutôt qu'une simple recherche d'onglet.
 */
export async function xTabStatus(): Promise<"none" | "logged_out" | "connected"> {
  const tabs = (await chrome.tabs.query({ url: X_TABS })).filter((tab) => tab.id !== undefined);
  const pings = tabs.map((tab) =>
    chrome.tabs.sendMessage(tab.id as number, { type: PING }).then(
      (reply: unknown) => reply as PingReply | undefined,
      () => undefined,
    ),
  );
  // Un onglet sans script vivant ne répond rien.
  const replies = (await Promise.all(pings)).filter((reply) => reply !== undefined);
  if (replies.some((reply) => reply.session)) return "connected";
  return replies.length ? "logged_out" : "none";
}

/** Onglet ouvert par wakeXTab, le temps que son script réponde aux pings. */
let opened: { id: number; at: number } | null = null;
const OPEN_GRACE_MS = 30_000;
let waking: Promise<void> | null = null;

async function openedTabStillLoading(): Promise<boolean> {
  if (!opened || Date.now() - opened.at > OPEN_GRACE_MS) return false;
  return chrome.tabs.get(opened.id).then(
    () => true,
    () => false,
  );
}

/**
 * Options : un onglet vivant suffit, il prendra la file ; sinon en ouvrir un
 * sans le focus. Plusieurs clics rapprochés n'ouvrent qu'un seul onglet.
 */
export function wakeXTab(): Promise<void> {
  waking ??= (async () => {
    if ((await xTabStatus().catch(() => "none")) !== "none") return;
    if (await openedTabStillLoading()) return;
    const tab = await chrome.tabs.create({ url: "https://x.com/home", active: false }).catch(() => null);
    if (tab?.id !== undefined) opened = { id: tab.id, at: Date.now() };
  })().finally(() => {
    waking = null;
  });
  return waking;
}

/** Content script : se déclarer vivant auprès des options, avec l'état de la session. */
export function answerPings(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: PingReply) => void) => {
    if (!isPingRequest(message)) return false;
    sendResponse({ session: signedIn() });
    return false;
  });
}
