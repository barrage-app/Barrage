// Analyse des comptes saisis dans les options. Fonctions pures, couvertes par
// les tests.

/** Règle de X : 1 à 15 caractères parmi lettres, chiffres et tiret bas. */
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

const PROFILE_URL_RE = /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)/i;

/** Premiers segments d'URL de X qui ne sont pas des profils. */
export const RESERVED_PATHS = new Set([
  "compose", "explore", "hashtag", "home", "i", "intent", "messages",
  "notifications", "search", "settings", "share",
]);

/**
 * Normalise une entrée en identifiant minuscule, sans @. Accepte `@nom`, `nom`
 * et une URL de profil x.com ou twitter.com. Renvoie null si l'entrée n'est pas
 * un identifiant valide.
 */
export function parseHandle(raw: string): string | null {
  let candidate = raw.trim();
  const url = PROFILE_URL_RE.exec(candidate);
  if (url) {
    candidate = url[1] ?? "";
    if (RESERVED_PATHS.has(candidate.toLowerCase())) return null;
  }
  candidate = candidate.replace(/^@/, "");
  return HANDLE_RE.test(candidate) ? candidate.toLowerCase() : null;
}

export type ParsedInput = { handles: string[]; invalid: string[] };

/**
 * Découpe une saisie de plusieurs comptes, séparés par des espaces (ou des
 * virgules, points-virgules, retours à la ligne, pour un copier-coller).
 */
export function parseInput(text: string): ParsedInput {
  const handles: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue;
    const handle = parseHandle(token);
    if (handle === null) invalid.push(token);
    else if (!handles.includes(handle)) handles.push(handle);
  }
  return { handles, invalid };
}
