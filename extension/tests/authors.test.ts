import assert from "node:assert/strict";
import { test } from "node:test";
import { handleFromHref, handleFromUserNameText, profileHandleFromPath } from "../src/features/timeline/authors.ts";

test("seul un lien direct vers un profil donne un identifiant", () => {
  assert.equal(handleFromHref("/Exemple_1"), "exemple_1");
  assert.equal(handleFromHref("/exemple/status/123"), null);
  assert.equal(handleFromHref("https://x.com/exemple"), null);
  assert.equal(handleFromHref(null), null);
});

test("l'identifiant est le dernier @ du bloc, après le nom affiché", () => {
  assert.equal(handleFromUserNameText("Jean Dupont@JeanDupont·2 h"), "jeandupont");
  // Un nom affiché qui contient lui-même un @ ne doit pas désigner un autre compte.
  assert.equal(handleFromUserNameText("Fan de @Cible@vrai_compte·5 min"), "vrai_compte");
  assert.equal(handleFromUserNameText("Sans identifiant"), null);
});

test("le profil affiché se lit dans le chemin, onglets compris", () => {
  assert.equal(profileHandleFromPath("/Exemple_1"), "exemple_1");
  assert.equal(profileHandleFromPath("/exemple/with_replies"), "exemple");
  assert.equal(profileHandleFromPath("/exemple/media/"), "exemple");
});

test("les pages de X et les posts ne sont pas des profils", () => {
  assert.equal(profileHandleFromPath("/home"), null);
  assert.equal(profileHandleFromPath("/settings/blocked/all"), null);
  assert.equal(profileHandleFromPath("/exemple/status/123"), null);
  assert.equal(profileHandleFromPath("/"), null);
});
