// État affiché d'un compte dans la liste : libellé, pastille, bouton possible,
// et catégorie pour la progression et les filtres. Fonctions pures, testées
// dans tests/status.test.ts.
import { isPending, type Result } from "../blocking/queue.ts";

/** Catégories exclusives : leur somme est le nombre de comptes de la liste. */
export type Category = "blocked" | "visible" | "problem" | "disabled";

export const CATEGORIES: readonly Category[] = ["blocked", "visible", "problem", "disabled"];

/**
 * `tag` : l'état s'affiche en pastille ; `note` le précise à côté.
 * `className` colore un état affiché en texte.
 */
export type Status = {
  label: string;
  className: string;
  action: "block" | "unblock" | null;
  category: Category;
  tag?: "blocked" | "visible";
  note?: string;
};

const text = (
  label: string,
  category: Category,
  className = "",
  action: Status["action"] = null,
): Status => ({ label, className, action, category });

const BLOCKED: Status = { label: "Bloqué", className: "", action: "unblock", category: "blocked", tag: "blocked" };
const BLOCKED_BEFORE: Status = { ...BLOCKED, note: "avant Barrage" };
const UNBLOCKING = text("Déblocage en cours…", "disabled", "muted");
const VISIBLE: Status = { label: "Visible", className: "", action: "block", category: "visible", tag: "visible" };

/**
 * Compte dont le blocage automatique est sur On. « Bloqué » : bloqué par
 * l'extension. « Bloqué avant Barrage » : l'utilisateur le bloquait déjà,
 * Barrage n'a rien envoyé.
 */
export function describe(result: Result | undefined, queued: boolean): Status {
  if (queued && isPending(result)) return text("Blocage en cours…", "visible", "muted");
  switch (result?.state) {
    case "blocked":
      return BLOCKED;
    case "already_blocked":
      return BLOCKED_BEFORE;
    case "not_found":
      return text(result.message ?? "Introuvable", "problem", "warn", "block");
    case "failed":
      return text(`Échec : ${result.message ?? "refus de X"}`, "problem", "error", "block");
    default:
      return VISIBLE;
  }
}

/**
 * Compte dont le blocage automatique est sur Off : Barrage ne le bloque plus.
 * S'il l'avait bloqué, le déblocage est en cours ou fait ; un compte que
 * l'utilisateur bloquait déjà avant Barrage reste bloqué, sauf demande expresse.
 */
export function describeDisabled(result: Result | undefined, unblocking: boolean): Status {
  if (unblocking) return UNBLOCKING;
  switch (result?.state) {
    case "blocked":
      // Hors file de déblocage : X a refusé, « Débloquer » permet de réessayer.
      return { ...BLOCKED, note: "déblocage refusé" };
    case "already_blocked":
      return BLOCKED_BEFORE;
    default:
      return text("Désactivé", "disabled", "muted");
  }
}

export type Counts = Record<Category, number>;

export function countCategories(statuses: readonly Status[]): Counts {
  const counts: Counts = { blocked: 0, visible: 0, problem: 0, disabled: 0 };
  for (const status of statuses) counts[status.category]++;
  return counts;
}

export function totalCount(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}
