// Onglets des réseaux sociaux : un onglet et un panneau par entrée de NETWORKS.
// Motif ARIA « tabs » : flèches gauche/droite, Début et Fin. Le contenu de
// chaque panneau est fourni par l'appelant.
import { element, fromTemplate } from "../../ui/dom.ts";
import { LOGOS } from "./logos.ts";
import { NETWORKS, toNetworkId, type NetworkId } from "./networks.ts";
import "./tabs.css";

const TAB_KEY = "barrage-tab";

export type Tabs = {
  panels: Record<NetworkId, HTMLElement>;
  setCount(network: NetworkId, count: number): void;
};

export function mountTabs(container: HTMLElement): Tabs {
  const list = element("div", { className: "tabs" });
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Réseaux sociaux");

  const entries = NETWORKS.map((network) => {
    const count = element("span", { className: "tab-count" });
    const tab = element(
      "button",
      { className: "tab" },
      fromTemplate(LOGOS[network.id]),
      element("span", { textContent: network.label }),
      count,
    );
    tab.type = "button";
    tab.id = `tab-${network.id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${network.id}`);

    const panel = element("section");
    panel.id = `panel-${network.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    return { id: network.id, tab, panel, count };
  });
  list.append(...entries.map((e) => e.tab));
  container.append(list, ...entries.map((e) => e.panel));

  function select(index: number, focus = false): void {
    entries.forEach(({ tab, panel }, i) => {
      const selected = i === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
      if (selected && focus) tab.focus();
    });
    // Confort par navigateur seulement : l'onglet ouvert est retrouvé à la prochaine visite.
    try {
      localStorage.setItem(TAB_KEY, entries[index]?.id ?? "x");
    } catch {}
  }

  entries.forEach(({ tab }, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      const last = entries.length - 1;
      const target =
        event.key === "ArrowRight" ? (index + 1) % entries.length
        : event.key === "ArrowLeft" ? (index + last) % entries.length
        : event.key === "Home" ? 0
        : event.key === "End" ? last
        : null;
      if (target === null) return;
      event.preventDefault();
      select(target, true);
    });
  });

  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch {}
  select(Math.max(0, entries.findIndex((e) => e.id === toNetworkId(saved))));

  return {
    panels: Object.fromEntries(entries.map((e) => [e.id, e.panel])) as Record<NetworkId, HTMLElement>,
    setCount(network, count) {
      const entry = entries.find((e) => e.id === network);
      if (entry) entry.count.textContent = String(count);
    },
  };
}
