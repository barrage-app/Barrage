import assert from "node:assert/strict";
import { test } from "node:test";
import { RATE_LIMIT_FALLBACK_MS } from "../src/core/config.ts";
import { classify, noUserMatch, readLookup } from "../src/features/blocking/outcome.ts";

const NOW = 1_700_000_000_000;
const err = (code: number, message = "x") => ({ errors: [{ code, message }] });

test("une réponse 200 avec l'utilisateur vaut blocage", () => {
  assert.deepEqual(classify(200, { id_str: "1", screen_name: "a" }, null, NOW), { kind: "ok" });
});

test("compte inexistant ou suspendu : introuvable", () => {
  assert.equal(classify(404, err(34), null, NOW).kind, "not_found");
  assert.equal(classify(403, err(50), null, NOW).kind, "not_found");
  assert.deepEqual(classify(403, err(63), null, NOW), { kind: "not_found", message: "Compte suspendu." });
});

test("la limite suit l'en-tête de réinitialisation", () => {
  const reset = String(NOW / 1000 + 600);
  assert.deepEqual(classify(429, err(88), reset, NOW), { kind: "rate_limited", until: NOW + 600_000 });
});

test("une limite sans en-tête exploitable attend la durée par défaut", () => {
  const expected = { kind: "rate_limited", until: NOW + RATE_LIMIT_FALLBACK_MS };
  assert.deepEqual(classify(429, null, null, NOW), expected);
  assert.deepEqual(classify(429, null, "abc", NOW), expected);
  // Réinitialisation déjà passée : relancer aussitôt reprendrait la limite.
  assert.deepEqual(classify(429, null, String(NOW / 1000 - 10), NOW), expected);
});

test("le code 88 dans un 200 reste une limite", () => {
  assert.equal(classify(200, err(88), null, NOW).kind, "rate_limited");
});

test("session absente, expirée ou compte verrouillé : arrêt global", () => {
  assert.equal(classify(401, null, null, NOW).kind, "auth");
  assert.equal(classify(403, err(353), null, NOW).kind, "auth");
  assert.equal(classify(403, err(326), null, NOW).kind, "auth");
});

test("une erreur serveur est passagère", () => {
  assert.equal(classify(503, null, null, NOW).kind, "network");
});

test("un autre refus est un échec propre au compte, message de X conservé", () => {
  assert.deepEqual(classify(403, err(999, "Interdit"), null, NOW), { kind: "failed", message: "Interdit" });
  assert.deepEqual(classify(400, null, null, NOW), { kind: "failed", message: "Refus de X (HTTP 400)." });
});

test("la vérification repère les comptes déjà bloqués, casse ignorée", () => {
  const lookup = readLookup([
    { screen_name: "DejaBloque", connections: ["blocking"] },
    { screen_name: "Libre", connections: ["none"] },
    { screen_name: "Suivi", connections: ["following", "muting"] },
  ]);
  assert.deepEqual([...(lookup?.blocking ?? [])], ["dejabloque"]);
  assert.deepEqual([...(lookup?.found ?? [])], ["dejabloque", "libre", "suivi"]);
});

test("un compte absent de la réponse n'est pas compté comme existant", () => {
  const lookup = readLookup([{ screen_name: "a", connections: [] }, { connections: ["blocking"] }]);
  assert.deepEqual([...(lookup?.found ?? [])], ["a"]);
  assert.equal(lookup?.blocking.size, 0);
});

test("une réponse qui n'est pas une liste est illisible", () => {
  assert.equal(readLookup({ errors: [] }), null);
  assert.equal(readLookup(null), null);
});

test("un 200 sans corps JSON ne vaut pas blocage", () => {
  assert.equal(classify(200, null, null, NOW).kind, "failed");
});

test("un soupçon d'automatisation met tout en pause", () => {
  assert.deepEqual(classify(403, err(226), null, NOW), { kind: "rate_limited", until: NOW + RATE_LIMIT_FALLBACK_MS });
});

test("un refus qui vise tout le compte arrête le traitement", () => {
  assert.equal(classify(403, err(64), null, NOW).kind, "auth");
  assert.equal(classify(403, err(261), null, NOW).kind, "auth");
  assert.equal(classify(401, err(89), null, NOW).kind, "auth");
});

test("seul le code 17 dit qu'aucun compte du paquet n'existe", () => {
  assert.equal(noUserMatch(err(17)), true);
  assert.equal(noUserMatch(err(34)), false);
  assert.equal(noUserMatch(null), false);
});
