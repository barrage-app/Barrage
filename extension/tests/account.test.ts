import assert from "node:assert/strict";
import { test } from "node:test";
import { accountId } from "../src/features/blocking/api.ts";

/** Cookies de la page, lus par accountId. */
const page = { cookie: "" };
(globalThis as any).document = page;

test("l'identifiant du compte X se lit dans le cookie twid, encodé ou non", () => {
  for (const twid of ["u%3D123", "u=123", '"u=123"', '"u%3D123"']) {
    page.cookie = `ct0=abc; twid=${twid}; lang=fr`;
    assert.equal(accountId(), "123", twid);
  }
});

test("un cookie twid absent ou illisible ne donne aucun compte, sans erreur", () => {
  for (const cookie of ["ct0=abc", "twid=%", "twid=u%3D12%", "twid="]) {
    page.cookie = cookie;
    assert.equal(accountId(), null, cookie);
  }
});
