// Seule trace de l'activité de fond qui reste affichée : une erreur qui
// empêche tout blocage, le temps qu'elle soit d'actualité.
import type { ErrorReason, State } from "../../core/state.ts";
import { part } from "../../ui/dom.ts";

const TITLES: Record<ErrorReason, string> = {
  auth: "Session X expirée",
  network: "Réseau indisponible",
  other: "Blocage interrompu",
};

export function renderAlert(root: HTMLElement, state: State): void {
  const error = state.error;
  const current = error !== null && Date.now() < error.staleAt;
  root.hidden = !current;
  if (!current) return;
  part(root, "title").textContent = TITLES[error.reason];
  part(root, "message").textContent = error.message;
}
