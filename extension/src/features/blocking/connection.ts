// Pastille d'en-tête des options, affichée quand un onglet x.com est prêt à
// bloquer, c'est-à-dire ouvert et connecté à X. Vérifiée à l'ouverture, puis
// quand un onglet change.
import { X_TABS, xTabStatus } from "./x-tab.ts";

const X_ORIGINS = X_TABS.map((pattern) => pattern.replace("*", ""));
const isXUrl = (url: string | undefined) => url !== undefined && X_ORIGINS.some((origin) => url.startsWith(origin));

export function mountConnection(container: HTMLElement): void {
  container.className = "connection";
  container.setAttribute("role", "status");

  /** Onglets x.com connus, pour ne revérifier qu'à la fermeture de l'un d'eux. */
  const xTabs = new Set<number>();

  async function check(): Promise<void> {
    const connected = (await xTabStatus().catch(() => "none")) === "connected";
    container.textContent = connected ? "x.com connecté" : "";
    container.title = connected ? "Un onglet x.com connecté est ouvert : Barrage peut bloquer." : "";
  }

  // Les autres onglets du navigateur ne changent rien à la pastille.
  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (info.status !== "complete") return;
    if (isXUrl(tab.url)) xTabs.add(id);
    else if (!xTabs.delete(id)) return;
    void check();
  });
  chrome.tabs.onRemoved.addListener((id) => {
    if (xTabs.delete(id)) void check();
  });
  void chrome.tabs.query({ url: X_TABS }).then((tabs) => {
    for (const tab of tabs) if (tab.id !== undefined) xTabs.add(tab.id);
  });
  void check();
}
