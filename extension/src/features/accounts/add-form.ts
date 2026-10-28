// Formulaire « Ajouter des comptes » : un ou plusieurs comptes séparés par
// des espaces, virgules ou points-virgules.
import { fromTemplate, part } from "../../ui/dom.ts";
import { parseInput } from "./handles.ts";
import { write } from "../../core/write.ts";
import template from "./add-form.html";

/** « @a, @b et @c », tronqué au-delà de quelques noms. */
function names(handles: readonly string[], prefix = "@"): string {
  const shown = handles.slice(0, 5).map((h) => prefix + h);
  const more = handles.length - shown.length;
  const list = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} et ${shown.at(-1)}` : (shown[0] ?? "");
  return more > 0 ? `${shown.join(", ")} et ${more} autre(s)` : list;
}

export function mountAddForm(container: HTMLElement): void {
  container.append(fromTemplate(template));
  const form = part<HTMLFormElement>(container, "form");
  const input = part<HTMLInputElement>(container, "input");
  const status = part(container, "status");

  function report(message: string, kind: "ok" | "warn" | "error"): void {
    status.textContent = message;
    status.className = `add-status ${kind}`;
  }

  async function add(): Promise<void> {
    const { handles, invalid } = parseInput(input.value);
    if (!handles.length && !invalid.length) return;
    const { added, existing } = handles.length ? await write("addHandles", handles) : { added: [], existing: [] };

    const parts: string[] = [];
    if (added.length) parts.push(`${added.length} compte(s) ajouté(s) : ${names(added)}.`);
    if (existing.length) parts.push(`Déjà dans la liste : ${names(existing)}.`);
    if (invalid.length) parts.push(`Comptes invalides : ${names(invalid, "")}.`);
    report(parts.join(" "), invalid.length && !added.length ? "error" : added.length ? "ok" : "warn");

    // Seules les entrées invalides restent dans le champ, pour être corrigées.
    input.value = invalid.join(" ");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void add();
  });
}
