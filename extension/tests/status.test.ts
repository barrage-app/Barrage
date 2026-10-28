import assert from "node:assert/strict";
import { test } from "node:test";
import { countCategories, describe, describeDisabled } from "../src/features/accounts/status.ts";

test("un compte jamais bloqué est « Visible » et se bloque à la main", () => {
  const status = describe(undefined, false);
  assert.equal(status.label, "Visible");
  assert.equal(status.tag, "visible");
  assert.equal(status.action, "block");
  assert.equal(status.category, "visible");
});

test("un compte débloqué redevient « Visible »", () => {
  assert.equal(describe({ state: "unblocked", at: 1 }, false).label, "Visible");
});

test("un compte bloqué n'offre que « Débloquer », et précise s'il l'était avant Barrage", () => {
  const byUs = describe({ state: "blocked", at: 1 }, false);
  const before = describe({ state: "already_blocked", at: 1 }, false);
  assert.equal(byUs.label, "Bloqué");
  assert.equal(byUs.note, undefined);
  assert.equal(before.note, "avant Barrage");
  assert.equal(byUs.action, "unblock");
  assert.equal(before.action, "unblock");
});

test("un compte en file n'a pas de bouton", () => {
  assert.equal(describe(undefined, true).action, null);
  assert.equal(describeDisabled({ state: "blocked", at: 1 }, true).action, null);
});

test("un compte sur Off est « Désactivé », sans bouton", () => {
  const status = describeDisabled(undefined, false);
  assert.equal(status.label, "Désactivé");
  assert.equal(status.action, null);
  assert.equal(status.category, "disabled");
});

test("les catégories se répartissent tous les comptes", () => {
  const counts = countCategories([
    describe({ state: "blocked", at: 1 }, false),
    describe(undefined, false),
    describe({ state: "not_found", at: 1 }, false),
    describe({ state: "failed", at: 1, attempts: 3 }, false),
    describeDisabled(undefined, false),
  ]);
  assert.deepEqual(counts, { blocked: 1, visible: 1, problem: 2, disabled: 1 });
});

test("un déblocage refusé reste « Bloqué » sur Off, avec « Débloquer » pour réessayer", () => {
  const status = describeDisabled({ state: "blocked", at: 1, unblockFailed: true }, false);
  assert.equal(status.label, "Bloqué");
  assert.equal(status.note, "déblocage refusé");
  assert.equal(status.action, "unblock");
});
