// Surveillance du fil : dès qu'un compte de la liste apparaît (auteur d'un
// tweet, d'un tweet cité, ou suggestion de compte), son contenu est masqué et
// le compte passe en tête de la file de blocage.
//
// Seul l'auteur compte : un tweet qui mentionne un compte de la liste, ou un
// retweet par un compte hors liste, n'est pas visé par le nom du retweeteur.
//
// La même lecture repère, sans aucune requête à X, les comptes que
// l'utilisateur bloquait déjà : X affiche « Débloquer » à côté d'eux, dans la
// page « Comptes bloqués » comme sur leur profil.
import { contextAlive } from "../../core/context.ts";
import { active, getState, onStateChange, resultChanges, strings, type StateChanges } from "../../core/state.ts";
import { write } from "../../core/write.ts";
import { isPending, resultOf, type Results } from "../blocking/queue.ts";
import { handleFromHref, handleFromUserNameText, profileHandleFromPath } from "./authors.ts";
import {
  HIDDEN_ATTR,
  PRIMARY_COLUMN_SELECTOR,
  PROFILE_NAME_SELECTOR,
  TWEET_SELECTOR,
  UNBLOCK_BUTTON_SELECTOR,
  USER_CELL_SELECTOR,
  USER_NAME_SELECTOR,
} from "./selectors.ts";
import "./timeline.css";

let listed = new Set<string>();
let results: Results = Object.create(null);

/**
 * Comptes à envoyer en une écriture, et ceux déjà envoyés par cet onglet :
 * une écriture par compte, pas par tweet. Un envoi perdu est retenté.
 */
class Batch {
  readonly sent = new Set<string>();
  private pending = new Set<string>();

  constructor(private readonly name: "addSeen" | "markAlreadyBlocked") {}

  add(handle: string): void {
    if (!this.sent.has(handle)) this.pending.add(handle);
  }

  flush(): void {
    if (!this.pending.size) return;
    const batch = [...this.pending];
    this.pending = new Set();
    for (const handle of batch) this.sent.add(handle);
    void write(this.name, batch).catch(() => {
      for (const handle of batch) this.sent.delete(handle);
    });
  }
}

/** Comptes vus dans le fil, à mettre en file. L'écriture réveille le traitement. */
const seenBatch = new Batch("addSeen");
/** Comptes de la liste vus comme déjà bloqués sur X. */
const knownBatch = new Batch("markAlreadyBlocked");

function noteAlreadyBlocked(handle: string): void {
  if (listed.has(handle) && isPending(resultOf(results, handle))) knownBatch.add(handle);
}

/** Profil affiché : celui que l'utilisateur est venu voir, lui seul n'est pas masqué. */
let profile: string | null = null;

/** Profil visité d'un compte que l'utilisateur bloque : X y affiche « Débloquer ». */
function scanProfile(): void {
  const handle = profile;
  if (!handle || !listed.has(handle)) return;
  const column = document.querySelector(PRIMARY_COLUMN_SELECTOR);
  // Pendant un changement de page, l'en-tête du profil précédent reste un
  // moment affiché alors que l'adresse a déjà changé : le bouton ne compte que
  // si l'en-tête affiché est bien celui de ce compte.
  const shown = column?.querySelector(PROFILE_NAME_SELECTOR)?.textContent;
  if (!shown || handleFromUserNameText(shown) !== handle) return;
  const button = column?.querySelector(UNBLOCK_BUTTON_SELECTOR);
  // Un bouton dans une suggestion de compte vise ce compte-là, pas le profil.
  if (button && !button.closest(USER_CELL_SELECTOR)) noteAlreadyBlocked(handle);
}

/** Premier lien vers un profil dans `root`. */
function firstProfileHandle(root: Element): string | null {
  for (const a of root.querySelectorAll("a[href]")) {
    const handle = handleFromHref(a.getAttribute("href"));
    if (handle) return handle;
  }
  return null;
}

function tweetAuthors(article: Element): string[] {
  const authors: string[] = [];
  for (const block of article.querySelectorAll(USER_NAME_SELECTOR)) {
    // L'auteur principal a un lien vers son profil, l'auteur cité seulement du texte.
    const handle = firstProfileHandle(block) ?? handleFromUserNameText(block.textContent ?? "");
    if (handle) authors.push(handle);
  }
  return authors;
}

function cellAuthor(cell: Element): string[] {
  // Premier lien de profil : l'avatar. Les liens de la bio, plus loin, sont des mentions.
  const handle = firstProfileHandle(cell);
  return handle ? [handle] : [];
}

/**
 * Idempotent : X recycle parfois un nœud pour un autre tweet, l'attribut est
 * donc recalculé à chaque passage plutôt que posé une fois pour toutes.
 */
function apply(element: Element, authors: string[]): void {
  const matches = authors.filter((h) => listed.has(h));
  // Écrire seulement si l'état change : une écriture d'attribut réveille les observateurs de X.
  const hide = matches.some((h) => h !== profile);
  if (hide !== element.hasAttribute(HIDDEN_ATTR)) element.toggleAttribute(HIDDEN_ATTR, hide);

  for (const handle of matches) if (isPending(resultOf(results, handle))) seenBatch.add(handle);
}

function scanCell(cell: Element): void {
  const authors = cellAuthor(cell);
  if (cell.querySelector(UNBLOCK_BUTTON_SELECTOR)) {
    // Compte déjà bloqué (page « Comptes bloqués ») : rien à masquer ni à bloquer.
    for (const handle of authors) noteAlreadyBlocked(handle);
    if (cell.hasAttribute(HIDDEN_ATTR)) cell.removeAttribute(HIDDEN_ATTR);
  } else apply(cell, authors);
}

/**
 * Tweets et suggestions qui contiennent `root`, et ceux qu'il contient si
 * `deep`. Le nœud parent d'un ajout n'est relu que vers le haut : c'est
 * souvent tout le fil, dont le reste n'a pas changé.
 */
function scanWithin(root: ParentNode & Node, deep: boolean, done: Set<Element>): void {
  for (const [selector, handle] of [
    [TWEET_SELECTOR, (el: Element) => apply(el, tweetAuthors(el))],
    [USER_CELL_SELECTOR, scanCell],
  ] as const) {
    const around = root instanceof Element ? root.closest(selector) : null;
    const inside = deep ? [...root.querySelectorAll(selector)] : [];
    for (const el of [...(around ? [around] : []), ...inside]) {
      if (done.has(el)) continue;
      done.add(el);
      handle(el);
    }
  }
}

/**
 * Zones du DOM modifiées depuis le dernier passage, ou null pour tout relire :
 * nœud ajouté (relu en entier) ou parent d'un changement (relu vers le haut).
 */
let dirtyRoots: Map<Node, boolean> | null = null;
let lastPath = "";

function markDirty(node: Node, deep: boolean): void {
  if (dirtyRoots && !dirtyRoots.get(node)) dirtyRoots.set(node, deep);
}

function scan(): void {
  // X change de page sans recharger : le profil affiché est relu à chaque
  // passage, et un changement de page, qui change le profil exempté, fait tout relire.
  profile = profileHandleFromPath(location.pathname);
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    dirtyRoots = null;
  }
  const roots = dirtyRoots;
  dirtyRoots = new Map();
  if (!listed.size) {
    // Plus aucun compte suivi : ce qui avait été masqué réapparaît.
    for (const el of document.querySelectorAll(`[${HIDDEN_ATTR}]`)) el.removeAttribute(HIDDEN_ATTR);
    return;
  }
  const done = new Set<Element>();
  if (roots === null) scanWithin(document, true, done);
  else for (const [root, deep] of roots) if (root.isConnected) scanWithin(root as ParentNode & Node, deep, done);
  scanProfile();
  knownBatch.flush();
  seenBatch.flush();
}

let scheduled = false;
function scheduleScan(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

/** Liste suivie changée : tout est relu. */
async function loadList(): Promise<void> {
  const state = await getState();
  // Un compte désactivé n'est plus masqué.
  listed = new Set(active(state));
  results = state.results;
  dirtyRoots = null;
  scheduleScan();
}

/**
 * Résultats ou file changés : rien à masquer de plus ni de moins, seuls les
 * comptes à signaler changent. Ni lecture du stockage, ni relecture de la page.
 */
function onQueueChange(changes: StateChanges): void {
  const { before, after } = resultChanges(changes);
  for (const handle of Object.keys(before)) if (!(handle in after)) delete results[handle];
  Object.assign(results, after);
  // Un compte sorti de la file (traité, désactivé, écriture perdue) pourra être
  // signalé de nouveau s'il réapparaît en attente dans le fil.
  if (changes.seen) {
    const seen = new Set(strings(changes.seen.newValue));
    for (const handle of seenBatch.sent) if (!seen.has(handle)) seenBatch.sent.delete(handle);
  }
}

export function watchTimeline(): void {
  void loadList();
  onStateChange(() => void loadList(), ["handles", "remote", "disabled"]);
  onStateChange(onQueueChange, ["results", "seen"]);
  // Le fil est virtualisé : les tweets entrent et sortent du DOM au défilement.
  const observer = new MutationObserver((records) => {
    // Extension rechargée ou désinstallée : ce script orphelin s'arrête au lieu
    // d'échouer à chaque mutation. Le nouveau script injecté prend le relais.
    if (!contextAlive()) return observer.disconnect();
    // Seules les zones modifiées sont relues, pas toute la page.
    for (const record of records) {
      markDirty(record.target, false);
      for (const node of record.addedNodes) if (node instanceof Element) markDirty(node, true);
    }
    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
