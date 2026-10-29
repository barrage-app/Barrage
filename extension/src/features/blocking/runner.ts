// Traitement de la liste depuis un onglet X connecté, puis arrêt. Il ne tourne
// que lorsqu'il y a du travail : au chargement de x.com, quand l'utilisateur
// modifie la liste ou les réglages, et quand un compte de la liste apparaît
// dans le fil (voir features/timeline).
//
// Plusieurs onglets X peuvent être ouverts, un seul travaille à la fois grâce à
// un verrou Web Locks, partagé par tous les onglets de l'origine. Les autres
// attendent leur tour : si l'onglet qui travaille est fermé, l'un d'eux reprend.
//
// Chaque compte X a sa propre file et ses propres résultats : le traitement
// suit le compte de la session, relu à chaque tour, puisque changer de compte
// sur x.com vaut pour tous les onglets.
import {
  AUTH_RETRY_MS,
  CHECK_MAX_AGE_MS,
  DELAY_JITTER,
  DELAY_SECONDS,
  LOOKUP_BATCH,
  NETWORK_RETRY_MS,
} from "../../core/config.ts";
import {
  QUEUE_KEYS,
  getState,
  onStateChange,
  queueOrder,
  unblockQueue,
  type Account,
  type BlockingError,
  type State,
} from "../../core/state.ts";
import { accountHandle, accountId, blockUser, lookupBlocking, sessionId, unblockUser } from "./api.ts";
import type { Lookup, Outcome } from "./outcome.ts";
import { nextPending, uncheckedPending, type Result, type Results } from "./queue.ts";
import { write } from "../../core/write.ts";
import { setError, setPauseUntil, setResults } from "./store.ts";
import { contextAlive } from "../../core/context.ts";

const LOCK_NAME = "barrage-queue";

/** Comptes vérifiés auprès de X par cet onglet, non bloqués à ce moment : horodatage de la vérification. */
const checked = new Map<string, number>();
/** Compte X pour lequel `checked` vaut. */
let checkedFor: string | null = null;

/**
 * Déclare le compte X de la session, s'il est nouveau ou n'est plus celui
 * affiché dans les options. Lecture légère : seules deux clés.
 */
async function ensureAccount(account: string | null): Promise<void> {
  if (!account) return;
  const stored = await chrome.storage.local.get({ account: null, accounts: {} });
  const accounts = stored.accounts as Record<string, Account>;
  const handle = accountHandle();
  const known = Object.hasOwn(accounts, account) ? accounts[account] : undefined;
  if (stored.account === account && known && (!handle || known.handle === handle)) return;
  await write("useAccount", account, handle);
}

/**
 * La session a changé de compte X pendant l'appel : sa réponse vaut pour un
 * autre compte que celui dont l'état a été lu, elle est ignorée.
 */
const switched = (account: string | null): boolean => account !== null && accountId() !== account;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jittered(seconds: number): number {
  return seconds * 1000 * (1 + (Math.random() * 2 - 1) * DELAY_JITTER);
}

type Next = { stop: true } | { stop: false; waitMs: number };

const STOP: Next = { stop: true };
const now = (waitMs = 0): Next => ({ stop: false, waitMs });

/** Issue qui concerne tout le traitement, pas le compte visé. */
type GlobalOutcome = Extract<Outcome, { kind: "rate_limited" | "auth" | "network" }>;

const isGlobal = (outcome: { kind: string }): outcome is GlobalOutcome =>
  outcome.kind === "rate_limited" || outcome.kind === "auth" || outcome.kind === "network";

async function handleGlobal(state: State, outcome: GlobalOutcome): Promise<Next> {
  switch (outcome.kind) {
    case "rate_limited":
      // Stocké, pour qu'un autre onglet qui reprendrait le verrou attende aussi.
      await setPauseUntil(outcome.until, state.prefix);
      return now();
    case "auth":
      // L'alerte reste affichée jusqu'à la reprise, voir authCleared.
      await setError(outcome.message, "auth", Infinity, (await sessionId()) ?? undefined, state.prefix);
      return STOP;
    case "network":
      await setError(
        `${outcome.message} Nouvel essai dans une minute.`,
        "network",
        NETWORK_RETRY_MS,
        undefined,
        state.prefix,
      );
      return now(NETWORK_RETRY_MS);
  }
}

/** Demande à X l'état de blocage d'un paquet de comptes, ou décide de la suite si la demande échoue. */
async function lookup(state: State, batch: string[]): Promise<Lookup | Next> {
  const reply = await lookupBlocking(batch);
  if (switched(state.account)) return now();
  if (!("kind" in reply)) return reply;
  if (isGlobal(reply)) return handleGlobal(state, reply);
  // Sans vérification, on risquerait de rebloquer : on s'arrête.
  await setError(`Vérification impossible : ${reply.message}`, "other", Infinity, undefined, state.prefix);
  return STOP;
}

const isNext = (value: Lookup | Next): value is Next => "stop" in value;

/**
 * Vérifie un paquet de comptes de la liste pour un compte X encore jamais
 * vérifié, voir State.audit. Lecture seule : rien n'est modifié côté X.
 */
async function audit(state: State, batch: string[]): Promise<Next> {
  const reply = await lookup(state, batch);
  if (isNext(reply)) return reply;
  const at = Date.now();
  for (const handle of batch) if (reply.found.has(handle) && !reply.blocking.has(handle)) checked.set(handle, at);
  await write("recordAudit", batch, [...reply.found], [...reply.blocking], recovered(state), state.account);
  return now(jittered(DELAY_SECONDS));
}

/** Vérifie un paquet de comptes à bloquer : déjà bloqués, ou introuvables. */
async function check(state: State, batch: string[]): Promise<Next> {
  const reply = await lookup(state, batch);
  if (isNext(reply)) return reply;
  const at = Date.now();
  // Sans prototype : « __proto__ » est un identifiant X valide.
  const entries: Results = Object.create(null);
  for (const handle of batch) {
    if (reply.blocking.has(handle)) entries[handle] = { state: "already_blocked", at };
    else if (!reply.found.has(handle)) {
      entries[handle] = { state: "not_found", at, message: "Compte introuvable ou suspendu." };
    } else checked.set(handle, at);
  }
  await setResults(entries, recovered(state), state.prefix);
  return now();
}

/** L'appel a abouti : une erreur affichée n'est plus d'actualité. */
function recovered(state: State): Record<string, unknown> {
  return state.error ? { error: null } : {};
}

async function block(state: State, handle: string): Promise<Next> {
  const outcome = await blockUser(handle);
  if (switched(state.account)) return now();
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  const at = Date.now();
  if (outcome.kind === "ok") await setResults({ [handle]: { state: "blocked", at } }, recovered(state), state.prefix);
  else if (outcome.kind === "not_found") {
    const result: Result = { state: "not_found", at, message: outcome.message };
    await setResults({ [handle]: result }, recovered(state), state.prefix);
  } else await write("recordBlockFailure", handle, outcome.message, at, state.account);
  // Le délai entre deux blocages ne se raccourcit pas quand la liste change.
  return now(jittered(DELAY_SECONDS));
}

/** Débloque un compte désactivé par l'utilisateur après que Barrage l'a bloqué. */
async function unblock(state: State, handle: string): Promise<Next> {
  const outcome = await unblockUser(handle);
  if (switched(state.account)) return now();
  if (isGlobal(outcome)) return handleGlobal(state, outcome);

  const at = Date.now();
  if (outcome.kind === "failed") await write("refuseUnblock", handle, outcome.message, state.account);
  else {
    const result: Result =
      outcome.kind === "ok" ? { state: "unblocked", at } : { state: "not_found", at, message: outcome.message };
    await write("finishUnblock", handle, result, recovered(state), state.account);
  }
  return now(jittered(DELAY_SECONDS));
}

/**
 * Un tour : une vérification du compte X, un déblocage, une vérification, un
 * blocage, ou l'arrêt. Sans compte à vérifier, à débloquer ni à bloquer (vu
 * dans le fil ou demandé à la main), rien : ni requête à X, ni écriture.
 */
async function step(): Promise<Next> {
  const account = accountId();
  await ensureAccount(account);
  if (account !== checkedFor) {
    checked.clear();
    checkedFor = account;
  }
  const state = await getState(account);
  // Les déblocages demandés passent avant tout nouveau blocage.
  const toUnblock = unblockQueue(state)[0];
  const order = queueOrder(state);
  const toBlock = nextPending(order, state.results);
  if (!toUnblock && !toBlock && !state.audit.length) return STOP;

  const remaining = state.pauseUntil - Date.now();
  if (remaining > 0) return now(remaining);

  // L'état réel du compte X d'abord : il décide de ce qu'il reste à débloquer et à bloquer.
  if (state.audit.length) return audit(state, state.audit.slice(0, LOOKUP_BATCH));
  if (toUnblock) return unblock(state, toUnblock);

  const unchecked = uncheckedPending(order, state.results, checked, Date.now(), CHECK_MAX_AGE_MS);
  if (unchecked.length) return check(state, unchecked.slice(0, LOOKUP_BATCH));
  return block(state, toBlock as string);
}

function hasWork(state: State): boolean {
  return (
    state.audit.length > 0 ||
    unblockQueue(state).length > 0 ||
    nextPending(queueOrder(state), state.results) !== undefined
  );
}

async function run(): Promise<void> {
  while (contextAlive()) {
    let next: Next;
    try {
      next = await step();
    } catch (err) {
      // Contexte invalidé en cours de route : on rend le verrou à un onglet sain.
      if (!contextAlive()) return;
      console.error("[Barrage]", err);
      next = now(NETWORK_RETRY_MS);
    }
    if (next.stop) return;
    await sleep(next.waitMs);
  }
}

let running = false;
/** Une modification est arrivée pendant le traitement : refaire un passage. */
let dirty = false;

/**
 * Erreur de session : ne reprendre qu'au chargement de x.com, avec une
 * nouvelle session (reconnexion) ou après AUTH_RETRY_MS. Un compte verrouillé
 * garde son cookie, sa présence ne prouve rien.
 */
async function authCleared(error: BlockingError, pageLoad: boolean): Promise<boolean> {
  if (!pageLoad) return false;
  const session = await sessionId();
  if (!session) return false;
  const renewed = error.session !== undefined && error.session !== session;
  return renewed || Date.now() - (error.at ?? 0) >= AUTH_RETRY_MS;
}

async function start(pageLoad = false): Promise<void> {
  dirty = true;
  if (running) return;
  const account = accountId();
  await ensureAccount(account);
  const state = await getState(account);
  if (state.error?.reason === "auth") {
    if (!(await authCleared(state.error, pageLoad))) return;
    await setError(null, "other", 0, undefined, state.prefix);
  }
  if (!hasWork(state)) return;
  if (running) return; // un autre appel a démarré pendant la lecture
  running = true;
  // Sans ifAvailable : un onglet qui ne travaille pas attend le verrou, et
  // reprend la file si l'onglet qui la traitait est fermé.
  void navigator.locks
    .request(LOCK_NAME, async () => {
      while (dirty && contextAlive()) {
        dirty = false;
        await run();
      }
    })
    .finally(() => {
      running = false;
    });
}

/** Traite la file maintenant, puis à chaque modification qui la concerne. */
export function startRunner(): void {
  onStateChange(() => void start(), QUEUE_KEYS);
  void start(true);
}
