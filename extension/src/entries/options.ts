// Page d'options : assemblage seulement. Chaque section appartient à sa
// fonctionnalité et se redessine à chaque changement de l'état stocké.
// Les styles importés ici et dans les fonctionnalités forment options.css.
import "../ui/theme.css";
import "../ui/components.css";
import "../ui/header.css";
import "../ui/footer.css";
import { REFRESH_LISTS } from "../core/messages.ts";
import { getState, onStateChange } from "../core/state.ts";
import { mountAccounts } from "../features/accounts/section.ts";
import { mountConnection } from "../features/blocking/connection.ts";
import { mountNotifications } from "../features/notifications/settings.ts";
import type { View } from "../ui/dom.ts";

const section = (id: string) => document.getElementById(id) as HTMLElement;

mountConnection(section("connection"));
const views: View[] = [
  mountNotifications(section("notifications")),
  mountAccounts(section("accounts")),
];

let expiry: ReturnType<typeof setTimeout> | undefined;
const DAY_MS = 24 * 60 * 60_000;

async function refresh(): Promise<void> {
  const state = await getState();
  for (const view of views) view.render(state);
  // Une erreur périmée ou une limite terminée doivent disparaître
  // de l'affichage, même sans nouvelle écriture.
  clearTimeout(expiry);
  const time = Date.now();
  // Une erreur permanente a une échéance infinie : setTimeout la prendrait pour 0.
  const deadlines = [state.error?.staleAt ?? 0, state.pauseUntil].filter(
    (t) => t > time && t - time < DAY_MS,
  );
  if (deadlines.length) expiry = setTimeout(() => void refresh(), Math.min(...deadlines) - time + 50);
}

onStateChange(() => void refresh());
void refresh();
// La liste partagée est revérifiée à chaque ouverture des options ; un
// changement arrive par onStateChange.
void chrome.runtime.sendMessage({ type: REFRESH_LISTS }).catch(() => {});
