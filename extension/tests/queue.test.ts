import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ATTEMPTS,
  activeHandles,
  eligible,
  failure,
  isPending,
  newlyBlocked,
  newlyUnblocked,
  nextPending,
  pendingIn,
  uncheckedPending,
  type Results,
} from "../src/features/blocking/queue.ts";

test("le prochain compte est le premier sans résultat, dans l'ordre de la liste", () => {
  const results: Results = { a: { state: "blocked", at: 1 } };
  assert.equal(nextPending(["a", "b", "c"], results), "b");
  assert.equal(nextPending(["a"], results), undefined);
});

test("un compte introuvable récemment n'est pas retenté", () => {
  const results: Results = { a: { state: "not_found", at: Date.now() } };
  assert.equal(nextPending(["a"], results), undefined);
});

test("un échec est retenté jusqu'au nombre maximal de tentatives", () => {
  let result = failure(undefined, "refus", 1);
  assert.equal(result.attempts, 1);
  assert.equal(nextPending(["a"], { a: result }), "a");
  for (let i = 1; i < MAX_ATTEMPTS; i++) result = failure(result, "refus", 1);
  assert.equal(result.attempts, MAX_ATTEMPTS);
  assert.equal(nextPending(["a"], { a: result }), undefined);
});

test("un nom de méthode du prototype reste un compte à bloquer", () => {
  // Sans lecture protégée, results["constructor"] renverrait Object et le
  // compte serait compté comme traité sans jamais être bloqué.
  assert.equal(nextPending(["constructor", "tostring"], {}), "constructor");
});

test("un compte déjà bloqué avant Barrage n'est pas retenté", () => {
  const results: Results = { a: { state: "already_blocked", at: 1 } };
  assert.equal(nextPending(["a"], results), undefined);
  assert.equal(nextPending(["a", "b"], results), "b");
});

test("les comptes à bloquer partent à la vérification, sauf vérifiés récemment", () => {
  const results: Results = {
    a: { state: "blocked", at: 1 },
    b: { state: "failed", at: 1, attempts: 1 },
    e: { state: "unblocked", at: 1 },
  };
  const checked = new Map([["d", 950], ["f", 800]]);
  assert.deepEqual(uncheckedPending(["a", "b", "c", "d", "e", "f"], results, checked, 1000, 100), ["b", "c", "e", "f"]);
});

test("seuls les comptes vus dans le fil sont traités, dans leur ordre d'apparition", () => {
  assert.deepEqual(eligible(["a", "b", "c"], ["c", "a", "c"]), ["c", "a"]);
  assert.deepEqual(eligible(["a", "b"], []), []);
});

test("un compte vu mais retiré de la liste n'est pas traité", () => {
  assert.deepEqual(eligible(["a"], ["retire"]), []);
});

test("seuls les comptes qui viennent d'être bloqués par Barrage déclenchent une notification", () => {
  const before: Results = { a: { state: "blocked", at: 1 }, b: { state: "failed", at: 1, attempts: 1 } };
  const after: Results = {
    ...before,
    b: { state: "blocked", at: 2 },
    c: { state: "already_blocked", at: 2 },
    d: { state: "blocked", at: 2 },
  };
  assert.deepEqual(newlyBlocked(before, after), ["b", "d"]);
  assert.deepEqual(newlyBlocked(after, after), []);
});

test("un compte désactivé sort des comptes traités", () => {
  assert.deepEqual(activeHandles(["a", "b", "c"], ["b"]), ["a", "c"]);
  assert.deepEqual(activeHandles(["a"], []), ["a"]);
});

test("un compte débloqué redevient à bloquer s'il est réactivé", () => {
  assert.equal(isPending({ state: "unblocked", at: 1 }), true);
  assert.equal(nextPending(["a"], { a: { state: "unblocked", at: 1 } }), "a");
});

test("seul un passage de bloqué par Barrage à débloqué déclenche la notification de déblocage", () => {
  const before: Results = { a: { state: "blocked", at: 1 }, b: { state: "already_blocked", at: 1 } };
  const after: Results = { a: { state: "unblocked", at: 2 }, b: { state: "unblocked", at: 2 } };
  assert.deepEqual(newlyUnblocked(before, after), ["a"]);
  assert.deepEqual(newlyUnblocked(after, after), []);
});

test("pendingIn garde l'ordre et écarte les comptes déjà traités", () => {
  const results = { b: { state: "blocked" as const, at: 1 }, c: { state: "unblocked" as const, at: 1 } };
  assert.deepEqual(pendingIn(["a", "b", "c"], results), ["a", "c"]);
});

test("un compte introuvable n'est retenté qu'au bout d'un jour", () => {
  const day = 24 * 60 * 60_000;
  assert.equal(isPending({ state: "not_found", at: 0 }, day - 1), false);
  assert.equal(isPending({ state: "not_found", at: 0 }, day), true);
  assert.equal(isPending({ state: "blocked", at: 0 }, day), false);
});

test("un compte déjà bloqué attribué ensuite à Barrage n'est pas « vient d'être bloqué »", () => {
  const before: Results = { a: { state: "already_blocked", at: 1 }, b: { state: "failed", at: 1 } };
  const after: Results = { a: { state: "blocked", at: 1 }, b: { state: "blocked", at: 2 } };
  assert.deepEqual(newlyBlocked(before, after), ["b"]);
});
