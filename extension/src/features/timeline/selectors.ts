// Points d'accroche dans le DOM de X. Regroupés ici parce que ce sont eux qui
// cassent lors d'une refonte de leur interface : un seul fichier à relire.

/** Un tweet, y compris dans une conversation ou sur un profil. */
export const TWEET_SELECTOR = 'article[data-testid="tweet"]';
/** Une suggestion de compte (« Vous pourriez aimer », résultats de recherche). */
export const USER_CELL_SELECTOR = '[data-testid="UserCell"]';
/**
 * Bloc nom + @identifiant d'un auteur. Un tweet en contient deux quand il en
 * cite un autre.
 */
export const USER_NAME_SELECTOR = '[data-testid="User-Name"]';

/**
 * Bouton « Débloquer » que X affiche à côté d'un compte que l'utilisateur
 * bloque : dans la page « Comptes bloqués », et sur le profil d'un tel compte.
 * Son data-testid est « <identifiant numérique>-unblock ».
 */
export const UNBLOCK_BUTTON_SELECTOR = '[data-testid$="-unblock"]';
/** En-tête d'un profil : nom affiché et @identifiant du compte visité. */
export const PROFILE_NAME_SELECTOR = '[data-testid="UserName"]';
/** Colonne centrale, celle du profil visité. */
export const PRIMARY_COLUMN_SELECTOR = '[data-testid="primaryColumn"]';

/** Attribut posé sur ce que Barrage masque, voir timeline.css. */
export const HIDDEN_ATTR = "data-barrage-hidden";
