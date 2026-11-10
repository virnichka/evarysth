/* Prix calculés (Fabrication · phase 5) : prix affiché au curseur = prix payé, prix par taille standard, plancher et
   supplément sur-mesure, case « sur-mesure » exigée au paiement */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { lirePanier } from "../src/commande.js";
import { EVARYSTH } from "../src/catalogue.js";

/* Le site tel que le navigateur le charge : data.js puis bareme.js, dans un contexte à part */
const site = (() => {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data.js", "bareme.js"]) vm.runInContext(fs.readFileSync(new URL(`../../assets/js/${f}`, import.meta.url), "utf8"), ctx);
  return ctx.EVARYSTH;
})();

/* Tirage reproductible (mulberry32) */
const hasard = (graine => () => {
  graine = (graine + 0x6d2b79f5) | 0;
  let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
})(20261110);

test("prix du curseur = prix payé : 100 configurations sur-mesure tirées au hasard (sur la grille des pas)", () => {
  const produits = EVARYSTH.products.filter(p => p.custom && p.custom.params.length);
  let planchers = 0;
  for (let i = 0; i < 100; i++) {
    const p = produits[Math.floor(hasard() * produits.length)];
    const values = Object.fromEntries(p.custom.params.map(q => {
      const n = Math.round((q.max - q.min) / q.step);
      return [q.key, Number((q.min + Math.floor(hasard() * (n + 1)) * q.step).toFixed(3))];
    }));
    const [l] = lirePanier({ items: [{ id: p.id, mode: "custom", values, color: p.colors[0].id, qty: 1 }] });
    const affiche = site.priceFor(site.getProduct(p.id), "custom", values);
    assert.equal(l.unitCents, Math.round(affiche * 100), `${p.id} ${JSON.stringify(values)}`);
    assert.ok(Number.isInteger(affiche), "prix à l'euro");
    const r = EVARYSTH.prixCalcule(p, values);
    assert.equal(affiche, Math.max(r.formule, r.plancher) + EVARYSTH.tarif.supplementSurMesure, `${p.id} : formule ou taille la plus proche, + supplément`);
    if (r.formule < r.plancher) planchers++;
  }
  assert.ok(planchers > 0, "le tirage couvre des prix au plancher");
});

test("tailles standard : prix de la taille payé tel quel ; sur-mesure jamais sous la taille la plus proche + supplément", () => {
  for (const p of EVARYSTH.products.filter(q => q.custom)) {
    p.variants.options.forEach((o, i) => {
      const [l] = lirePanier({ items: [{ id: p.id, mode: "standard", variant: i, color: p.colors[0].id, qty: 1 }] });
      assert.equal(l.unitCents, Math.round(o.price * 100), `${p.id} ${o.label}`);
      assert.equal(site.priceFor(site.getProduct(p.id), "standard", o.values), o.price);
      assert.ok(EVARYSTH.priceFor(p, "custom", o.values) >= o.price + EVARYSTH.tarif.supplementSurMesure, `${p.id} ${o.label} : sur-mesure ≥ taille + supplément`);
    });
  }
});

test("barème absent pour un produit : commande refusée proprement (pas de prix inventé)", () => {
  const sauve = EVARYSTH.bareme.produits["passe-cable"];
  try {
    delete EVARYSTH.bareme.produits["passe-cable"];
    assert.throws(() => lirePanier({ items: [{ id: "passe-cable", mode: "custom", values: { a: 60 }, color: "noir", qty: 1 }] }), /prix sur-mesure indisponible/);
  } finally { EVARYSTH.bareme.produits["passe-cable"] = sauve; }
});
