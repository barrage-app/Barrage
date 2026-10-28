// Panneau d'un réseau pas encore pris en charge : la liste seule, en lecture.
import { element, fromTemplate, part } from "../../ui/dom.ts";
import type { Network } from "../networks/networks.ts";
import { profileLink } from "./row.ts";
import { createFilter } from "./filter.ts";
import template from "./upcoming.html";

export function mountUpcoming(container: HTMLElement, network: Network): void {
  container.append(fromTemplate(template));
  part(container, "message").textContent =
    `Le blocage sur ${network.label} n'est pas encore pris en charge. Ces comptes seront bloqués ` +
    "dès son arrivée, avec les mêmes réglages que pour X.";
  const input = part<HTMLInputElement>(container, "search");
  input.setAttribute("aria-label", `Rechercher un compte ${network.label}`);
  const rows = part(container, "rows");
  rows.replaceChildren(
    ...network.defaults.map((handle) => {
      const tr = element(
        "tr",
        {},
        element("td", {}, profileLink(network.id, handle)),
        element("td", { className: "warn", textContent: "Bientôt disponible" }),
      );
      tr.dataset.handle = handle;
      return tr;
    }),
  );
  const filter = createFilter(rows, part(container, "no-match"));
  input.addEventListener("input", () => filter.setQuery(input.value));
}
