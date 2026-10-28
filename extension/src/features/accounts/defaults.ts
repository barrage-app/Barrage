// Liste par défaut de X, lue au build dans lists/x.json à la racine du dépôt :
// c'est le même fichier que Barrage pourra charger depuis GitHub. Identifiants
// en minuscules, comme ceux que produit parseHandle. Toujours présents dans la
// liste, voir core/state.ts : en ajouter les fait apparaître chez tous les
// utilisateurs.
import x from "../../../../lists/x.json" with { type: "json" };

export const DEFAULT_HANDLES: readonly string[] = x;
