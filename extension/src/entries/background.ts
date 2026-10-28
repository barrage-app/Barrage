// Service worker : assemblage seulement, la logique vit dans features/.
import { watchBadge } from "../features/blocking/badge.ts";
import { syncLists } from "../features/lists/sync.ts";
import { serveWrites } from "../core/writer.ts";

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
serveWrites();
watchBadge();
syncLists();
