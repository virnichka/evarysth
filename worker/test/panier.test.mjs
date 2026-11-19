/* Panier du site = commande du Worker, au centime (docs/prix.md) : prix dégressif par quantité, livraison au poids,
   emballage cadeau, code de démonstration */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { lirePanier, totalCommande, livraisonCents, parametresSession } from "../src/commande.js";
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
})(20261111);
const entier = (a, b) => a + Math.floor(hasard() * (b - a + 1));

/* Ligne de panier comme cart.js l'envoie (identifiants et cotes, aucun prix) */
function ligneAuHasard() {
  const p = EVARYSTH.products[entier(0, EVARYSTH.products.length - 1)];
  const base = { id: p.id, color: p.colors[entier(0, p.colors.length - 1)].id, qty: entier(1, 5) };
  if (hasard() < 0.5) return { ...base, mode: "standard", variant: entier(0, p.variants.options.length - 1) };
  const values = Object.fromEntries(p.custom.params.map(q => {
    const n = Math.round((q.max - q.min) / q.step);
    return [q.key, Number((q.min + entier(0, n) * q.step).toFixed(3))];
  }));
  return { ...base, mode: "custom", values };
}

/* Total affiché par le panier : même calcul que cart.js (prixAJour puis EVARYSTH.totalPanier), dans le contexte du site */
function totalSite(items, options) {
  const lignes = items.map(i => {
    const p = site.getProduct(i.id), v = i.mode === "custom" ? i.values : p.variants.options[i.variant].values;
    return { prix: site.priceFor(p, i.mode, v, i.qty), masse_g: site.estimation(p, v).masse_g, qty: i.qty };
  });
  return site.totalPanier(lignes, options);
}

test("200 paniers au hasard : total du panier = total recalculé par le Worker, au centime", () => {
  const demo = { rate: site.frais.promosDemo.BIENVENUE10, amount: 0 };
  let paliers = new Set(), degressifs = 0;
  for (let k = 0; k < 200; k++) {
    const items = Array.from({ length: entier(1, 4) }, ligneAuHasard);
    const options = { cadeau: hasard() < 0.5, remise: hasard() < 0.5 ? demo : null };
    const s = totalSite(items, options), lignes = lirePanier({ items }), w = totalCommande(lignes, options);
    const msg = `panier ${k} : ${JSON.stringify(items)} ${JSON.stringify(options)}`;
    assert.equal(Math.round(s.total * 100), w.total, msg);
    assert.deepEqual([s.articles, s.emballage, s.remise, s.livraison].map(x => Math.round(x * 100)), [w.articles, w.emballage, w.remise, w.livraison], msg);
    /* Stripe reçoit le prix unitaire dégressif et la quantité ; livraison de la session = livraison du panier */
    const p = parametresSession(lignes, { base: "https://x/", retour: "https://x/", ref: "EV-1", catalogue: "c", environnement: "test", cadeau: options.cadeau ? { message: "" } : null });
    p.line_items.slice(0, lignes.length).forEach((li, i) => assert.deepEqual([li.quantity, li.price_data.unit_amount], [lignes[i].qty, lignes[i].unitCents]));
    assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, w.livraison);
    paliers.add(w.livraison);
    degressifs += lignes.filter(l => l.qty > 1 && l.unitCents < Math.round(EVARYSTH.priceFor(l.p, l.mode, l.values, 1) * 100)).length;
  }
  assert.ok(paliers.size >= 3, `plusieurs paliers de livraison couverts (${[...paliers].join(", ")})`);
  assert.ok(degressifs > 0, "le tirage couvre des prix dégressifs");
});

test("livraison au poids, une fois par commande : bornes 500 g, 1 kg, 3 kg (carton de 100 g compris)", () => {
  for (const [g, eur] of [[1, 4.5], [500, 4.5], [500.01, 6.5], [1000, 6.5], [1000.01, 8.5], [3000, 8.5], [3000.01, 11.5], [12000, 11.5]]) {
    assert.equal(site.livraison(g), eur, `${g} g`);
    assert.equal(EVARYSTH.livraison(g), eur, `${g} g (Worker)`);
  }
  /* Masse du colis = pièces × quantités + 100 g : 2 × 200 g → 500 g pile ; 1 g de plus change de palier */
  assert.equal(livraisonCents([{ masse_g: 200, qty: 2 }]), 450);
  assert.equal(livraisonCents([{ masse_g: 200.5, qty: 2 }]), 650);
  assert.equal(livraisonCents([{ masse_g: 300, qty: 1 }, { masse_g: 150, qty: 4 }]), 650, "1 kg pile");
  assert.equal(livraisonCents([{ masse_g: 450, qty: 2 }, { masse_g: 1000, qty: 2 }]), 850, "3 kg pile");
  assert.equal(livraisonCents([{ masse_g: 450, qty: 2 }, { masse_g: 1000, qty: 2 }, { masse_g: 1, qty: 1 }]), 1150, "au-delà de 3 kg");
  assert.equal(site.totalPanier([]).total, 0, "panier vide : ni livraison ni emballage");
});
