// Service worker : assemblage seulement, la logique vit dans features/.
import { watchBadge } from "../features/blocking/badge.ts";
import { repairInheritedBlocks } from "../features/blocking/store.ts";
import { syncLists } from "../features/lists/sync.ts";
import { serial, serveWrites } from "../core/writer.ts";

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
// Une mise à jour de l'extension répare l'état laissé par la 1.1.0.
chrome.runtime.onInstalled.addListener(() => void serial(repairInheritedBlocks));
serveWrites();
watchBadge();
syncLists();
