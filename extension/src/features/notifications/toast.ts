// Notifications « @user vient d'être bloqué » et « @user a été débloqué » sur x.com. Chaque onglet X
// surveille les résultats : le blocage a pu être fait par un autre onglet, et
// c'est dans celui que l'utilisateur regarde que la notification doit paraître.
import { onStateChange, resultChanges } from "../../core/state.ts";
import { element } from "../../ui/dom.ts";
import { write } from "../../core/write.ts";
import { newlyBlocked, newlyUnblocked } from "../blocking/queue.ts";
import "./toast.css";

// Noms repris par toast.css.
const TOAST_STACK_ID = "barrage-toasts";
const TOAST_CLASS = "barrage-toast";
const TOAST_UNDO_CLASS = "barrage-toast-undo";

/** Le temps de lire et, au besoin, de cliquer « Annuler ». */
const TOAST_MS = 8000;
/** Au-delà, les plus anciennes notifications cèdent la place. */
const MAX_TOASTS = 3;

function stack(): HTMLElement {
  let el = document.getElementById(TOAST_STACK_ID);
  if (!el) {
    el = element("div");
    el.id = TOAST_STACK_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.append(el);
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Coche de validation dans un disque, construite sans innerHTML. */
function checkIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const disc = document.createElementNS(SVG_NS, "circle");
  disc.setAttribute("cx", "12");
  disc.setAttribute("cy", "12");
  disc.setAttribute("r", "11");
  disc.setAttribute("fill", "#fff");
  const check = document.createElementNS(SVG_NS, "path");
  check.setAttribute("d", "M7 12.5l3.2 3.2L17 9");
  check.setAttribute("fill", "none");
  check.setAttribute("stroke", "currentColor");
  check.setAttribute("stroke-width", "2.4");
  check.setAttribute("stroke-linecap", "round");
  check.setAttribute("stroke-linejoin", "round");
  svg.append(disc, check);
  return svg;
}

function showToast(handle: string, message: string, undo?: () => void): void {
  const container = stack();
  // Le texte forme un seul bloc : l'écart du flex ne sépare que l'icône du texte.
  const text = element("span", {}, element("b", { textContent: `@${handle}` }), message);
  const toast = element("div", { className: TOAST_CLASS }, checkIcon(), text);
  if (undo) {
    const button = element("button", { className: TOAST_UNDO_CLASS, textContent: "Annuler" });
    button.type = "button";
    button.addEventListener("click", () => {
      undo();
      toast.remove();
    });
    toast.append(button);
  }
  container.append(toast);
  while (container.childElementCount > MAX_TOASTS) container.firstElementChild?.remove();

  const leave = () => {
    toast.classList.add("leaving");
    // Retrait après l'animation de sortie, ou tout de suite si elle n'a pas lieu.
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  };
  // Le compte à rebours s'arrête tant que la souris est dessus : pas de
  // notification qui disparaît au moment de cliquer « Annuler ».
  let timer = setTimeout(leave, TOAST_MS);
  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  toast.addEventListener("mouseleave", () => {
    clearTimeout(timer);
    timer = setTimeout(leave, TOAST_MS / 2);
  });
}

export function watchBlocks(): void {
  onStateChange((changes) => {
    const { before, after } = resultChanges(changes);
    const blocked = newlyBlocked(before, after);
    const unblocked = newlyUnblocked(before, after);
    if (!blocked.length && !unblocked.length) return;
    // Inutile de dessiner dans un onglet que personne ne regarde.
    if (document.visibilityState !== "visible") return;
    void chrome.storage.local.get({ notify: true }).then(({ notify }) => {
      if (notify === false) return;
      // « Annuler » coupe le blocage automatique du compte, ce qui le débloque.
      for (const handle of blocked) {
        showToast(handle, " vient d'être bloqué ! ✊", () => void write("setEnabled", handle, false));
      }
      for (const handle of unblocked) showToast(handle, " a été débloqué");
    });
  }, ["results"]);
}
