/* Evarysth — panier (assets/js/cart.js) exécuté sous Node avec un DOM minimal : le prix affiché d'une ligne est
   recalculé (dégressif selon la quantité) et la livraison suit la masse des pièces. Une fonction manquante dans
   prixAJour() serait avalée par son try/catch : ce test la rend visible. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { RACINE } from "../lib/bareme.mjs";

/* Élément factice : garde ce qu'on y écrit, accepte les appels du panier sans rien faire */
function element() {
  return { hidden: false, checked: false, disabled: false, value: "", textContent: "", innerHTML: "", className: "",
    open: false, addEventListener() {}, setAttribute() {}, focus() {}, insertAdjacentHTML() {},
    classList: { add() {}, remove() {} } };
}

function panier() {
  const elements = new Map(), stockage = new Map();
  const document = {
    querySelector: s => { if (!elements.has(s)) elements.set(s, element()); return elements.get(s); },
    querySelectorAll: () => [],
    addEventListener() {}, body: element(), baseURI: "http://localhost/"
  };
  const localStorage = {
    getItem: k => (stockage.has(k) ? stockage.get(k) : null),
    setItem: (k, v) => stockage.set(k, String(v))
  };
  const ctx = { document, localStorage, location: { search: "", pathname: "/", origin: "http://localhost", hash: "" },
    history: { replaceState() {} }, addEventListener() {}, URLSearchParams, URL, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["assets/js/data.js", "assets/js/bareme.js", "assets/js/prix.js", "assets/js/cart.js"]) {
    const p = path.join(RACINE, f);
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p });
  }
  const E = ctx.EVARYSTH;
  E.shapeSVG = () => ""; E.toast = () => {};
  E.store = { get: (k, d) => d, set() {} };
  return { E, texte: s => elements.get(s).textContent };
}

/* Même article que la fiche (app.js) : taille standard n° 1, prix unitaire d'une pièce */
function article(E, id, qty) {
  const p = E.getProduct(id), o = p.variants.options[0];
  return { key: [p.id, "standard", o.label, JSON.stringify(o.values), ""].join("|"), id: p.id, name: p.name,
    shape: p.shape, mode: "standard", variant: 0, color: null, values: { ...o.values }, details: [],
    unitPrice: E.priceFor(p, "standard", o.values, 1), qty };
}

test("panier : prix dégressif appliqué à la ligne (10 passe-câbles)", () => {
  const { E, texte } = panier();
  const p = E.getProduct("passe-cable"), v = p.variants.options[0].values;
  const u1 = E.priceFor(p, "standard", v, 1), u10 = E.priceFor(p, "standard", v, 10);
  assert.ok(u10 < u1, "le prix unitaire baisse pour 10 pièces");
  E.cart.add(article(E, "passe-cable", 10));
  assert.equal(texte("#cart-sub"), E.fmt(10 * u10));
});

test("panier : la livraison suit la masse des pièces", () => {
  const { E, texte } = panier();
  const p = E.getProduct("passe-cable"), v = p.variants.options[0].values;
  const g = E.estimation(p, v).masse_g;
  const n = Math.ceil((500 - E.frais.livraison.carton_g) / g) + 1;      /* juste au-delà du 1er palier (500 g) */
  E.cart.add(article(E, "passe-cable", 1));
  assert.equal(texte("#cart-shipcost"), E.fmt(E.livraison(E.masseColis([{ masse_g: g, qty: 1 }]))));
  E.cart.add(article(E, "passe-cable", n - 1));
  const attendu = E.livraison(E.masseColis([{ masse_g: g, qty: n }]));
  assert.ok(attendu > E.frais.livraison.paliers[0][1], "palier supérieur atteint");
  assert.equal(texte("#cart-shipcost"), E.fmt(attendu));
});
