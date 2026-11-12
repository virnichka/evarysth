/* Evarysth — barème des prix : à jour, cohérent, lissé ; formule de prix : tools/test/prix.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { charger, SCRIPTS_PRIX, avecBareme, matiereImpression, axes, grille, empreinte, perimes } from "../lib/bareme.mjs";

const E = charger(SCRIPTS_PRIX);
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
    assert.equal(b.matiere, matiereImpression(p), `${p.id} : barème tranché dans la matière du produit`);
  }
});

test("estimation : barème lissé (maximum cumulé par axe, jamais sous le brut), exacte à ses nœuds, bornée entre deux nœuds", () => {
  for (const p of avec) {
    const brut = E.bareme.produits[p.id], b = E.baremeLisse(p), m = E.matieres[brut.matiere];
    assert.equal(JSON.stringify(b.axes), JSON.stringify(brut.axes));
    b.points.forEach((x, i) => assert.ok(x[0] >= brut.points[i][0] && x[1] >= brut.points[i][1], `${p.id} : lissé ≥ brut`));
    grille(p).forEach((c, i) => {
      const e = E.estimation(p, c);
      assert.ok(Math.abs(e.cm3 - b.points[i][0]) < 1e-9 && Math.abs(e.temps_min * 60 - b.points[i][1]) < 1e-6, `${p.id} ${JSON.stringify(c)}`);
      assert.ok(Math.abs(e.masse_g - b.points[i][0] * m.densite) < 1e-9);
      /* Monotone : chaque nœud ≥ son voisin d'en dessous sur chaque axe */
      for (const q of p.custom.params) {
        const ax = b.axes[q.key], k = ax.indexOf(c[q.key]);
        if (k > 0) {
          const e0 = E.estimation(p, { ...c, [q.key]: ax[k - 1] });
          assert.ok(e.cm3 >= e0.cm3 - 1e-9 && e.temps_min >= e0.temps_min - 1e-9, `${p.id} ${JSON.stringify(c)} : baisse sur ${q.key}`);
        }
      }
    });
    const q = p.custom.params[0], ax = b.axes[q.key];
    const base = Object.fromEntries(p.custom.params.map(r => [r.key, r.def]));
    const v0 = E.estimation(p, { ...base, [q.key]: ax[0] }).cm3, v1 = E.estimation(p, { ...base, [q.key]: ax[1] }).cm3;
    const mi = E.estimation(p, { ...base, [q.key]: (ax[0] + ax[1]) / 2 }).cm3;
    assert.ok(Math.abs(mi - (v0 + v1) / 2) < 1e-9, `${p.id} : interpolation linéaire entre deux nœuds`);
  }
});

test("matières : densité, €/kg et taux d'échec plausibles (prix, docs/prix.md)", () => {
  for (const [k, m] of Object.entries(E.matieres)) assert.ok(m.densite > 0.8 && m.densite < 2 && m.eurKg > 0 && m.echec >= 0 && m.echec < 0.5, k);
});

test("empreinte : change avec la fiche d'impression, pas avec le prix ni les textes", () => {
  const p = avec[0], e = empreinte(p, E);
  assert.equal(empreinte({ ...p, valeur: 2, name: "x", desc: "y" }, E), e);
  assert.equal(empreinte({ ...p, impression: { ...p.impression, remarques: "autre" } }, E), e);
  assert.notEqual(empreinte({ ...p, impression: { ...p.impression, supports: !p.impression.supports } }, E), e);
  assert.notEqual(empreinte({ ...p, custom: { ...p.custom, params: p.custom.params.map(q => ({ ...q, max: q.max + 10 })) } }, E), e);
});
