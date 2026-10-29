import assert from "node:assert/strict";
import { test } from "node:test";
import { isNewer, parseVersion } from "../src/features/updates/version.ts";

test("le tag d'une release donne la version, avec ou sans « v »", () => {
  assert.equal(parseVersion("v1.0.2"), "1.0.2");
  assert.equal(parseVersion("1.0.2"), "1.0.2");
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion(42), null);
});

test("seule une version publiée plus récente est une mise à jour", () => {
  assert.equal(isNewer("1.0.3", "1.0.2"), true);
  assert.equal(isNewer("v2.0.0", "1.9.9"), true);
  // Comparaison numérique, pas alphabétique.
  assert.equal(isNewer("1.0.10", "1.0.9"), true);
  assert.equal(isNewer("1.0.2", "1.0.2"), false);
  // Version de développement en avance sur la release.
  assert.equal(isNewer("1.0.2", "1.1.0"), false);
});

test("une version illisible ou absente ne signale rien", () => {
  assert.equal(isNewer(null, "1.0.2"), false);
  assert.equal(isNewer("n'importe quoi", "1.0.2"), false);
});
