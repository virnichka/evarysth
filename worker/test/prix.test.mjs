/* Prix sur-mesure calculé (Fabrication · phase 5b) : prix affiché au curseur = prix payé, plancher, plafond, alerte /admin */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { lirePanier } from "../src/commande.js";
import { EVARYSTH, prixPlafonne } from "../src/catalogue.js";
import { chiffres } from "../src/admin.js";

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
  let plafonnes = 0, planchers = 0;
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
    assert.ok(affiche >= r.plancher && affiche <= r.plafond, `${p.id} : entre plancher et plafond`);
    if (r.plafonne) plafonnes++;
    if (r.formule < r.plancher) planchers++;
  }
  assert.ok(plafonnes > 0 && planchers > 0, "le tirage couvre des prix plafonnés et des prix au plancher");
});

test("plancher et plafond : tailles standard inchangées, sur-mesure jamais sous le standard ni au-delà de 2 × standard", () => {
  for (const p of EVARYSTH.products.filter(q => q.custom)) {
    for (const o of p.variants.options) assert.equal(EVARYSTH.priceFor(p, "standard", o.values), p.price);
    const def = Object.fromEntries(p.custom.params.map(q => [q.key, q.def]));
    const r = EVARYSTH.prixCalcule(p, def);
    assert.equal(r.plafond, 2 * p.price, `${p.id} : plafond par défaut = 2 × prix standard`);
    assert.equal(EVARYSTH.priceFor(p, "custom", def), Math.min(Math.max(r.formule, p.price), r.plafond));
  }
  const o = EVARYSTH.getProduct("organiseur-tiroir");
  assert.equal(EVARYSTH.priceFor(o, "custom", { a: 560, b: 560 }), 2 * o.price, "formule au-delà du plafond → plafond");
});

test("prix plafonné : repéré depuis le texte d'article du Sheet, alerte au tableau de bord tant que l'article est à valider", () => {
  const art = "organiseur-tiroir · a=320 b=420 · Nylon carbone (PA-CF) · Noir mat · ×1";
  const r = prixPlafonne(art);
  assert.equal(r.produit, "organiseur-tiroir");
  assert.equal(r.plafond, 56);
  assert.ok(r.formule > r.plafond);
  assert.equal(prixPlafonne("passe-cable · a=60 · PLA · Noir mat · ×1"), null, "sous le plafond");
  assert.equal(prixPlafonne("organiseur-tiroir · Moyen · Nylon carbone (PA-CF) · Noir mat · ×1"), null, "taille standard");
  assert.equal(prixPlafonne("inconnu · a=1 · x · y · ×1"), null);
  assert.equal(prixPlafonne(""), null);
  const ligne = statut => ({ ev: "EV-2026-0042", n: "1", statut, article: art, cf: "", fabricant: "", gen: null });
  const etat = statut => ({ evs: {}, lignes: [ligne(statut)], parEV: { "EV-2026-0042": [ligne(statut)] }, journal: {}, fabs: {}, finances: null });
  const c = chiffres(etat("a_valider"));
  assert.equal(c.plafonnes.length, 1);
  assert.equal(c.plafonnes[0].ev, "EV-2026-0042");
  assert.equal(chiffres(etat("expediee")).plafonnes.length, 0, "plus d'alerte une fois l'article parti");
});

test("barème absent pour un produit : commande refusée proprement (pas de prix inventé)", () => {
  const sauve = EVARYSTH.bareme.produits["passe-cable"];
  try {
    delete EVARYSTH.bareme.produits["passe-cable"];
    assert.throws(() => lirePanier({ items: [{ id: "passe-cable", mode: "custom", values: { a: 60 }, color: "noir", qty: 1 }] }), /prix sur-mesure indisponible/);
  } finally { EVARYSTH.bareme.produits["passe-cable"] = sauve; }
});
