import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { DEFAULT_HANDLES } from "../src/features/accounts/defaults.ts";
import { parseHandle } from "../src/features/accounts/handles.ts";
import { active, getState, resultChanges, resultHandle, resultKey, unblockQueue } from "../src/core/state.ts";
import { addHandles, requestBlock, requestUnblock, setEnabled } from "../src/features/accounts/store.ts";
import {
  finishUnblock,
  markAlreadyBlocked,
  recordAudit,
  repairInheritedBlocks,
  useAccount,
} from "../src/features/blocking/store.ts";
import { setNotify } from "../src/features/notifications/store.ts";
import { addSeen } from "../src/features/timeline/store.ts";

/**
 * Faux chrome.storage.local. Le vrai `get` prend un objet de valeurs par défaut
 * et ne renvoie la valeur stockée que si la clé existe : le stub reproduit ce
 * contrat, c'est lui que le code sous test exerce.
 */
let store: Record<string, unknown>;

/** Remplace les résultats enregistrés, stockés un par compte. */
function putResults(results: Record<string, unknown>): void {
  for (const key of Object.keys(store)) if (resultHandle(key) !== null) delete store[key];
  for (const [handle, result] of Object.entries(results)) store[resultKey(handle)] = result;
}

beforeEach(() => {
  store = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (defaults: Record<string, unknown> | null) =>
          defaults === null
            ? { ...store }
            : Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, k in store ? store[k] : v])),
        set: async (values: Record<string, unknown>) => {
          Object.assign(store, values);
        },
        remove: async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete store[key];
        },
      },
    },
  };
});

test("une installation neuve part de la liste par défaut", async () => {
  assert.deepEqual((await getState()).handles, DEFAULT_HANDLES);
});

test("les comptes par défaut s'ajoutent à une liste déjà enregistrée", async () => {
  // Cas réel : installation antérieure, liste enregistrée avant l'ajout de
  // nouveaux comptes par défaut. Ils doivent apparaître sans réinstaller.
  store.handles = ["ancien", DEFAULT_HANDLES[0]];
  const { handles } = await getState();
  assert.deepEqual(handles, [...DEFAULT_HANDLES, "ancien"]);
});

test("des comptes ajoutés rejoignent la fin de la liste, une seule fois", async () => {
  const first = await addHandles(["un", "deux", "un", DEFAULT_HANDLES[0] ?? ""]);
  assert.deepEqual(first, { added: ["un", "deux"], existing: [DEFAULT_HANDLES[0]] });
  assert.deepEqual(await addHandles(["deux", "trois"]), { added: ["trois"], existing: ["deux"] });
  const { handles } = await getState();
  assert.deepEqual(handles.slice(-3), ["un", "deux", "trois"]);
  assert.equal(handles.length, DEFAULT_HANDLES.length + 3);
});
test("la liste par défaut est déjà normalisée et sans doublon", () => {
  // Une entrée en majuscules ne correspondrait jamais à la clé de son résultat.
  for (const handle of DEFAULT_HANDLES) assert.equal(parseHandle(handle), handle);
  assert.equal(new Set(DEFAULT_HANDLES).size, DEFAULT_HANDLES.length);
});

test("la file des comptes vus ne garde que des comptes de la liste encore à bloquer", async () => {
  store.handles = ["a", "b", "c"];
  putResults({ b: { state: "blocked", at: 1 } });
  await addSeen(["a", "b", "hors_liste", "a"]);
  assert.deepEqual((await getState()).seen, ["a"]);

  // Une fois bloqué, le compte sort de la file au prochain ajout.
  putResults({ a: { state: "blocked", at: 2 } });
  await addSeen(["c"]);
  assert.deepEqual((await getState()).seen, ["c"]);
});

test("bloquer à la main place le compte en tête de file", async () => {
  store.seen = ["a", "b"];
  await requestBlock("b");
  assert.deepEqual((await getState()).seen, ["b", "a"]);
});

test("bloquer à la main oublie un échec définitif pour retenter", async () => {
  putResults({ a: { state: "failed", at: 1, attempts: 3 }, b: { state: "blocked", at: 1 } });
  await requestBlock("a");
  const state = await getState();
  assert.deepEqual({ ...state.results }, { b: { state: "blocked", at: 1 } });
  assert.deepEqual(state.seen, ["a"]);
});

test("bloquer à la main un compte déjà bloqué ne change rien", async () => {
  putResults({ a: { state: "already_blocked", at: 1 } });
  await requestBlock("a");
  assert.deepEqual((await getState()).seen, []);
});

test("les notifications sont actives par défaut et se désactivent", async () => {
  assert.equal((await getState()).notify, true);
  await setNotify(false);
  assert.equal((await getState()).notify, false);
});

test("désactiver un compte bloqué par Barrage le met en file de déblocage", async () => {
  putResults({ a: { state: "blocked", at: 1 } });
  store.seen = ["a", "b"];
  await setEnabled("a", false);
  const state = await getState();
  assert.deepEqual(state.disabled, ["a"]);
  assert.deepEqual(unblockQueue(state), ["a"]);
  assert.deepEqual(state.seen, ["b"]);
  assert.equal(active(state).includes("a"), false);
});

test("un blocage qui aboutit après le passage sur Off est débloqué quand même", async () => {
  await setEnabled("a", false);
  putResults({ a: { state: "blocked", at: 2 } });
  assert.deepEqual(unblockQueue(await getState()), ["a"]);
});

test("un déblocage refusé par X n'est relancé qu'à la main", async () => {
  store.disabled = ["a"];
  putResults({ a: { state: "blocked", at: 1, unblockFailed: true } });
  assert.deepEqual(unblockQueue(await getState()), []);
  await requestUnblock("a");
  assert.deepEqual(unblockQueue(await getState()), ["a"]);
});

test("un compte bloqué avant Barrage n'est jamais débloqué", async () => {
  putResults({ a: { state: "already_blocked", at: 1 } });
  await setEnabled("a", false);
  assert.deepEqual(unblockQueue(await getState()), []);
});

test("réactiver un compte annule son déblocage pas encore fait", async () => {
  putResults({ a: { state: "blocked", at: 1 } });
  await setEnabled("a", false);
  await setEnabled("a", true);
  const state = await getState();
  assert.deepEqual(state.disabled, []);
  assert.deepEqual(unblockQueue(state), []);
});

test("« Bloquer » relance un compte débloqué puis réactivé", async () => {
  putResults({ a: { state: "unblocked", at: 1 } });
  await requestBlock("a");
  const state = await getState();
  assert.deepEqual(state.seen, ["a"]);
  assert.equal(state.results.a, undefined);
});

test("un déblocage terminé sort de la file et enregistre le résultat", async () => {
  store.unblock = ["a", "b"];
  await finishUnblock("a", { state: "unblocked", at: 2 });
  const state = await getState();
  assert.deepEqual(state.unblock, ["b"]);
  assert.deepEqual(state.results.a, { state: "unblocked", at: 2 });
});

test("un compte désactivé vu dans le fil n'entre pas dans la file", async () => {
  store.handles = ["a"];
  store.disabled = ["a"];
  await addSeen(["a"]);
  assert.deepEqual((await getState()).seen, []);
});

test("débloquer à la main vaut aussi pour un compte bloqué avant Barrage", async () => {
  putResults({ a: { state: "already_blocked", at: 1 } });
  store.seen = ["a", "b"];
  await requestUnblock("a");
  const state = await getState();
  assert.deepEqual(state.disabled, ["a"]);
  assert.deepEqual(state.unblock, ["a"]);
  assert.deepEqual(state.seen, ["b"]);
});

test("un compte retiré de la liste partagée que Barrage a bloqué est débloqué", async () => {
  store.remote = ["b"];
  store.retired = ["a", "c"];
  putResults({ a: { state: "blocked", at: 1 }, c: { state: "already_blocked", at: 1 } });
  const state = await getState();
  assert.deepEqual(state.handles, ["b"]);
  assert.deepEqual(unblockQueue(state), ["a"]);
});

test("un compte remis dans la liste partagée n'est plus à débloquer", async () => {
  store.remote = ["a"];
  store.retired = ["a"];
  putResults({ a: { state: "blocked", at: 1 } });
  assert.deepEqual(unblockQueue(await getState()), []);
});

test("un déblocage terminé sort aussi les comptes retirés de la file", async () => {
  store.retired = ["a"];
  await finishUnblock("a", { state: "unblocked", at: 2 });
  assert.deepEqual((await getState()).retired, []);
});

test("un compte vu comme déjà bloqué sur X passe sur « bloqué avant Barrage »", async () => {
  store.remote = ["a", "b", "c"];
  putResults({ b: { state: "blocked", at: 1 } });
  store.seen = ["a"];
  await markAlreadyBlocked(["a", "b", "hors_liste"]);
  const state = await getState();
  assert.equal(state.results.a?.state, "already_blocked");
  // Un compte bloqué par Barrage garde son état, un compte hors liste est ignoré.
  assert.equal(state.results.b?.state, "blocked");
  assert.equal(state.results.hors_liste, undefined);
  assert.deepEqual(state.seen, []);
});

test("chaque résultat est stocké sous sa propre clé", async () => {
  await markAlreadyBlocked([DEFAULT_HANDLES[0] ?? ""]);
  assert.equal((store[resultKey(DEFAULT_HANDLES[0] ?? "")] as { state: string }).state, "already_blocked");
  assert.equal("results" in store, false);
});

test("un compte introuvable depuis longtemps qui réapparaît dans le fil est retenté", async () => {
  store.handles = ["a", "b"];
  putResults({ a: { state: "not_found", at: 0 }, b: { state: "not_found", at: Date.now() } });
  await addSeen(["a", "b"]);
  assert.deepEqual((await getState()).seen, ["a"]);
});

test("« Bloquer » relance un compte introuvable", async () => {
  putResults({ a: { state: "not_found", at: 1 } });
  await requestBlock("a");
  const state = await getState();
  assert.equal(state.results.a, undefined);
  assert.deepEqual(state.seen, ["a"]);
});

test("un déblocage demandé à la main reste dû après la sortie du compte de la liste", async () => {
  store.remote = ["b"];
  store.unblock = ["a"];
  putResults({ a: { state: "already_blocked", at: 1 } });
  assert.deepEqual(unblockQueue(await getState()), ["a"]);
  await finishUnblock("a", { state: "unblocked", at: 2 });
  assert.deepEqual(unblockQueue(await getState()), []);
});

test("le premier compte X vu garde l'état existant, à vérifier auprès de X", async () => {
  store.remote = ["a", "b"];
  putResults({ a: { state: "blocked", at: 1 } });
  store.seen = ["b"];
  await useAccount("1", "moi");
  const state = await getState();
  assert.equal(state.account, "1");
  assert.equal(state.prefix, "");
  assert.equal(state.results.a?.state, "blocked");
  assert.deepEqual(state.seen, ["b"]);
  assert.deepEqual(state.audit, ["a", "b"]);
  assert.deepEqual(state.accounts, { "1": { handle: "moi" } });
});

test("un second compte X a son propre état, sans les blocages du premier", async () => {
  store.remote = ["a", "b"];
  await useAccount("1", "un");
  putResults({ a: { state: "blocked", at: 1 } });
  await useAccount("2", "deux");
  const second = await getState();
  assert.equal(second.account, "2");
  assert.deepEqual({ ...second.results }, {});
  assert.deepEqual(second.audit, ["a", "b"]);

  // Écrits pendant que le second compte est connecté, ils ne touchent pas le premier.
  await requestBlock("b");
  await markAlreadyBlocked(["a"]);
  const first = await getState("1");
  assert.deepEqual(first.seen, []);
  assert.equal(first.results.a?.state, "blocked");
  assert.deepEqual((await getState("2")).results.a?.state, "already_blocked");
  assert.deepEqual(store["acct:2/seen"], ["b"]);
});

test("revenir sur un compte X déjà vu ne relance pas sa vérification", async () => {
  await useAccount("1", null);
  store.audit = [];
  await useAccount("2", null);
  await useAccount("1", "un");
  const state = await getState();
  assert.equal(state.account, "1");
  assert.deepEqual(state.audit, []);
  assert.deepEqual(state.accounts["1"], { handle: "un" });
});

test("la vérification auprès de X remplace l'état supposé par l'état réel", async () => {
  store.remote = ["a", "b", "c", "d"];
  await useAccount("1", null);
  putResults({ a: { state: "blocked", at: 1 }, b: { state: "already_blocked", at: 1 }, d: { state: "blocked", at: 1 } });
  await recordAudit(["a", "b", "c", "d"], ["a", "b", "c"], ["b", "c"], {}, "1");
  const state = await getState();
  // Bloqué d'après Barrage mais pas d'après X : à bloquer de nouveau.
  assert.equal(state.results.a, undefined);
  assert.equal(state.results.b?.state, "already_blocked");
  assert.equal(state.results.c?.state, "already_blocked");
  // Inconnu de X (suspendu) : l'état enregistré reste.
  assert.equal(state.results.d?.state, "blocked");
  assert.deepEqual(state.audit, []);
});

test("les changements de résultats se lisent pour un seul compte X", () => {
  const changes = {
    [resultKey("a")]: { newValue: { state: "blocked", at: 1 } },
    [resultKey("b", "acct:2/")]: { newValue: { state: "blocked", at: 1 } },
  };
  assert.deepEqual(Object.keys(resultChanges(changes).after), ["a"]);
  assert.deepEqual(Object.keys(resultChanges(changes, "acct:2/").after), ["b"]);
});

test("sur un autre compte X, un blocage que l'état commun attribuait à Barrage lui revient", async () => {
  store.remote = ["a", "b"];
  await useAccount("1", null);
  putResults({ a: { state: "blocked", at: 1 } });
  await useAccount("2", null);
  await recordAudit(["a", "b"], ["a", "b"], ["a", "b"], {}, "2");
  const second = await getState("2");
  assert.equal(second.results.a?.state, "blocked");
  // Inconnu de l'état commun : l'utilisateur l'a bloqué lui-même, Off ne le débloquera pas.
  assert.equal(second.results.b?.state, "already_blocked");
});

test("la réparation rend à Barrage les blocages hérités marqués « avant Barrage » par la 1.1.0", async () => {
  store.remote = ["a", "b"];
  await useAccount("1", null);
  putResults({ a: { state: "blocked", at: 1 } });
  await useAccount("2", null);
  store[resultKey("a", "acct:2/")] = { state: "already_blocked", at: 5 };
  store[resultKey("b", "acct:2/")] = { state: "already_blocked", at: 5 };
  await repairInheritedBlocks();
  const second = await getState("2");
  assert.deepEqual(second.results.a, { state: "blocked", at: 5 });
  assert.equal(second.results.b?.state, "already_blocked");
  // Le premier compte n'est pas touché.
  assert.equal((await getState("1")).results.a?.state, "blocked");
});

test("réactiver un compte annule son déblocage en attente sur chaque compte X", async () => {
  await useAccount("1", null);
  await useAccount("2", null);
  store.disabled = ["a"];
  store.unblock = ["a", "b"];
  store["acct:2/unblock"] = ["a"];
  await setEnabled("a", true);
  assert.deepEqual(store.disabled, []);
  assert.deepEqual(store.unblock, ["b"]);
  assert.deepEqual(store["acct:2/unblock"], []);
});

test("ce qu'écrit le premier compte avant d'être enregistré lui reste", async () => {
  store.remote = ["a"];
  await addSeen(["a"], "1");
  await useAccount("1", null);
  assert.deepEqual((await getState("1")).seen, ["a"]);
});

test("un nouveau compte X est enregistré et à vérifier en une seule écriture", async () => {
  store.remote = ["a", "b"];
  await useAccount("1", null);
  let writes = 0;
  const set = (globalThis as any).chrome.storage.local.set;
  (globalThis as any).chrome.storage.local.set = async (values: Record<string, unknown>) => {
    writes++;
    await set(values);
  };
  await useAccount("2", "deux");
  assert.equal(writes, 1);
  const second = await getState("2");
  assert.deepEqual(second.audit, ["a", "b"]);
  assert.deepEqual(second.accounts["2"], { handle: "deux" });
});
