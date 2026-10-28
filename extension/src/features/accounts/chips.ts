// Puces de filtre par état : Tous, Bloqués, Visibles, Problèmes, Désactivés.
import { element } from "../../ui/dom.ts";
import { CATEGORIES, totalCount, type Category, type Counts } from "./status.ts";

const LABELS: Record<Category, string> = {
  blocked: "Bloqués",
  visible: "Visibles",
  problem: "Problèmes",
  disabled: "Désactivés",
};

export type Chips = { render(counts: Counts): void };

export function mountChips(container: HTMLElement, onSelect: (category: Category | null) => void): Chips {
  let selected: Category | null = null;
  const entries: { category: Category | null; button: HTMLButtonElement; count: HTMLElement }[] = [];

  for (const category of [null, ...CATEGORIES]) {
    const count = element("span", { className: "count" });
    const button = element(
      "button",
      { className: "chip" },
      element("span", { className: `dot ${category ?? "all"}` }),
      category ? LABELS[category] : "Tous",
      count,
    );
    button.type = "button";
    button.addEventListener("click", () => {
      selected = category;
      for (const entry of entries) entry.button.setAttribute("aria-pressed", String(entry.category === selected));
      onSelect(selected);
    });
    button.setAttribute("aria-pressed", String(category === null));
    entries.push({ category, button, count });
    container.append(button);
  }

  return {
    render(counts) {
      const total = totalCount(counts);
      for (const { category, count } of entries) count.textContent = String(category ? counts[category] : total);
    },
  };
}
