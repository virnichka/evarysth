/* Evarysth — prix (docs/prix.md) : rapport identique à la référence (bloquant) ; invariants souhaités (avertissements) */
import test from "node:test";
import assert from "node:assert/strict";
import { rapport, invariants, lireReference } from "../rapport-prix.mjs";

const r = rapport();

test("rapport des prix identique à la référence (tools/references-prix.json)", () => {
  /* Comparaison du texte JSON : les objets lus dans data.js viennent d'un autre contexte (vm) */
  assert.deepEqual(JSON.parse(JSON.stringify(r)), lireReference(), "prix changés : si c'est voulu, node tools/rapport-prix.mjs --mettre-a-jour et committer la référence");
});

/* Avertissements seulement : chaque règle non tenue est listée (node tools/rapport-prix.mjs --verifier, annotations en CI) */
const regles = {
  baisse: "le prix ne baisse jamais quand une cote augmente",
  marche: "pas de marche (≥ 4 € et ≥ 15 %) en un cran de curseur",
  des: "rien n'est vendu sous le « Dès » affiché",
  ecart: "sur-mesure aux cotes d'une taille = prix de la taille + supplément",
  cout: "aucune taille standard sous son coût"
};
const avert = invariants(r);
for (const [regle, titre] of Object.entries(regles)) {
  test(`invariant (avertissement) : ${titre}`, t => {
    const liste = avert.filter(a => a.regle === regle);
    for (const a of liste) t.diagnostic(`AVERTISSEMENT ${a.id} · ${a.message}`);
    if (liste.length) t.diagnostic(`${liste.length} avertissement(s) : ${[...new Set(liste.map(a => a.id))].join(", ")}`);
  });
}

test("invariants : chaque avertissement vise un produit du rapport et une règle connue", () => {
  const ids = new Set(r.produits.map(p => p.id));
  for (const a of avert) assert.ok(ids.has(a.id) && regles[a.regle], JSON.stringify(a));
});
