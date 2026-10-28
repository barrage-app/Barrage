// Petits outils DOM partagés par les fonctionnalités de la page d'options.
import type { State } from "../core/state.ts";

/** Un bloc de la page d'options : il se redessine à chaque changement d'état. */
export type View = { render(state: State): void };

/**
 * Gabarit HTML d'une fonctionnalité, embarqué au build. Contenu statique écrit
 * dans le dépôt : jamais de données utilisateur ici, elles passent par textContent.
 */
export function fromTemplate(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}

/** Élément marqué `data-part="name"` dans un gabarit. */
export function part<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const el = root.querySelector<T>(`[data-part="${name}"]`);
  if (!el) throw new Error(`[Barrage] gabarit incomplet : data-part="${name}" manquant`);
  return el;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Pick<HTMLElementTagNameMap[K], "className" | "textContent">> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}
