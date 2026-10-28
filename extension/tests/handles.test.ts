import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHandle, parseInput } from "../src/features/accounts/handles.ts";

test("les trois formats donnent le même identifiant minuscule", () => {
  assert.equal(parseHandle("@Exemple_1"), "exemple_1");
  assert.equal(parseHandle("Exemple_1"), "exemple_1");
  assert.equal(parseHandle("https://x.com/Exemple_1"), "exemple_1");
  assert.equal(parseHandle("twitter.com/Exemple_1/status/123?s=20"), "exemple_1");
  assert.equal(parseHandle("https://mobile.twitter.com/exemple_1"), "exemple_1");
});

test("un identifiant hors des règles de X est refusé", () => {
  assert.equal(parseHandle("seize_caracteres"), null);
  assert.equal(parseHandle("tiret-interdit"), null);
  assert.equal(parseHandle("@"), null);
  assert.equal(parseHandle("é"), null);
});

test("une URL de X qui n'est pas un profil est refusée", () => {
  assert.equal(parseHandle("https://x.com/home"), null);
  assert.equal(parseHandle("https://x.com/i/lists/123"), null);
  assert.equal(parseHandle("https://x.com/search?q=a"), null);
});

test("plusieurs comptes séparés par des espaces sont ajoutés ensemble", () => {
  assert.deepEqual(parseInput("@un deux  https://x.com/Trois"), { handles: ["un", "deux", "trois"], invalid: [] });
});

test("virgules et retours à la ligne d'un copier-coller sont acceptés, doublons retirés", () => {
  assert.deepEqual(parseInput("un,deux\n@UN;trois"), { handles: ["un", "deux", "trois"], invalid: [] });
});

test("les entrées invalides sont signalées sans empêcher les autres", () => {
  assert.deepEqual(parseInput("valide pas-valide https://x.com/home"), {
    handles: ["valide"],
    invalid: ["pas-valide", "https://x.com/home"],
  });
  assert.deepEqual(parseInput("   "), { handles: [], invalid: [] });
});
