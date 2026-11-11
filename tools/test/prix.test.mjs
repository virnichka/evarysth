/* Evarysth — prix (docs/prix.md) : rapport identique à la référence ; invariants bloquants */
import test from "node:test";
import assert from "node:assert/strict";
import { charger, SCRIPTS_PRIX } from "../lib/bareme.mjs";
import { rapport, invariants, lireReference, REGLES } from "../rapport-prix.mjs";

const E = charger(SCRIPTS_PRIX);
const r = rapport(E), inv = invariants(r, E);

test("rapport des prix identique à la référence (tools/references-prix.json)", () => {
  /* Comparaison du texte JSON : les objets lus dans data.js viennent d'un autre contexte (vm) */
  assert.deepEqual(JSON.parse(JSON.stringify(r)), lireReference(), "prix changés : si c'est voulu, node tools/rapport-prix.mjs --mettre-a-jour et committer la référence");
});

for (const [regle, titre] of Object.entries(REGLES)) {
  test(`invariant : ${titre}`, () => {
    const liste = inv.filter(a => a.regle === regle);
    assert.equal(liste.map(a => `${a.id} · ${a.message}`).join("\n"), "");
  });
}

test("formule (docs/prix.md) : produit fictif, décomposition et arrondi", () => {
  /* 100 cm³ de PLA (124 g, r = 5 %), 2 h :
     Mat 2 × 0,124 × 25 × 1,05 = 6,51 ; Mach 2 × 0,60 × 1,05 = 1,26 ; Vm 2 ; MO 0,40 × (6 + 2,48) = 3,392 ;
     V = 6,51 + 1,26 + 2 + 3,392 + 0,30 + 4 = 17,462 ; (17,462 + 2) / 0,851 = 22,87 → 23 € ; par 4 : (17,462 + 0,50) / 0,851 = 21,11 → 22 € */
  const p = { id: "essai", matiere: "pla", variants: { options: [{ label: "S", values: { a: 10 } }] }, custom: { params: [{ key: "a", min: 10, max: 30 }] } };
  const sauve = E.bareme;
  try {
    E.bareme = { produits: { essai: { matiere: "pla", axes: { a: [10, 20, 30] }, points: [[100, 7200], [90, 7000], [300, 36000]] } } };
    const d = E.prixDetail(p, { a: 10 });
    assert.deepEqual([d.mat, d.mach, d.vm, d.mo].map(x => Math.round(x * 1000) / 1000), [6.51, 1.26, 2, 3.392]);
    assert.equal(Math.round(d.V * 1000) / 1000, 17.462);
    assert.equal(d.prix, 23);
    assert.equal(E.priceFor(p, "custom", { a: 10 }), 23);
    assert.equal(E.priceFor(p, "standard", { a: 10 }), 23, "standard = sur-mesure aux mêmes cotes");
    assert.equal(E.priceFor(p, "custom", { a: 10 }, 4), 22, "lancement réparti sur 4 pièces");
    assert.equal(E.priceFor({ ...p, valeur: 1.5 }, "custom", { a: 10 }), 35, "coefficient valeur avant l'arrondi : 22,87 × 1,5 = 34,3 → 35");
    /* Lissage : le point a = 20 (90 cm³, 7000 s) remonte au maximum cumulé (100 cm³, 7200 s) ; bareme.js reste brut */
    assert.deepEqual(E.baremeLisse(p).points[1], [100, 7200]);
    assert.deepEqual(E.bareme.produits.essai.points[1], [90, 7000]);
    assert.equal(E.priceFor(p, "custom", { a: 15 }), 23, "pas de baisse entre deux nœuds lissés");
    assert.equal(Math.round(E.prixDetail(p, { a: 25 }).cm3), 200, "interpolation entre deux nœuds lissés");
    E.bareme.produits.essai.points = [[1, 60], [1, 60], [1, 60]];
    assert.equal(E.priceFor(p, "custom", { a: 10 }), 11, "pièce minuscule : main-d'œuvre, fixes et lancement");
    assert.equal(E.priceFor(p, "custom", { a: 10 }, 10), E.tarif.prixMinimum, "par 10 : (6,70 + 0,20) / 0,851 = 8,11 → prix minimum 9 €");
    E.bareme.produits.essai.points = [[100, 10 * 3600], [100, 10 * 3600], [100, 10 * 3600]];
    assert.equal(E.prixDetail(p, { a: 10 }).vm, 8 + 2 * 0.4, "occupation : 8 h à 1 €, puis 0,40 €/h");
    assert.throws(() => E.priceFor({ ...p, matiere: undefined }, "custom", { a: 10 }), /Matière absente pour essai/, "pas de matière par défaut");
    assert.throws(() => E.priceFor({ ...p, matiere: "bois" }, "custom", { a: 10 }), /Matière « bois » inconnue/);
    delete E.bareme.produits.essai;
    assert.throws(() => E.priceFor(p, "custom", { a: 10 }), /barème absent/);
  } finally { E.bareme = sauve; }
});

test("tarifs : un seul objet, matières avec filière ; aucun prix saisi à la main dans data.js", () => {
  for (const [k, m] of Object.entries(E.matieres)) assert.ok(["atelier", "externe"].includes(m.filiere), `${k} : filière`);
  assert.deepEqual(["pla", "petg"].map(k => E.matieres[k].filiere), ["atelier", "atelier"]);
  assert.deepEqual(["asa", "pa12"].map(k => E.matieres[k].filiere), ["externe", "externe"]);
  assert.equal(E.tarif.prelevements, 0.149);
  for (const p of E.products) {
    assert.equal(p.price, undefined, `${p.id} : price retiré (prix calculé)`);
    for (const o of p.variants.options) assert.equal(o.price, undefined, `${p.id} ${o.label} : price retiré`);
  }
});

test("valeurs repères (barème du commit e555d74)", () => {
  const g = id => E.getProduct(id), t = (id, l) => g(id).variants.options.find(o => o.label === l).values;
  const ext = (id, k) => Object.fromEntries(g(id).custom.params.map(q => [q.key, q[k]]));
  assert.deepEqual([
    E.priceFor(g("crochet-balcon"), "standard", t("crochet-balcon", "S")),
    E.priceFor(g("tablette-rambarde"), "custom", ext("tablette-rambarde", "def")),
    E.priceFor(g("support-casque-gyroide"), "standard", t("support-casque-gyroide", "Compact")),
    E.prixDes(g("organiseur-tiroir")), E.priceFor(g("organiseur-tiroir"), "custom", ext("organiseur-tiroir", "max")),
    E.priceFor(g("boite-rugged"), "custom", ext("boite-rugged", "max")),
    E.priceFor(g("chat-lord"), "standard", t("chat-lord", "L")),
    E.priceFor(g("carapuce"), "custom", ext("carapuce", "max")),
    E.priceFor(g("crochet-appui-tete"), "standard", t("crochet-appui-tete", "Fine")),
    E.priceFor(g("crochet-balcon"), "standard", t("crochet-balcon", "S"), 4)
  ], [13, 26, 49, 26, 188, 82, 45, 82, 17, 11]);
});
