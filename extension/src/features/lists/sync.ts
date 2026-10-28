// Service worker : télécharge la liste partagée de X au démarrage puis toutes
// les 6 heures, et compare la liste intégrée à chaque mise à jour de
// l'extension. Un compte retiré de la liste que Barrage avait bloqué est mis
// en file de déblocage ; l'onglet x.com qui traite la file s'en charge.
import { LISTS_REFRESH_MINUTES, LISTS_URL } from "../../core/config.ts";
import { getState, strings, type State } from "../../core/state.ts";
import { DEFAULT_HANDLES } from "../accounts/defaults.ts";
import { compareLists, parseList } from "./remote.ts";
import { serial } from "../../core/writer.ts";

const ALARM = "barrage-lists";
/** Liste intégrée à la version précédente de l'extension. */
const BUNDLED_KEY = "bundled";

/**
 * Remplace la liste partagée `current` par `next` : les comptes retirés que
 * Barrage a bloqués passent en file de déblocage. Renvoie false si la nouvelle
 * liste est refusée.
 */
async function replaceList(
  state: State,
  current: readonly string[],
  next: readonly string[],
  extra: Record<string, unknown>,
): Promise<boolean> {
  const update = compareLists(current, next, state.added, state.results);
  if (!update.ok) {
    console.warn("[Barrage] liste partagée ignorée :", update.reason);
    return false;
  }
  const removed = new Set(update.removed);
  // Un déblocage demandé à la main reste dû, voir unblockQueue.
  await chrome.storage.local.set({
    ...extra,
    retired: [...new Set([...state.retired, ...update.retire])],
    // Un compte sorti de la liste quitte aussi la file prioritaire et les réglages qui le visaient.
    seen: state.seen.filter((h) => !removed.has(h)),
    disabled: state.disabled.filter((h) => !removed.has(h)),
  });
  return true;
}

/**
 * Mise à jour de l'extension : tant qu'aucune liste n'est reçue de GitHub, la
 * liste intégrée fait foi, un compte qu'elle ne contient plus est retiré comme
 * il le serait de la liste en ligne.
 */
async function syncBundled(): Promise<void> {
  const stored = await chrome.storage.local.get(BUNDLED_KEY);
  const previous = Array.isArray(stored[BUNDLED_KEY]) ? strings(stored[BUNDLED_KEY]) : null;
  const bundled = { [BUNDLED_KEY]: [...DEFAULT_HANDLES] };
  const state = await getState();
  if (previous && state.remote === null && (await replaceList(state, previous, DEFAULT_HANDLES, bundled))) return;
  await chrome.storage.local.set(bundled);
}

async function refreshList(): Promise<void> {
  if (!LISTS_URL) return;
  let body: unknown;
  try {
    // no-store : GitHub met déjà le fichier en cache quelques minutes.
    const response = await fetch(`${LISTS_URL}/x.json`, { cache: "no-store" });
    if (!response.ok) return;
    body = await response.json();
  } catch {
    return; // Hors ligne ou fichier illisible : la liste en place reste.
  }

  const parsed = parseList(body);
  if (!parsed.ok) {
    console.warn("[Barrage] liste partagée ignorée :", parsed.reason);
    return;
  }
  await serial(async () => {
    const state = await getState();
    await replaceList(state, state.remote ?? DEFAULT_HANDLES, parsed.handles, { remote: parsed.handles });
  });
}

export function syncLists(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void refreshList();
  });
  const schedule = () => {
    void chrome.alarms.create(ALARM, { periodInMinutes: LISTS_REFRESH_MINUTES });
    void refreshList();
  };
  chrome.runtime.onInstalled.addListener(() => void serial(syncBundled).finally(schedule));
  chrome.runtime.onStartup.addListener(schedule);
}
