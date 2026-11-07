/* Recette de bout en bout (bloc E) : webhook Stripe → tâche planifiée → liens fournisseur → expédition.
   Stripe (mode test), Google Sheets, Brevo et R2 simulés : aucun appel réel. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";
import { viderCacheJeton } from "../src/google.js";
import { reglages } from "../src/sheet.js";
import { tachePlanifiee } from "../src/planifie.js";

reglages.attenteVerificationMs = 0;
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const STL = new TextEncoder().encode("solid boite-rugged-m\nendsolid\n");
const r2 = { async head(k) { return k === "boite-rugged/m.stl" ? { size: STL.length } : null; },
  async get(k) { return k === "boite-rugged/m.stl" ? { size: STL.length, body: new Blob([STL]).stream() } : null; } };
const FAB = "Atelier Dupont";
const env = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice", HMAC_SECRET: "secret-de-test",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "proprio@example.com", WORKER_URL: "https://w.dev", STL: r2 };
const ENTETES = ["Commande", "Date", "Statut", "Type", "Action requise", "Pièce", "Commande OpenSCAD", "Client", "Fabricant", "Lien STL",
  "Transporteur", "N° de suivi", "Dernier statut notifié", "Stripe session id", "Cadeau / message", "Notes"];

let sheet, emails, lignesStripe;
beforeEach(() => {
  viderCacheJeton();
  sheet = { Commandes: [ENTETES.slice()], Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]], Listes: [["Transporteurs"], ["Colissimo"], ["Mondial Relay"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], [FAB, "atelier@example.com", "5", "non"]] };
  emails = [];
  globalThis.fetch = fauxFetch;
});

const col = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const plage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o.replace(/''/g, "'"), ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host === "api.stripe.com" && u.pathname.endsWith("/line_items")) return rep({ data: lignesStripe });
  if (u.host === "api.brevo.com") { emails.push(JSON.parse(init.body)); return rep({ messageId: "m" }, 201); }
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin === "values:batchGet") return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = plage(r), v = sheet[onglet].map(l => l[col(ref.split(":")[0])] ?? "");
    while (v.length && v[v.length - 1] === "") v.pop();
    return { range: r, values: [v] };
  }) });
  const [, a1, action] = /^values\/(.+?)(:append)?$/.exec(chemin);
  const { onglet, ref } = plage(a1), t = sheet[onglet];
  if (action) { t.push(JSON.parse(init.body).values[0]); return rep({}); }
  if (!init.method || init.method === "GET") return rep({ values: [t[0]] });
  const [, c0, l0] = /^([A-Z]+)(\d+)/.exec(ref), i = Number(l0) - 1;
  while (t.length <= i) t.push([]);
  JSON.parse(init.body).values[0].forEach((v, k) => { if (v !== null) t[i][col(c0) + k] = v; });
  return rep({});
}
const silence = async f => { const s = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await f(); } finally { [console.log, console.warn, console.error] = s; } };

async function webhook(id) {
  const session = { id, created: 1793000000, payment_status: "paid", payment_intent: "pi_1", amount_total: 5490, metadata: { ref: "EV-X", cadeau: "non" },
    customer_details: { name: "Camille Test", email: "client@example.com" },
    collected_information: { shipping_details: { name: "Camille Test", address: { line1: "1 rue des Lilas", postal_code: "75011", city: "Paris", country: "FR" } } } };
  const corps = JSON.stringify({ type: "checkout.session.completed", livemode: false, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const entete = `t=${t},v1=${await signer(env.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`)}`;
  return silence(() => worker.fetch(new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": entete }, body: corps }), env));
}
const ligne = sid => { const r = sheet.Commandes.find(l => l[13] === sid); return r && Object.fromEntries(ENTETES.map((n, i) => [n, r[i] ?? ""])); };
const ecrire = (sid, valeurs) => { const r = sheet.Commandes.find(l => l[13] === sid); for (const [n, v] of Object.entries(valeurs)) r[ENTETES.indexOf(n)] = v; };
const appeler = (url, champs) => silence(() => worker.fetch(new Request(url, champs ? { method: "POST", body: new URLSearchParams(champs) } : {}), env));
const liensF = texte => texte.match(/https:\/\/w\.dev\/f\/\S+/g);

/* Parcours commun à partir de envoyee_fabricant : e-mail fabricant → accepter → expédier → e-mail client */
async function suiteFabricant(sid, verifierEmail) {
  const num = ligne(sid).Commande;
  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b.notifiees, [`${num} : envoyee_fabricant`]);
  const mf = emails.find(m => m.tags[0] === "fabricant");
  assert.equal(mf.to[0].email, "atelier@example.com");
  assert.match(mf.subject, /^\[TEST\]/);
  await verifierEmail(mf.textContent);
  const [accepter, expedier] = liensF(mf.textContent);

  assert.equal((await appeler(accepter)).status, 200, "GET : page avec bouton, rien d'écrit");
  assert.equal(ligne(sid).Statut, "envoyee_fabricant");
  assert.equal((await appeler(accepter, {})).status, 200);
  assert.equal(ligne(sid).Statut, "acceptee");
  assert.equal((await appeler(expedier, { transporteur: "Colissimo", suivi: "6A12345678901" })).status, 200);
  assert.equal(ligne(sid).Statut, "expediee");
  assert.equal(ligne(sid)["N° de suivi"], "6A12345678901");

  const b2 = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b2.notifiees, [`${num} : expediee`], "un seul passage après les deux clics : expediee notifiée");
  const mc = emails.find(m => m.tags[0] === "expedition");
  assert.equal(mc.to[0].email, "client@example.com");
  assert.match(mc.textContent, /Colissimo/);
  assert.match(mc.textContent, /6A12345678901/);
  assert.equal(ligne(sid)["Dernier statut notifié"], "expediee");
  assert.deepEqual((await silence(() => tachePlanifiee(env))).notifiees, [], "rien de plus au passage suivant");
  return sheet.Journal.slice(1).filter(l => l[1] === num).map(l => `${l[3]}/${l[4]}`);
}

test("Parcours standard : paiement → payee → validation → e-mail fabricant avec lien STL R2 → acceptee → expediee → e-mail client", async () => {
  lignesStripe = [{ description: "Boîte rugged — M", quantity: 1, amount_total: 4900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "standard", taille: "M", cotes_mm: '{"a":150,"b":100,"c":50}', coloris: "noir" } } } }];
  assert.equal((await webhook("cs_test_std")).status, 200);
  const r = ligne("cs_test_std");
  assert.equal(r.Statut, "payee");
  assert.equal(r.Type, "standard");
  assert.equal(r.Fabricant, FAB, "fabricant par défaut");
  assert.ok(emails.some(m => m.tags[0] === "commande-recue"), "e-mail client « commande reçue »");
  assert.ok(emails.some(m => m.tags[0] === "commande" && m.to[0].email === "proprio@example.com"), "fiche de fabrication Brevo inchangée");
  await silence(() => tachePlanifiee(env));
  assert.ok(!emails.some(m => m.tags[0] === "fabricant"), "payee : pas d'envoi automatique au fabricant");

  ecrire("cs_test_std", { Statut: "envoyee_fabricant" });                      /* validation à la main par le propriétaire */
  const journal = await suiteFabricant("cs_test_std", async texte => {
    const lien = /Fichier STL : (https:\/\/w\.dev\/fichier\/\S+)/.exec(texte);
    assert.ok(lien, "lien STL R2 dans l'e-mail");
    const f = await appeler(lien[1]);
    assert.equal(f.status, 200);
    assert.deepEqual(new Uint8Array(await f.arrayBuffer()), STL);
    assert.doesNotMatch(texte, /rue des Lilas/, "adresse non transmise : le fabricant ne livre pas le client");
  });
  assert.deepEqual(journal, ["payee/worker", "envoyee_fabricant/proprietaire", "acceptee/fabricant", "expediee/fabricant"]);
});

test("Parcours sur-mesure : paiement → fichier_a_produire → lien Drive → e-mail fabricant (livre le client) → acceptee → expediee", async () => {
  sheet.Fabricants[1][3] = "oui";
  lignesStripe = [{ description: "Boîte rugged — Sur-mesure", quantity: 1, amount_total: 5900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "custom", cotes_mm: '{"a":142,"b":60,"c":45}', coloris: "noir" } } } }];
  assert.equal((await webhook("cs_test_sm")).status, 200);
  assert.equal(ligne("cs_test_sm").Statut, "fichier_a_produire");
  assert.match(ligne("cs_test_sm")["Pièce"], /a=142 b=60 c=45/);

  ecrire("cs_test_sm", { "Lien STL": "https://drive.google.com/file/d/abc/view", Statut: "envoyee_fabricant" });
  const journal = await suiteFabricant("cs_test_sm", async texte => {
    assert.match(texte, /Fichier STL : https:\/\/drive\.google\.com\/file\/d\/abc\/view/);
    assert.doesNotMatch(texte, /\/fichier\//);
    assert.match(texte, /À expédier directement au client :\nCamille Test\n.*rue des Lilas/);
    assert.doesNotMatch(texte, /client@example\.com/, "pas d'e-mail client transmis");
  });
  assert.deepEqual(journal, ["fichier_a_produire/worker", "envoyee_fabricant/proprietaire", "acceptee/fabricant", "expediee/fabricant"]);
});

test("Standard sans binding R2 : e-mail fabricant envoyé quand même, « fourni séparément »", async () => {
  lignesStripe = [{ description: "Boîte rugged — M", quantity: 1, amount_total: 4900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "standard", taille: "M", cotes_mm: "{}", coloris: "noir" } } } }];
  const sansR2 = { ...env }; delete sansR2.STL;
  await webhook("cs_test_r2");
  ecrire("cs_test_r2", { Statut: "envoyee_fabricant" });
  await silence(() => tachePlanifiee(sansR2));
  assert.match(emails.find(m => m.tags[0] === "fabricant").textContent, /Fichier STL : fourni séparément/);
  assert.equal((await silence(() => worker.fetch(new Request("https://w.dev/fichier/fichier.a.1.b"), sansR2))).status, 503);
});
