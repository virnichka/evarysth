/* Tests du Worker de paiement : node --test worker/test/  (aucun appel réel à Stripe) */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { lirePanier, parametresSession, ErreurPanier } from "../src/commande.js";
import { encoder, signer, verifierSignature } from "../src/stripe.js";

const SITE = "https://www.evarysth.fr";
const env = {
  CHECKOUT_MODE: "test",
  ALLOWED_ORIGINS: `${SITE},http://localhost:8000`,
  STRIPE_SECRET_KEY: "sk_test_factice",
  STRIPE_WEBHOOK_SECRET: "whsec_factice"
};

/* Faux Stripe : enregistre les appels, répond selon le chemin */
let appels = [];
const vraiFetch = globalThis.fetch;
beforeEach(() => {
  appels = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    appels.push({ chemin: u.pathname, methode: init.method, corps: init.body || u.search.slice(1) });
    const rep = d => new Response(JSON.stringify(d), { status: 200 });
    if (u.pathname === "/v1/checkout/sessions" && init.method === "POST") return rep({ id: "cs_test_abc", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });
    if (u.pathname === "/v1/promotion_codes") {
      return u.searchParams.get("code") === "BRABOU78"
        ? rep({ data: [{ id: "promo_123", code: "BRABOU78", active: true, promotion: { coupon: "72RlPcIT" } }] })
        : rep({ data: [] });
    }
    if (u.pathname === "/v1/coupons/72RlPcIT") return rep({ id: "72RlPcIT", percent_off: 10, valid: true });
    if (u.pathname.endsWith("/line_items")) return rep({ data: [{ quantity: 1, price: { product: { metadata: { produit: "x" } } } }] });
    return vraiFetch(url, init);
  };
});

const decode = s => Object.fromEntries(new URLSearchParams(s));
const poster = (chemin, corps, origine = SITE) => worker.fetch(new Request(`https://w.dev${chemin}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(origine ? { Origin: origine } : {}) }, body: JSON.stringify(corps)
}), env);

const tablette = { id: "tablette-rambarde", mode: "custom", values: { a: 45, b: 300 }, color: "noir", qty: 2 };

test("prix recalculés depuis le catalogue (standard et sur-mesure avec supplément au mm)", () => {
  const [std, sm] = lirePanier({ items: [
    { id: "jardiniere-clip", mode: "standard", variant: 1, color: "sauge", qty: 1 },
    tablette
  ] });
  assert.equal(std.unitCents, 2400);
  assert.deepEqual(std.values, { a: 50 });
  /* 29 + 8 de sur-mesure + (300 − 220) × 0,05 = 41 € */
  assert.equal(sm.unitCents, 4100);
});

test("panier refusé : cotes hors bornes, hors pas, inconnues, produit/coloris/quantité invalides", () => {
  const cas = [
    { ...tablette, values: { a: 10, b: 220 } },
    { ...tablette, values: { a: 45, b: 225 } },
    { ...tablette, values: { a: 45, b: 220, z: 1 } },
    { ...tablette, values: { a: "45", b: 220 } },
    { ...tablette, id: "inexistant" },
    { ...tablette, color: "violet" },
    { ...tablette, qty: 0 },
    { ...tablette, qty: 1.5 },
    { id: "jardiniere-clip", mode: "standard", variant: 9, color: "noir", qty: 1 },
    { ...tablette, mode: "gratuit" }
  ];
  for (const it of cas) assert.throws(() => lirePanier({ items: [it] }), ErreurPanier, JSON.stringify(it));
  assert.throws(() => lirePanier({ items: [] }), ErreurPanier);
});

test("session Stripe : lignes, cotes en métadonnées, livraison, promo, retours", () => {
  const lignes = lirePanier({ items: [tablette] });
  const p = decode(encoder(parametresSession(lignes, { base: SITE + "/", retour: SITE + "/produits/tablette-rambarde/", ref: "EV-1", catalogue: "abc", environnement: "test" })));
  assert.equal(p["line_items[0][price_data][unit_amount]"], "4100");
  assert.equal(p["line_items[0][quantity]"], "2");
  assert.equal(p["line_items[0][price_data][product_data][metadata][cotes_mm]"], '{"a":45,"b":300}');
  assert.match(p["line_items[0][price_data][product_data][description]"], /A · .* : 45 mm · B · Largeur de la tablette : 300 mm · Coloris : Noir mat/);
  assert.equal(p["shipping_options[0][shipping_rate_data][fixed_amount][amount]"], "490");
  assert.equal(p.allow_promotion_codes, "true");
  assert.equal(p.success_url, SITE + "/commande/merci/?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(p.cancel_url, SITE + "/produits/tablette-rambarde/?panier=annule");
  assert.equal(p["metadata[panier]"], "tablette-rambarde:sm:a45,b300:noir:x2");
  assert.match(p["custom_text[submit][message]"], /L221-28/);
  assert.equal(p.payment_method_types, undefined, "moyens de paiement dynamiques (PayPal, CB…)");
});

test("POST /checkout : renvoie l'URL Stripe, ignore tout prix envoyé par le navigateur", async () => {
  const r = await poster("/checkout", { items: [{ ...tablette, unitPrice: 0.01 }], base: SITE + "/", retour: "https://pirate.example/x" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), SITE);
  const j = await r.json();
  assert.equal(j.url, "https://checkout.stripe.com/c/pay/cs_test_abc");
  assert.match(j.ref, /^EV-\d{6}-[A-Z2-9]{4}$/);
  const p = decode(appels.at(-1).corps);
  assert.equal(p["line_items[0][price_data][unit_amount]"], "4100");
  assert.equal(p.cancel_url, SITE + "/?panier=annule", "retour vers un autre site refusé");
  assert.match(p["metadata[catalogue]"], /^[0-9a-f]{12}$/);
});

test("code promo : vérifié chez Stripe puis appliqué à la session", async () => {
  let r = await poster("/promo", { code: "BRABOU78" });
  assert.deepEqual(await r.json(), { valide: true, code: "BRABOU78", rate: 0.1, amount: 0 });
  r = await poster("/promo", { code: "FAUX" });
  assert.equal((await r.json()).valide, false);
  r = await poster("/checkout", { items: [tablette], promo: "BRABOU78" });
  assert.equal(r.status, 200);
  const p = decode(appels.at(-1).corps);
  assert.equal(p["discounts[0][promotion_code]"], "promo_123");
  assert.equal(p.allow_promotion_codes, undefined);
  r = await poster("/checkout", { items: [tablette], promo: "FAUX" });
  assert.equal(r.status, 400);
});

test("sécurité : origine inconnue, clé live en mode test, panier invalide", async () => {
  assert.equal((await poster("/checkout", { items: [tablette] }, "https://pirate.example")).status, 403);
  assert.equal((await poster("/checkout", { items: [tablette] }, null)).status, 403);
  const live = await worker.fetch(new Request("https://w.dev/checkout", { method: "POST", headers: { Origin: SITE }, body: "{}" }),
    { ...env, STRIPE_SECRET_KEY: "sk_live_x" });
  assert.equal(live.status, 503);
  const r = await poster("/checkout", { items: [{ ...tablette, values: { a: 999, b: 220 } }] });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /entre 15 et 100 mm/);
  assert.equal(appels.length, 0, "aucun appel Stripe pour une demande refusée");
});

test("webhook : signature vérifiée (valide, falsifiée, périmée)", async () => {
  const corps = JSON.stringify({ type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_abc", metadata: { ref: "EV-1" }, amount_total: 9690 } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = await signer(env.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`);
  assert.equal(await verifierSignature(corps, `t=${t},v1=${sig}`, env.STRIPE_WEBHOOK_SECRET), true);
  assert.equal(await verifierSignature(corps + " ", `t=${t},v1=${sig}`, env.STRIPE_WEBHOOK_SECRET), false);
  assert.equal(await verifierSignature(corps, `t=${t},v1=${sig}`, env.STRIPE_WEBHOOK_SECRET, t + 600), false);

  const envoyer = entete => worker.fetch(new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": entete }, body: corps }), env);
  assert.equal((await envoyer(`t=${t},v1=${"0".repeat(64)}`)).status, 400);
  const log = console.log; let fiche; console.log = s => { fiche = JSON.parse(s); };
  try { assert.equal((await envoyer(`t=${t},v1=${sig}`)).status, 200); } finally { console.log = log; }
  assert.equal(fiche.ref, "EV-1");
  assert.deepEqual(fiche.lignes, [{ quantite: 1, produit: "x" }]);
});

test("emballage cadeau : ligne à 3 € ajoutée par le Worker, message en métadonnées", async () => {
  const r = await poster("/checkout", { items: [tablette], cadeau: true, message: "  Joyeux\nanniversaire !  ", base: SITE + "/" });
  assert.equal(r.status, 200);
  const p = decode(appels.at(-1).corps);
  assert.equal(p["line_items[1][price_data][product_data][name]"], "Emballage cadeau");
  assert.equal(p["line_items[1][price_data][unit_amount]"], "300");
  assert.equal(p["line_items[1][quantity]"], "1");
  assert.equal(p["line_items[1][price_data][product_data][metadata][produit]"], "emballage-cadeau");
  assert.equal(p["metadata[cadeau]"], "oui");
  assert.equal(p["metadata[message_cadeau]"], "Joyeux anniversaire !");
  /* Sans option : pas de ligne cadeau, message ignoré */
  await poster("/checkout", { items: [tablette], message: "ignoré" });
  const q = decode(appels.at(-1).corps);
  assert.equal(q["line_items[1][quantity]"], undefined);
  assert.equal(q["metadata[cadeau]"], "non");
  assert.equal(q["metadata[message_cadeau]"], undefined);
});

test("emballage cadeau : prix falsifié ignoré, cadeau non booléen ignoré", async () => {
  await poster("/checkout", { items: [tablette], cadeau: true, prixCadeau: 0, giftPrice: 0.01, cadeauCents: 1 });
  const p = decode(appels.at(-1).corps);
  assert.equal(p["line_items[1][price_data][unit_amount]"], "300");
  await poster("/checkout", { items: [tablette], cadeau: "oui" });
  assert.equal(decode(appels.at(-1).corps)["line_items[1][quantity]"], undefined);
});

test("emballage cadeau : message trop long ou illisible refusé", async () => {
  const n = appels.length;
  let r = await poster("/checkout", { items: [tablette], cadeau: true, message: "x".repeat(201) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /200 caractères/);
  r = await poster("/checkout", { items: [tablette], cadeau: true, message: { html: "<b>" } });
  assert.equal(r.status, 400);
  assert.equal(appels.length, n, "aucune session Stripe créée");
  r = await poster("/checkout", { items: [tablette], cadeau: true, message: "é".repeat(200) });
  assert.equal(r.status, 200, "200 caractères exactement : accepté");
});

test("CGV : case de consentement Stripe, repli sur le texte si l'URL n'est pas renseignée", async () => {
  let r = await poster("/checkout", { items: [tablette] });
  assert.equal((await r.json()).cgv, "case");
  let p = decode(appels.at(-1).corps);
  assert.equal(p["consent_collection[terms_of_service]"], "required");
  assert.match(p["custom_text[terms_of_service_acceptance][message]"], /\[conditions générales de vente\]\(https:\/\/www\.evarysth\.fr\/cgv\/\)/);
  assert.match(p["custom_text[submit][message]"], /L221-28/, "rappel sur-mesure");

  const fauxFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/v1/checkout/sessions") && /consent_collection/.test(init.body || "")) {
      appels.push({ chemin: "/v1/checkout/sessions", methode: "POST", corps: init.body });
      return new Response(JSON.stringify({ error: { message: "You must provide a terms of service URL in your public business details to collect consent." } }), { status: 400 });
    }
    return fauxFetch(url, init);
  };
  r = await poster("/checkout", { items: [tablette] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).cgv, "texte");
  p = decode(appels.at(-1).corps);
  assert.equal(p["consent_collection[terms_of_service]"], undefined);
  assert.match(p["custom_text[submit][message]"], /conditions générales de vente\]\(https:\/\/www\.evarysth\.fr\/cgv\/\).*L221-28/);
});
