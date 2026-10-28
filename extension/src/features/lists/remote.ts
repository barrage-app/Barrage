// Lecture d'une liste partagée reçue de GitHub et calcul de ce qui change.
// Fonctions pures, testées dans tests/lists.test.ts.
import { LIST_MAX_REMOVED_SHARE, LIST_MAX_SIZE } from "../../core/config.ts";
import { parseHandle } from "../accounts/handles.ts";
import { resultOf, type Results } from "../blocking/queue.ts";

export type Parsed = { ok: true; handles: string[] } | { ok: false; reason: string };

/**
 * Valide le contenu d'un fichier de liste : un tableau d'identifiants. Les
 * entrées invalides sont écartées une à une ; un fichier vide, trop gros ou
 * qui n'est pas un tableau est refusé en entier.
 */
export function parseList(body: unknown): Parsed {
  if (!Array.isArray(body)) return { ok: false, reason: "le fichier n'est pas une liste" };
  if (body.length > LIST_MAX_SIZE) return { ok: false, reason: `plus de ${LIST_MAX_SIZE} comptes` };
  const handles = [
    ...new Set(body.map((entry) => (typeof entry === "string" ? parseHandle(entry) : null)).filter((h) => h !== null)),
  ];
  if (!handles.length) return { ok: false, reason: "liste vide" };
  return { ok: true, handles };
}

export type Update =
  | { ok: true; removed: string[]; retire: string[] }
  | { ok: false; reason: string };

/**
 * Compare la liste en place à la nouvelle. `removed` : comptes qui en sortent,
 * sauf ceux que l'utilisateur a ajoutés lui-même. `retire` : parmi eux, ceux
 * que Barrage a bloqués, à débloquer. Un compte que l'utilisateur bloquait
 * avant Barrage n'est jamais débloqué.
 */
export function compareLists(
  current: readonly string[],
  next: readonly string[],
  added: readonly string[],
  results: Results,
): Update {
  const kept = new Set([...next, ...added]);
  const removed = current.filter((h) => !kept.has(h));
  if (current.length && removed.length / current.length > LIST_MAX_REMOVED_SHARE) {
    return { ok: false, reason: `${removed.length} comptes retirés d'un coup sur ${current.length}` };
  }
  const retire = removed.filter((h) => resultOf(results, h)?.state === "blocked");
  return { ok: true, removed, retire };
}
