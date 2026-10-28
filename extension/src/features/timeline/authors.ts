// Lecture de l'identifiant d'un auteur dans le DOM de X. Fonctions pures sur
// des chaînes, couvertes par les tests.
import { RESERVED_PATHS } from "../accounts/handles.ts";

const PROFILE_HREF_RE = /^\/([A-Za-z0-9_]{1,15})$/;
const AT_HANDLE_RE = /@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/g;

/** `/Nom` → `nom`. Les liens vers `/nom/status/…` ou `/i/…` ne comptent pas. */
export function handleFromHref(href: string | null): string | null {
  const match = href ? PROFILE_HREF_RE.exec(href) : null;
  return match?.[1]?.toLowerCase() ?? null;
}

/** Onglets d'un profil : « /nom/with_replies », « /nom/media »… */
const PROFILE_PATH_RE = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|likes|highlights|articles|affiliates|superfollows))?\/?$/;

/**
 * Compte dont le profil est affiché, d'après le chemin de la page : `/Nom` et
 * ses onglets donnent `nom`. Les pages de X (`/home`, `/settings/…`) et les
 * posts (`/nom/status/…`) ne sont pas des profils.
 */
export function profileHandleFromPath(path: string): string | null {
  const handle = PROFILE_PATH_RE.exec(path)?.[1]?.toLowerCase() ?? null;
  return handle && !RESERVED_PATHS.has(handle) ? handle : null;
}

/**
 * Identifiant d'un bloc « Nom @identifiant · 2 h ». Le nom affiché vient en
 * premier et peut lui-même contenir un « @quelquun » : c'est donc le dernier
 * @ du bloc qui est l'identifiant.
 */
export function handleFromUserNameText(text: string): string | null {
  const matches = [...text.matchAll(AT_HANDLE_RE)];
  return matches.at(-1)?.[1]?.toLowerCase() ?? null;
}
