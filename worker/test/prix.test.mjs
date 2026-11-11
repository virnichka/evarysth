/* Prix calculés (docs/prix.md) : prix affiché = prix payé, même calcul pour les tailles standard et le sur-mesure */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { lirePanier, LIVRAISON_CENTS, CADEAU_CENTS, MESSAGE_CADEAU_MAX } from "../src/commande.js";
import { EVARYSTH } from "../src/catalogue.js";

/* Le site tel que le navigateur le charge : data.js, bareme.js puis prix.js, dans un contexte à part */
const site = (() => {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data.js", "bareme.js", "prix.js"]) vm.runInContext(fs.readFileSync(new URL(`../../assets/js/${f}`, import.meta.url), "utf8"), ctx);
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
  for (let i = 0; i < 100; i++) {
    const p = produits[Math.floor(hasard() * produits.length)];
    const values = Object.fromEntries(p.custom.params.map(q => {
      const n = Math.round((q.max - q.min) / q.step);
      return [q.key, Number((q.min + Math.floor(hasard() * (n + 1)) * q.step).toFixed(3))];
    }));
    const [l] = lirePanier({ items: [{ id: p.id, mode: "custom", values, color: p.colors[0].id, qty: 1 }] });
    const affiche = site.priceFor(site.getProduct(p.id), "custom", values);
    assert.equal(l.unitCents, Math.round(affiche * 100), `${p.id} ${JSON.stringify(values)}`);
    assert.ok(Number.isInteger(affiche) && affiche >= EVARYSTH.tarif.prixMinimum, "prix à l'euro, jamais sous le minimum");
    assert.equal(affiche, EVARYSTH.prixDetail(p, values).prix);
  }
});

test("tailles standard : même calcul que le sur-mesure aux mêmes cotes, payé tel quel", () => {
  for (const p of EVARYSTH.products.filter(q => q.custom)) {
    p.variants.options.forEach((o, i) => {
      const [l] = lirePanier({ items: [{ id: p.id, mode: "standard", variant: i, color: p.colors[0].id, qty: 1 }] });
      const prix = site.priceFor(site.getProduct(p.id), "custom", o.values);
      assert.equal(l.unitCents, Math.round(prix * 100), `${p.id} ${o.label}`);
      assert.equal(site.priceFor(site.getProduct(p.id), "standard", o.values), prix);
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

test("livraison, emballage cadeau, code de démo : une seule définition (prix.js) pour le site et le Worker", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(site.frais)), JSON.parse(JSON.stringify(EVARYSTH.frais)));
  assert.deepEqual([LIVRAISON_CENTS, CADEAU_CENTS, MESSAGE_CADEAU_MAX], [490, 300, 200], "montants inchangés");
  assert.equal(site.frais.promosDemo.BIENVENUE10, 0.1);
  const panier = fs.readFileSync(new URL("../../assets/js/cart.js", import.meta.url), "utf8");
  assert.doesNotMatch(panier, /const (SHIPPING|GIFT|GIFT_MAX|PROMOS) = [\d{]/, "cart.js lit EVARYSTH.frais, sans valeur à lui");
});
