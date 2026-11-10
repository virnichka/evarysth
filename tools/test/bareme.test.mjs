/* Evarysth — barème des prix sur-mesure (Fabrication · phase 5a) : à jour, cohérent, formule de prix */
import test from "node:test";
import assert from "node:assert/strict";
import { charger, FICHIER, avecBareme, axes, grille, empreinte, perimes } from "../lib/bareme.mjs";

const E = charger(["assets/js/data.js", FICHIER]);
const avec = E.products.filter(avecBareme);

test("barème à jour : chaque produit sur-mesure a son barème, empreinte conforme aux entrées", () => {
  assert.equal(perimes(E).join(", "), "", "barème périmé : workflow « Barème des prix sur-mesure » (bareme.yml) ou node tools/generer-bareme.mjs <id>");
});

test("barème : axes et nombre de points conformes à la grille, valeurs plausibles", () => {
  for (const p of avec) {
    const b = E.bareme.produits[p.id];
    assert.equal(JSON.stringify(b.axes), JSON.stringify(axes(p)), p.id);
    assert.equal(b.points.length, grille(p).length, p.id);
    for (const [cm3, s] of b.points) assert.ok(cm3 > 0 && s > 0, `${p.id} : point nul`);
    assert.ok(E.matieres[b.matiere], `${p.id} : matière ${b.matiere}`);
  }
});

test("estimation : exacte aux nœuds de la grille, bornée entre deux nœuds", () => {
  for (const p of avec) {
    const b = E.bareme.produits[p.id], m = E.matieres[b.matiere];
    grille(p).forEach((c, i) => {
      const e = E.estimation(p, c);
      assert.ok(Math.abs(e.cm3 - b.points[i][0]) < 1e-9 && Math.abs(e.temps_min * 60 - b.points[i][1]) < 1e-6, `${p.id} ${JSON.stringify(c)}`);
      assert.ok(Math.abs(e.masse_g - b.points[i][0] * m.densite) < 1e-9);
    });
    const q = p.custom.params[0], ax = b.axes[q.key];
    const base = Object.fromEntries(p.custom.params.map(r => [r.key, r.def]));
    const v0 = E.estimation(p, { ...base, [q.key]: ax[0] }).cm3, v1 = E.estimation(p, { ...base, [q.key]: ax[1] }).cm3;
    const mi = E.estimation(p, { ...base, [q.key]: (ax[0] + ax[1]) / 2 }).cm3;
    assert.ok(Math.abs(mi - (v0 + v1) / 2) < 1e-9, `${p.id} : interpolation linéaire entre deux nœuds`);
  }
});

test("tarifs : chaque matière a densité et €/kg ; formule, plancher et plafond", () => {
  for (const [k, m] of Object.entries(E.matieres)) assert.ok(m.densite > 0.8 && m.densite < 2 && m.eurKg > 0, k);
  const t = E.tarif;
  assert.deepEqual([t.machineEurH, t.forfait, t.coefficient, t.plafondFois], [1.5, 3, 2.5, 2]);
  /* Produit fictif : 100 cm³ de PLA (124 g), 2 h → coût 3,10 + 3 + 3 = 9,10 € ; (9,10 × 2,5 + 0,25) / 0,985 = 23,35 → 24 € */
  const p = { id: "essai", price: 10, variants: { options: [{ label: "S", values: { a: 10 } }, { label: "L", values: { a: 30 } }] },
    custom: { params: [{ key: "a", min: 10, max: 30 }] } };
  const sauve = E.bareme;
  try {
    E.bareme = { produits: { essai: { matiere: "pla", axes: { a: [10, 30] }, points: [[100, 7200], [300, 21600]] } } };
    const r = E.prixCalcule(p, { a: 10 });
    assert.equal(r.cout, 9.1);
    assert.equal(r.formule, 24);
    assert.equal(r.plancher, 10);
    assert.equal(r.plafond, 20);
    assert.equal(r.prix, 20);
    assert.equal(r.plafonne, true);
    p.custom.plafond = 50;
    assert.equal(E.prixCalcule(p, { a: 10 }).prix, 24);
    E.bareme.produits.essai.points = [[1, 60], [2, 60]];
    const bas = E.prixCalcule(p, { a: 10 });
    assert.ok(bas.formule < 10 && bas.prix === 10 && !bas.plafonne, "plancher : prix de la taille standard la plus proche");
  } finally { E.bareme = sauve; }
});

test("prix actuels inchangés : priceFor ne lit pas encore le barème (phase 5b)", () => {
  const p = E.getProduct("passe-cable");
  assert.equal(E.priceFor(p, "standard"), p.price);
  assert.equal(E.priceFor(p, "custom", { a: 100 }), Math.round((p.price + p.custom.surcharge) * 100) / 100);
});

test("empreinte : change avec la fiche d'impression, pas avec le prix ni les textes", () => {
  const p = avec[0], e = empreinte(p, E);
  assert.equal(empreinte({ ...p, price: p.price + 5, name: "x", desc: "y" }, E), e);
  assert.equal(empreinte({ ...p, impression: { ...p.impression, remarques: "autre" } }, E), e);
  assert.notEqual(empreinte({ ...p, impression: { ...p.impression, supports: !p.impression.supports } }, E), e);
  assert.notEqual(empreinte({ ...p, custom: { ...p.custom, params: p.custom.params.map(q => ({ ...q, max: q.max + 10 })) } }, E), e);
});
