// Content script des onglets x.com : assemblage seulement, la logique vit dans
// features/. Les styles importés ici forment content.css.
import { startRunner } from "../features/blocking/runner.ts";
import { answerPings } from "../features/blocking/x-tab.ts";
import { watchBlocks } from "../features/notifications/toast.ts";
import { watchTimeline } from "../features/timeline/timeline.ts";

answerPings();
startRunner();
watchTimeline();
watchBlocks();
