// Carte de progression : comptes bloqués sur le total, barre segmentée par
// catégorie.
import { element, part } from "../../ui/dom.ts";
import { CATEGORIES, totalCount, type Counts } from "./status.ts";

export function renderProgress(root: HTMLElement, counts: Counts): void {
  const total = totalCount(counts);
  part(root, "blocked").textContent = String(counts.blocked);
  part(root, "total").textContent = `bloqués sur ${total} compte${total > 1 ? "s" : ""}`;

  const bar = part(root, "bar");
  bar.setAttribute(
    "aria-label",
    `${counts.blocked} bloqués, ${counts.visible} visibles, ${counts.problem} problèmes, ${counts.disabled} désactivés`,
  );
  bar.replaceChildren(
    ...CATEGORIES.filter((c) => counts[c] > 0).map((c) => {
      const segment = element("span", { className: `segment ${c}` });
      segment.style.flexGrow = String(counts[c]);
      return segment;
    }),
  );
}
