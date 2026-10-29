// Réglages techniques, volontairement absents des options.

/**
 * Délai entre deux blocages. X limite le nombre d'actions par compte et peut
 * restreindre un compte trop rapide : la valeur reste prudente.
 */
export const DELAY_SECONDS = 8;

/** Variation aléatoire appliquée au délai, pour ne pas frapper à cadence fixe. */
export const DELAY_JITTER = 0.3;

/** Attente par défaut quand X signale une limite sans dire jusqu'à quand. */
export const RATE_LIMIT_FALLBACK_MS = 15 * 60_000;

/** Attente après une coupure réseau. */
export const NETWORK_RETRY_MS = 60_000;

/**
 * Après une erreur de session, délai avant de retenter avec la même session.
 * Un compte X verrouillé ou restreint garde son cookie : retenter à chaque
 * compte vu dans le fil le solliciterait au pire moment.
 */
export const AUTH_RETRY_MS = 60 * 60_000;

/**
 * Au-delà, la vérification « déjà bloqué ? » d'un compte est refaite avant de
 * le bloquer : l'utilisateur a pu le bloquer à la main entre-temps.
 */
export const CHECK_MAX_AGE_MS = 2 * 60_000;

/**
 * Un compte introuvable (suspendu, désactivé) qui réapparaît dans le fil est
 * retenté, mais pas avant ce délai : un compte suspendu un temps puis rétabli
 * finit bloqué, sans boucler sur une réponse de X qui ne changerait pas.
 */
export const NOT_FOUND_RETRY_MS = 24 * 60 * 60_000;

/**
 * Marge avant de considérer qu'aucun onglet ne traite la liste. Chrome ralentit
 * les minuteurs des onglets en arrière-plan jusqu'à une minute.
 */
export const RUNNER_GRACE_MS = 2 * 60_000;

/** Comptes vérifiés par requête auprès de X, le maximum qu'accepte l'API. */
export const LOOKUP_BATCH = 100;

// Liste partagée, publiée sur GitHub (dossier lists/ du dépôt, un fichier par réseau).

/**
 * Dossier en ligne des listes, sans barre finale, par exemple
 * "https://raw.githubusercontent.com/<compte>/<dépôt>/main/lists". Vide : pas de
 * téléchargement, seule la liste intégrée à l'extension sert.
 */
export const LISTS_URL = "https://raw.githubusercontent.com/barrage-app/Barrage/main/lists";
/** Intervalle entre deux téléchargements. */
export const LISTS_REFRESH_MINUTES = 6 * 60;
/** Au-delà, une liste reçue est jugée anormale et ignorée. */
export const LIST_MAX_SIZE = 5000;
/**
 * Part maximale de comptes retirés d'un coup. Au-delà, la liste reçue est
 * ignorée : un fichier vidé par erreur ou piraté ne débloque pas tout le monde.
 */
export const LIST_MAX_REMOVED_SHARE = 0.5;

// Mises à jour : Barrage est chargé en mode développeur, sans mise à jour
// automatique. La dernière version publiée sur GitHub est relevée en même
// temps que la liste partagée, pour signaler qu'il faut mettre à jour.

/** Dernière version publiée de l'extension. Vide : pas de vérification. */
export const RELEASES_URL = "https://api.github.com/repos/barrage-app/Barrage/releases/latest";
/** Guide de mise à jour, lien du bandeau des options. */
export const UPDATE_GUIDE_URL = "https://barrage-app.github.io/Barrage/#mise-a-jour";
