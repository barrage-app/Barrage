// Filtrage d'une liste déjà dessinée, par texte et par catégorie, sans toucher
// aux données. `apply` est rappelé après chaque nouveau rendu de la liste.
import type { Category } from "./status.ts";

/** « @Nom » et « nom » cherchent la même chose. */
export function normalizeQuery(text: string): string {
  return text.trim().replace(/^@/, "").toLowerCase();
}

export type Filter = {
  setQuery(text: string): void;
  setCategory(category: Category | null): void;
  apply(): void;
};

/** Lignes attendues : `tr[data-handle]`, et `data-category` pour le filtre par catégorie. */
export function createFilter(rows: HTMLElement, noMatch: HTMLElement): Filter {
  let query = "";
  let category: Category | null = null;

  function apply(): void {
    let shown = 0;
    for (const tr of rows.querySelectorAll<HTMLTableRowElement>("tr")) {
      const match =
        (!query || (tr.dataset.handle ?? "").includes(query)) && (!category || tr.dataset.category === category);
      tr.hidden = !match;
      if (match) shown++;
    }
    const filtered = query || category;
    noMatch.hidden = !filtered || shown > 0;
    noMatch.textContent = query
      ? `Aucun compte ne correspond à « ${query} ».`
      : "Aucun compte dans cette catégorie.";
  }

  return {
    setQuery(text) {
      query = normalizeQuery(text);
      apply();
    },
    setCategory(next) {
      category = next;
      apply();
    },
    apply,
  };
}
