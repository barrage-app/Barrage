// Appels à l'API interne de X, celle qu'utilise le site lui-même.
// C'est le point qui casse si X change son API : un seul fichier à relire.
import { handleFromUserNameText } from "../timeline/authors.ts";
import { classify, noUserMatch, readLookup, type Lookup, type Outcome } from "./outcome.ts";

/**
 * Jeton public du client web de X, identique pour tous les visiteurs et présent
 * dans le code du site. Il identifie l'application, pas l'utilisateur : c'est
 * le cookie de session qui porte l'identité.
 */
const WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const BLOCK_PATH = "/i/api/1.1/blocks/create.json";
const UNBLOCK_PATH = "/i/api/1.1/blocks/destroy.json";
const LOOKUP_PATH = "/i/api/1.1/friendships/lookup.json";

function cookie(name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(document.cookie);
  return match?.[1] ?? null;
}

/** Le cookie ct0 sert de jeton anti-CSRF, X exige de le recopier en en-tête. */
const readCsrfToken = (): string | null => cookie("ct0");

/**
 * Un compte X est connecté dans cet onglet. Le cookie twid porte son
 * identifiant ; à défaut, le bouton de compte de la barre latérale n'existe
 * que pour un compte connecté.
 */
export function signedIn(): boolean {
  return cookie("twid") !== null || document.querySelector(ACCOUNT_BUTTON_SELECTOR) !== null;
}

/** Identifiant @ du compte connecté, affiché dans les options, ou null tant que la barre latérale n'est pas là. */
export function accountHandle(): string | null {
  return handleFromUserNameText(document.querySelector(ACCOUNT_BUTTON_SELECTOR)?.textContent ?? "");
}

/**
 * Identifiant numérique du compte X connecté, lu à chaque appel : changer de
 * compte sur x.com change le cookie twid (« u=123… ») de tous les onglets.
 */
export function accountId(): string | null {
  // Valeur encodée ou non, entre guillemets ou non : « u%3D123 », « "u=123" ».
  return /^"?u(?:=|%3D)(\d+)"?$/i.exec(cookie("twid") ?? "")?.[1] ?? null;
}

let loadedAccount: string | null | undefined;

/**
 * Compte X connecté au chargement de la page, lu au premier appel : le
 * traitement et le fil le demandent dès leur démarrage. Ce que la page affiche
 * (fil, barre latérale) vaut pour lui, même si la session passe ensuite sur
 * un autre compte.
 */
export function pageAccount(): string | null {
  if (loadedAccount === undefined) loadedAccount = accountId();
  return loadedAccount;
}

/** Bouton de compte de la barre latérale : « Nom @identifiant ». */
const ACCOUNT_BUTTON_SELECTOR = '[data-testid="SideNav_AccountSwitcher_Button"]';

/**
 * Empreinte de la session X, ou null sans session. Le jeton lui-même n'est
 * jamais stocké : seule une empreinte courte permet de voir qu'il a changé
 * (reconnexion).
 */
export async function sessionId(): Promise<string | null> {
  const csrf = readCsrfToken();
  if (!csrf) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrf));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Requête de même origine que la page : le cookie de session part avec.
 * Renvoie l'issue classée, et le corps pour qui doit le lire.
 */
async function call(path: string, init: RequestInit): Promise<{ outcome: Outcome; body?: unknown }> {
  const csrf = readCsrfToken();
  if (!csrf) return { outcome: { kind: "auth", message: "Aucune session X : connectez-vous à x.com." } };
  let response: Response;
  try {
    response = await fetch(location.origin + path, {
      ...init,
      credentials: "include",
      headers: {
        authorization: `Bearer ${WEB_BEARER}`,
        "content-type": "application/x-www-form-urlencoded",
        "x-csrf-token": csrf,
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
      },
    });
  } catch {
    return { outcome: { kind: "network", message: "Réseau indisponible." } };
  }
  const body: unknown = await response.json().catch(() => null);
  const outcome = classify(response.status, body, response.headers.get("x-rate-limit-reset"), Date.now());
  return { outcome, body };
}

async function post(path: string, handle: string): Promise<Outcome> {
  const { outcome } = await call(path, {
    method: "POST",
    body: new URLSearchParams({ screen_name: handle, skip_status: "1" }),
  });
  return outcome;
}

export const blockUser = (handle: string): Promise<Outcome> => post(BLOCK_PATH, handle);

/**
 * Débloque un compte. Issue "ok" : le compte est débloqué. Issue "not_found" :
 * compte disparu, rien à débloquer.
 */
export const unblockUser = (handle: string): Promise<Outcome> => post(UNBLOCK_PATH, handle);

export type LookupReply = Lookup | Exclude<Outcome, { kind: "ok" }>;

/**
 * Demande à X lesquels de ces comptes (100 au plus) l'utilisateur bloque déjà.
 * Lecture seule : rien n'est modifié côté X.
 */
export async function lookupBlocking(handles: readonly string[]): Promise<LookupReply> {
  const query = new URLSearchParams({ screen_name: handles.join(",") });
  const { outcome, body } = await call(`${LOOKUP_PATH}?${query}`, { method: "GET" });
  // Seul ce code prouve qu'aucun compte du paquet n'existe. Un autre (route
  // disparue après un changement de l'API…) marquerait à tort 100 comptes introuvables.
  if (noUserMatch(body)) return { found: new Set(), blocking: new Set() };
  if (outcome.kind === "not_found") return { kind: "failed", message: outcome.message };
  if (outcome.kind !== "ok") return outcome;
  return readLookup(body) ?? { kind: "failed", message: "Réponse de X illisible." };
}
