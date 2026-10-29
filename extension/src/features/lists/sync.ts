// Service worker : télécharge la liste partagée de X au démarrage, toutes les
// 6 heures et à chaque ouverture des options, et compare la liste intégrée à
// chaque mise à jour de l'extension. Un compte retiré de la liste que Barrage
// avait bloqué est mis en file de déblocage, pour chaque compte X où il
// l'avait bloqué ; l'onglet x.com qui traite la file s'en charge.
import { LISTS_REFRESH_MINUTES, LISTS_URL } from "../../core/config.ts";
import { isRefreshListsRequest } from "../../core/messages.ts";
import { getState, scoped, strings, type State } from "../../core/state.ts";
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
  // Chaque compte X a ses propres blocages : ceux à débloquer se comptent pour chacun.
  const accounts = Object.keys(state.accounts);
  const values: Record<string, unknown> = {
    ...extra,
    // Un compte sorti de la liste quitte aussi les réglages qui le visaient.
    disabled: state.disabled.filter((h) => !removed.has(h)),
  };
  for (const account of accounts.length ? accounts : [null]) {
    const own = await getState(account);
    const { retire } = compareLists(current, next, own.added, own.results) as typeof update;
    Object.assign(
      values,
      scoped(own.prefix, {
        // Un déblocage demandé à la main reste dû, voir unblockQueue.
        retired: [...new Set([...own.retired, ...retire])],
        seen: own.seen.filter((h) => !removed.has(h)),
      }),
    );
  }
  await chrome.storage.local.set(values);
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
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: boolean) => void) => {
    if (!isRefreshListsRequest(message)) return false;
    void refreshList().finally(() => sendResponse(true));
    return true; // réponse asynchrone
  });
  const schedule = () => {
    void chrome.alarms.create(ALARM, { periodInMinutes: LISTS_REFRESH_MINUTES });
    void refreshList();
  };
  chrome.runtime.onInstalled.addListener(() => void serial(syncBundled).finally(schedule));
  chrome.runtime.onStartup.addListener(schedule);
}
