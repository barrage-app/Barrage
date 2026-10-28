import assert from "node:assert/strict";
import { test } from "node:test";
import { LIST_MAX_SIZE } from "../src/core/config.ts";
import { compareLists, parseList } from "../src/features/lists/remote.ts";

test("une liste valide est normalisée et dédoublonnée", () => {
  assert.deepEqual(parseList(["@Alice", "bob", "alice", "https://x.com/Carol"]), {
    ok: true,
    handles: ["alice", "bob", "carol"],
  });
});

test("les entrées invalides sont écartées une à une", () => {
  assert.deepEqual(parseList(["alice", 42, "pas un compte !", null]), { ok: true, handles: ["alice"] });
});

test("un fichier vide, trop gros ou qui n'est pas une liste est refusé", () => {
  assert.equal(parseList([]).ok, false);
  assert.equal(parseList({ x: ["alice"] }).ok, false);
  assert.equal(parseList(Array.from({ length: LIST_MAX_SIZE + 1 }, (_, i) => `c${i}`)).ok, false);
});

test("seuls les comptes retirés que Barrage a bloqués sont à débloquer", () => {
  const results = {
    a: { state: "blocked" as const, at: 1 },
    b: { state: "already_blocked" as const, at: 1 },
  };
  const update = compareLists(["a", "b", "c", "d", "e"], ["c", "d", "e"], [], results);
  assert.deepEqual(update, { ok: true, removed: ["a", "b"], retire: ["a"] });
});

test("un compte ajouté par l'utilisateur n'est jamais retiré", () => {
  const results = { a: { state: "blocked" as const, at: 1 } };
  assert.deepEqual(compareLists(["a", "b", "c"], ["b", "c"], ["a"], results), { ok: true, removed: [], retire: [] });
});

test("une liste qui retire plus de la moitié des comptes d'un coup est ignorée", () => {
  assert.equal(compareLists(["a", "b", "c", "d"], ["a"], [], {}).ok, false);
});
