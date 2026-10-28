// Liste des comptes d'un réseau pris en charge : alerte de fond, progression,
// recherche, filtres par état et tableau.
import { unblockQueue } from "../../core/state.ts";
import { fromTemplate, part, type View } from "../../ui/dom.ts";
import { resultOf } from "../blocking/queue.ts";
import type { Network } from "../networks/networks.ts";
import { renderAlert } from "./alert.ts";
import { mountChips } from "./chips.ts";
import { createFilter } from "./filter.ts";
import { renderProgress } from "./progress.ts";
import { accountRow } from "./row.ts";
import { countCategories, describe, describeDisabled } from "./status.ts";
import template from "./list.html";

export function mountAccountList(container: HTMLElement, network: Network): View {
  container.append(fromTemplate(template));
  const alert = part(container, "alert");
  const progress = part(container, "progress");
  const rows = part(container, "rows");
  const filter = createFilter(rows, part(container, "no-match"));
  const chips = mountChips(part(container, "chips"), (category) => filter.setCategory(category));

  const input = part<HTMLInputElement>(container, "search");
  input.setAttribute("aria-label", `Rechercher un compte ${network.label}`);
  input.addEventListener("input", () => filter.setQuery(input.value));

  // Lignes dessinées, par compte : seules celles dont l'état change sont
  // remplacées, pour garder le focus clavier, le défilement et les boutons
  // déjà cliqués.
  let drawn = new Map<string, { key: string; tr: HTMLTableRowElement }>();
  let order: readonly string[] = [];

  function replaceRow(old: HTMLTableRowElement, next: HTMLTableRowElement): void {
    const focused = document.activeElement;
    const hadFocus = focused instanceof HTMLElement && old.contains(focused);
    const selector = hadFocus && focused.matches("input.switch") ? "input.switch" : "button, input.switch";
    old.replaceWith(next);
    if (hadFocus) next.querySelector<HTMLElement>(selector)?.focus();
  }

  return {
    render(state) {
      renderAlert(alert, state);

      const queued = new Set(state.seen);
      const disabled = new Set(state.disabled);
      const unblocking = new Set(unblockQueue(state));
      const lines = state.handles.map((handle) => {
        const result = resultOf(state.results, handle);
        const enabled = !disabled.has(handle);
        const status = enabled
          ? describe(result, queued.has(handle))
          : describeDisabled(result, unblocking.has(handle));
        return { handle, enabled, status };
      });
      const next = new Map<string, { key: string; tr: HTMLTableRowElement }>();
      for (const { handle, enabled, status } of lines) {
        const key = JSON.stringify([enabled, status]);
        const previous = drawn.get(handle);
        if (previous?.key === key) next.set(handle, previous);
        else {
          const tr = accountRow(network.id, handle, enabled, status);
          if (previous) replaceRow(previous.tr, tr);
          next.set(handle, { key, tr });
        }
      }
      // Liste modifiée (ajout de comptes) : on redessine l'ordre complet.
      const sameOrder = order.length === state.handles.length && state.handles.every((h, i) => h === order[i]);
      if (!sameOrder) rows.replaceChildren(...[...next.values()].map((row) => row.tr));
      drawn = next;
      order = state.handles;

      const counts = countCategories(lines.map((l) => l.status));
      renderProgress(progress, counts);
      chips.render(counts);
      filter.apply();
    },
  };
}
