// Traduction de la réponse de X en décision pour la file. Fonction pure,
// isolée pour être testable.
import { RATE_LIMIT_FALLBACK_MS } from "../../core/config.ts";

export type Outcome =
  /** Réponse 2xx sans erreur : la demande a abouti. */
  | { kind: "ok" }
  /** Compte inexistant ou suspendu : rien à bloquer, inutile de retenter. */
  | { kind: "not_found"; message: string }
  /** Limite atteinte : tout le traitement attend jusqu'à `until`. */
  | { kind: "rate_limited"; until: number }
  /** Session absente, expirée ou compte verrouillé : tout le traitement attend. */
  | { kind: "auth"; message: string }
  /** Panne passagère sans réponse de X : retenter sans compter d'échec. */
  | { kind: "network"; message: string }
  /** Refus propre à ce compte : compté comme une tentative échouée. */
  | { kind: "failed"; message: string };

// Codes d'erreur de l'API v1.1 de X.
const NOT_FOUND_CODES: Record<number, string> = {
  34: "Compte introuvable.",
  50: "Compte introuvable.",
  63: "Compte suspendu.",
};
const RATE_LIMIT_CODE = 88;
const AUTH_CODES: Record<number, string> = {
  32: "Session X absente ou expirée : reconnectez-vous à x.com.",
  215: "Session X absente ou expirée : reconnectez-vous à x.com.",
  326: "Votre compte X est verrouillé : déverrouillez-le sur x.com.",
  353: "Jeton de session X invalide : rechargez l'onglet x.com.",
  // Refus qui visent tout le compte de l'utilisateur, pas le compte à bloquer.
  64: "Votre compte X est suspendu : Barrage ne peut rien bloquer.",
  89: "Jeton de session X expiré : rechargez l'onglet x.com.",
  261: "X n'autorise plus d'actions depuis votre compte pour l'instant.",
};
/** Réponse de `friendships/lookup` quand aucun compte du paquet n'existe, voir noUserMatch. */
const NO_USER_MATCH_CODE = 17;
/** X soupçonne une automatisation : tout s'arrête le temps de la pause par défaut. */
const AUTOMATION_CODE = 226;

type ApiError = { code?: unknown; message?: unknown };

function firstError(body: unknown): { code: number | null; message: string | null } {
  const errors = (body as { errors?: unknown } | null)?.errors;
  const first = (Array.isArray(errors) ? errors[0] : undefined) as ApiError | undefined;
  return {
    code: typeof first?.code === "number" ? first.code : null,
    message: typeof first?.message === "string" ? first.message : null,
  };
}

/** La réponse dit qu'aucun des comptes demandés n'existe, et rien d'autre. */
export function noUserMatch(body: unknown): boolean {
  return firstError(body).code === NO_USER_MATCH_CODE;
}

/**
 * @param resetHeader valeur de `x-rate-limit-reset`, en secondes epoch
 * @param now horodatage courant, en millisecondes
 */
export function classify(status: number, body: unknown, resetHeader: string | null, now: number): Outcome {
  const { code, message } = firstError(body);

  if (code === AUTOMATION_CODE) return { kind: "rate_limited", until: now + RATE_LIMIT_FALLBACK_MS };
  if (status === 429 || code === RATE_LIMIT_CODE) {
    const reset = Number(resetHeader) * 1000;
    // Un en-tête absent, illisible ou déjà passé ne doit pas relancer aussitôt.
    return { kind: "rate_limited", until: reset > now ? reset : now + RATE_LIMIT_FALLBACK_MS };
  }
  if (code !== null && code in NOT_FOUND_CODES) {
    return { kind: "not_found", message: NOT_FOUND_CODES[code] ?? "Compte introuvable." };
  }
  if (code !== null && code in AUTH_CODES) {
    return { kind: "auth", message: AUTH_CODES[code] ?? "Session X invalide." };
  }
  if (status === 401) {
    return { kind: "auth", message: "Session X absente ou expirée : reconnectez-vous à x.com." };
  }
  if (status >= 200 && status < 300 && code === null) {
    // Sans corps JSON (page HTML, réponse vide), rien ne prouve que X a traité la demande.
    return body === null ? { kind: "failed", message: "Réponse de X illisible." } : { kind: "ok" };
  }
  if (status >= 500) return { kind: "network", message: `X indisponible (HTTP ${status}).` };
  return { kind: "failed", message: message ?? `Refus de X (HTTP ${status}).` };
}

export type Lookup = {
  /** Comptes que X connaît, identifiants minuscules. */
  found: Set<string>;
  /** Parmi eux, ceux que l'utilisateur bloque déjà. */
  blocking: Set<string>;
};

/**
 * Lit la réponse de `friendships/lookup` : un objet par compte existant, avec
 * la liste de ses relations à l'utilisateur ("following", "blocking"…). Les
 * comptes inexistants ou suspendus sont absents de la réponse.
 */
export function readLookup(body: unknown): Lookup | null {
  if (!Array.isArray(body)) return null;
  const found = new Set<string>();
  const blocking = new Set<string>();
  for (const entry of body as Array<{ screen_name?: unknown; connections?: unknown }>) {
    if (typeof entry?.screen_name !== "string") continue;
    const handle = entry.screen_name.toLowerCase();
    found.add(handle);
    if (Array.isArray(entry.connections) && entry.connections.includes("blocking")) blocking.add(handle);
  }
  return { found, blocking };
}
