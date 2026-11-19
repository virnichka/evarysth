/* Evarysth — tailles standard : clés R2 (<produit>/<taille>.stl|.zip) lues par le Worker */
import test from "node:test";
import assert from "node:assert/strict";
import { produits } from "../lib/moteur.mjs";
import { tailles } from "../stl-standards.mjs";
import { segmentTaille, EXTENSIONS } from "../../worker/src/fichier.js";

test("chaque taille standard de data.js a une clé R2 unique que le Worker sait lire", () => {
  const l = tailles(produits, []);
  const attendu = produits.reduce((n, p) => n + ((p.variants && p.variants.options) || []).length, 0);
  assert.equal(l.length, attendu, "une entrée par taille standard");
  assert.ok(l.length >= 3);
  const cles = new Set();
  for (const t of l) {
    assert.match(`${t.produit}/${t.seg}.${EXTENSIONS[0]}`, /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.stl$/, `${t.produit} · ${t.label}`);
    assert.equal(t.seg, segmentTaille(t.label));
    cles.add(`${t.produit}/${t.seg}`);
  }
  assert.equal(cles.size, l.length, "aucune clé en double");
});

test("deux tailles au même segment sont refusées", () => {
  const faux = [{ id: "x", variants: { options: [{ label: "Ø 12" }, { label: "12" }] } }];
  assert.throws(() => tailles(faux, []), /même clé/);
});
