// Service worker : relève la dernière version publiée de l'extension, aux
// mêmes moments que la liste partagée (voir features/lists/sync.ts).
import { RELEASES_URL } from "../../core/config.ts";
import { parseVersion } from "./version.ts";

/** Hors ligne ou réponse illisible : la version déjà relevée reste. */
export async function checkLatestVersion(): Promise<void> {
  if (!RELEASES_URL) return;
  let body: unknown;
  try {
    const response = await fetch(RELEASES_URL, { cache: "no-store" });
    if (!response.ok) return;
    body = await response.json();
  } catch {
    return;
  }
  const latestVersion = parseVersion((body as { tag_name?: unknown } | null)?.tag_name);
  if (latestVersion) await chrome.storage.local.set({ latestVersion });
}
