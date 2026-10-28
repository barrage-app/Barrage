// Réseaux sociaux affichés en onglets dans les options. X est le seul pris en
// charge aujourd'hui ; les autres sont listés pour préparer leur arrivée.
// Ajouter un réseau : une entrée ici et son logo dans logos.ts ; l'onglet et
// son panneau sont générés.

import instagram from "../../../../lists/instagram.json" with { type: "json" };
import tiktok from "../../../../lists/tiktok.json" with { type: "json" };
import youtube from "../../../../lists/youtube.json" with { type: "json" };
import facebook from "../../../../lists/facebook.json" with { type: "json" };

export type NetworkId = "x" | "instagram" | "tiktok" | "youtube" | "facebook";

export type Network = {
  id: NetworkId;
  label: string;
  profileUrl: (handle: string) => string;
  /** Libellé d'un compte dans la liste, « @nom » par défaut. */
  display?: (handle: string) => string;
  /**
   * Comptes par défaut d'un réseau pas encore pris en charge, lus dans
   * lists/<réseau>.json. Ceux de X passent par accounts/defaults.ts.
   */
  defaults: readonly string[];
};

export const NETWORKS: readonly Network[] = [
  { id: "x", label: "X", profileUrl: (h) => `https://x.com/${h}`, defaults: [] },
  {
    id: "instagram",
    label: "Instagram",
    profileUrl: (h) => `https://www.instagram.com/${h}/`,
    defaults: instagram,
  },
  {
    id: "tiktok",
    label: "TikTok",
    profileUrl: (h) => `https://www.tiktok.com/@${h}`,
    defaults: tiktok,
  },
  {
    id: "youtube",
    label: "YouTube",
    // Identifiant de chaîne « UC… » ou « @nom », voir scripts/split-lists.mjs.
    profileUrl: (h) => (h.startsWith("@") ? `https://www.youtube.com/${h}` : `https://www.youtube.com/channel/${h}`),
    display: (h) => h,
    defaults: youtube,
  },
  {
    id: "facebook",
    label: "Facebook",
    profileUrl: (h) => `https://www.facebook.com/${h}`,
    display: (h) => h,
    defaults: facebook,
  },
];

export function toNetworkId(value: unknown): NetworkId {
  return NETWORKS.some((n) => n.id === value) ? (value as NetworkId) : "x";
}
