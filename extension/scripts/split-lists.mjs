// Trie resources/users.json en un fichier par réseau dans lists/ (à la racine
// du dépôt) : une liste d'identifiants, dans l'ordre du fichier, sans doublons.
// Les entrées « removal » retirent l'entrée qu'elles visent. Seuls les réseaux
// de READY sont écrits : les autres gardent une liste vide tant que Barrage ne
// sait pas y bloquer. Usage :
//   node scripts/split-lists.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseHandle } from "../src/features/accounts/handles.ts";

const SOURCE = "../resources/users.json";
const OUT = "../lists";
/** Réseaux dont la liste est générée. Les autres fichiers sont laissés vides. */
const READY = new Set(["x"]);
/** Comptes à ne jamais mettre dans les listes, quel que soit le fichier source. */
const EXCLUDED = new Set(["ilangabet"]);
/** Comptes ajoutés à la main, absents du fichier source, placés en fin de liste. */
const EXTRA = { x: ["napsarkozy"] };

/** Identifiant d'un profil, par réseau, ou null si l'adresse n'en contient pas. */
const PARSERS = {
  x: (url) => parseHandle(url),
  tiktok: (url) => /tiktok\.com\/@([A-Za-z0-9_.]{2,24})/i.exec(url)?.[1]?.toLowerCase() ?? null,
  instagram: (url) => /instagram\.com\/([A-Za-z0-9_.]{1,30})\/?(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? null,
  facebook: (url) => /facebook\.com\/([A-Za-z0-9.]{5,50})\/?(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase() ?? null,
  // Identifiant de chaîne (sensible à la casse) ou @nom.
  youtube: (url) => {
    const channel = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/.exec(url)?.[1];
    if (channel) return channel;
    const handle = /youtube\.com\/@([A-Za-z0-9_.-]{3,30})/i.exec(url)?.[1];
    return handle ? `@${handle.toLowerCase()}` : null;
  },
};

const { entries } = JSON.parse(readFileSync(SOURCE, "utf8"));
const removed = new Set(entries.filter((e) => e.type === "removal").map((e) => e.target_id));
const lists = Object.fromEntries(Object.keys(PARSERS).map((network) => [network, new Set()]));
const skipped = [];

for (const entry of entries) {
  if (entry.type !== "new" || removed.has(entry.id)) continue;
  const parse = PARSERS[entry.platform];
  const handle = parse ? parse(entry.profile_url ?? "") : null;
  if (!handle) skipped.push(`${entry.platform ?? "?"} « ${entry.name} » : ${entry.profile_url || "sans adresse"}`);
  else if (!EXCLUDED.has(handle.toLowerCase())) lists[entry.platform].add(handle);
}

for (const [network, handles] of Object.entries(lists)) {
  for (const handle of EXTRA[network] ?? []) if (!EXCLUDED.has(handle)) handles.add(handle);
  const list = READY.has(network) ? [...handles] : [];
  writeFileSync(`${OUT}/${network}.json`, JSON.stringify(list, null, 2) + "\n");
  console.log(`${network}.json : ${list.length} comptes${READY.has(network) ? "" : " (réseau pas encore pris en charge)"}`);
}
if (skipped.length) console.log(`\nEntrées ignorées (${skipped.length}) :\n  ${skipped.join("\n  ")}`);
