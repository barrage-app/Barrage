// État de traitement de la liste : quels comptes restent à bloquer. Fonctions
// pures, couvertes par les tests.
import { NOT_FOUND_RETRY_MS } from "../../core/config.ts";

/** Au-delà, un compte en échec n'est plus retenté sans action de l'utilisateur. */
export const MAX_ATTEMPTS = 3;

/**
 * "blocked" : bloqué par Barrage. "already_blocked" : X a indiqué que le compte
 * était déjà bloqué, Barrage n'a rien envoyé. "unblocked" : bloqué par Barrage
 * puis débloqué par lui, après désactivation du compte dans les options.
 */
export type ResultState = "blocked" | "already_blocked" | "unblocked" | "not_found" | "failed";

export type Result = {
  state: ResultState;
  /** Horodatage de la dernière tentative, en millisecondes. */
  at: number;
  message?: string;
  /** Nombre de tentatives échouées, renseigné pour l'état "failed". */
  attempts?: number;
  /**
   * État "blocked" : X a refusé de débloquer ce compte. Il n'est plus retenté
   * automatiquement, seul un clic sur « Débloquer » relance la demande.
   */
  unblockFailed?: boolean;
};

/** Résultats indexés par identifiant minuscule. */
export type Results = Record<string, Result>;

/**
 * Lecture protégée : "constructor" ou "toString" sont des identifiants X
 * valides, et `results[handle]` renverrait alors une méthode du prototype.
 */
export function resultOf(results: Results, handle: string): Result | undefined {
  return Object.hasOwn(results, handle) ? results[handle] : undefined;
}

/**
 * Compte encore à bloquer. Un compte débloqué le redevient s'il est réactivé ;
 * un compte introuvable (suspendu, désactivé) le redevient au bout de
 * NOT_FOUND_RETRY_MS, et n'est retenté que s'il réapparaît dans le fil.
 */
export function isPending(result: Result | undefined, now = Date.now()): boolean {
  if (!result || result.state === "unblocked") return true;
  if (result.state === "not_found") return now - result.at >= NOT_FOUND_RETRY_MS;
  return result.state === "failed" && (result.attempts ?? 1) < MAX_ATTEMPTS;
}

/** Comptes que Barrage traite : la liste moins ceux désactivés dans les options. */
export function activeHandles(handles: readonly string[], disabled: readonly string[]): string[] {
  const off = new Set(disabled);
  return handles.filter((h) => !off.has(h));
}

/**
 * Comptes à traiter : ceux vus dans le fil ou demandés à la main, dans l'ordre
 * où ils sont apparus. Un compte vu mais retiré de la liste n'est pas traité.
 */
export function eligible(handles: readonly string[], seen: readonly string[]): string[] {
  const inList = new Set(handles);
  return [...new Set(seen)].filter((h) => inList.has(h));
}

/** Comptes encore à bloquer parmi ceux donnés, dans le même ordre. */
export function pendingIn(handles: readonly string[], results: Results): string[] {
  return handles.filter((handle) => isPending(resultOf(results, handle)));
}

/** Prochain compte à bloquer, dans l'ordre donné. */
export function nextPending(handles: readonly string[], results: Results): string | undefined {
  return handles.find((handle) => isPending(resultOf(results, handle)));
}

/**
 * Comptes à vérifier auprès de X avant tout blocage : encore à bloquer, et
 * pas vérifiés par cet onglet depuis `maxAgeMs`. L'utilisateur a pu bloquer
 * le compte à la main entre-temps : Barrage le compterait alors comme bloqué
 * par lui, et le débloquerait au passage sur Off.
 * @param checked horodatage de la dernière vérification, par compte
 */
export function uncheckedPending(
  handles: readonly string[],
  results: Results,
  checked: ReadonlyMap<string, number>,
  now: number,
  maxAgeMs: number,
): string[] {
  return handles.filter((h) => isPending(resultOf(results, h), now) && now - (checked.get(h) ?? -Infinity) >= maxAgeMs);
}

/** Résultat après un échec : le compteur de tentatives progresse. */
export function failure(previous: Result | undefined, message: string, now: number): Result {
  const attempts = previous?.state === "failed" ? (previous.attempts ?? 1) + 1 : 1;
  return { state: "failed", at: now, message, attempts };
}

/** Compte bloqué sur X, par Barrage ou déjà avant lui. */
export function isBlocked(result: Result | undefined): boolean {
  return result?.state === "blocked" || result?.state === "already_blocked";
}

/**
 * Comptes bloqués par Barrage parmi ceux donnés. Un compte que l'utilisateur
 * bloquait avant Barrage n'en fait pas partie : il n'est jamais débloqué.
 */
export function blockedByBarrage(handles: readonly string[], results: Results): string[] {
  return handles.filter((h) => resultOf(results, h)?.state === "blocked");
}

/**
 * Comptes passés à « bloqué par Barrage » entre deux versions des résultats.
 * Un compte déjà bloqué avant Barrage n'en fait pas partie, ni un compte déjà
 * bloqué attribué ensuite à Barrage (voir repairInheritedBlocks).
 */
export function newlyBlocked(before: Results, after: Results): string[] {
  return blockedByBarrage(Object.keys(after), after).filter((h) => !isBlocked(resultOf(before, h)));
}

/** Comptes passés de « bloqué par Barrage » à « débloqué » entre deux versions. */
export function newlyUnblocked(before: Results, after: Results): string[] {
  return Object.keys(after).filter(
    (h) => resultOf(after, h)?.state === "unblocked" && resultOf(before, h)?.state === "blocked",
  );
}
