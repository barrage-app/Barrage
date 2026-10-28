// Section « Comptes » des options : un onglet par réseau. X, seul réseau pris
// en charge, affiche la liste de l'état et le formulaire d'ajout ; les autres,
// leur liste à venir.
import { fromTemplate, type View } from "../../ui/dom.ts";
import { NETWORKS } from "../networks/networks.ts";
import { mountTabs } from "../networks/tabs.ts";
import "./accounts.css";
import { mountAddForm } from "./add-form.ts";
import { mountAccountList } from "./list.ts";
import { mountUpcoming } from "./upcoming.ts";

export function mountAccounts(container: HTMLElement): View {
  container.append(fromTemplate("<h2>Comptes</h2>"));
  const tabs = mountTabs(container);
  let x: View | undefined;
  for (const network of NETWORKS) {
    const panel = tabs.panels[network.id];
    if (network.id === "x") {
      x = mountAccountList(panel, network);
      mountAddForm(panel);
    } else {
      mountUpcoming(panel, network);
      tabs.setCount(network.id, network.defaults.length);
    }
  }
  return {
    render(state) {
      x?.render(state);
      tabs.setCount("x", state.handles.length);
    },
  };
}
