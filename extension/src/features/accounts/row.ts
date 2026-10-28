// Une ligne de la liste de comptes : interrupteur, lien de profil, état, action.
import { element } from "../../ui/dom.ts";
import { NETWORKS, type NetworkId } from "../networks/networks.ts";
import { blockNow, toggle, unblockNow } from "./actions.ts";
import type { Status } from "./status.ts";

/** Lien vers un profil, ouvert dans un nouvel onglet. */
export function profileLink(network: NetworkId, handle: string): HTMLAnchorElement {
  const entry = NETWORKS.find((n) => n.id === network);
  const link = element("a", { textContent: entry?.display?.(handle) ?? `@${handle}` });
  link.href = entry?.profileUrl(handle) ?? "#";
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function enabledSwitch(handle: string, enabled: boolean): HTMLInputElement {
  const input = element("input", { className: "switch" });
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", `Blocage automatique de @${handle}`);
  input.checked = enabled;
  input.addEventListener("change", () => void toggle(handle, input.checked));
  return input;
}

export function statusCell(status: Status): HTMLTableCellElement {
  const cell = element("td", { className: status.className });
  if (status.tag) {
    cell.append(element("span", { className: `tag ${status.tag}`, textContent: status.label }));
    if (status.note) cell.append(element("span", { className: "note", textContent: status.note }));
  } else {
    cell.textContent = status.label;
  }
  return cell;
}

function actionButton(handle: string, action: "block" | "unblock"): HTMLButtonElement {
  const [label, run] = action === "block" ? ["Bloquer", blockNow] : ["Débloquer", unblockNow];
  const button = element("button", { className: action, textContent: label });
  button.type = "button";
  button.setAttribute("aria-label", `${label} @${handle}`);
  button.addEventListener("click", () => {
    button.disabled = true;
    void run(handle);
  });
  return button;
}

export function accountRow(network: NetworkId, handle: string, enabled: boolean, status: Status): HTMLTableRowElement {
  const tr = element(
    "tr",
    { className: enabled ? "" : "disabled" },
    element("td", { className: "toggle-cell" }, enabledSwitch(handle, enabled)),
    element("td", {}, profileLink(network, handle)),
    statusCell(status),
    element("td", { className: "action" }, ...(status.action ? [actionButton(handle, status.action)] : [])),
  );
  tr.dataset.handle = handle;
  tr.dataset.category = status.category;
  return tr;
}
