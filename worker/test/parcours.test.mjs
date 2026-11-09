/* Recette de bout en bout (bloc E) : webhook Stripe → choix du fabricant → n° CF → liens fournisseur → expédition.
   Stripe (mode test), Google Sheets, Brevo et R2 simulés : aucun appel réel. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";
import { viderCacheJeton, reglerAttentes } from "../src/google.js";
reglerAttentes([0, 0]); /* nouveaux essais sans attente dans les tests */
import { reglages } from "../src/sheet.js";
import { tachePlanifiee } from "../src/planifie.js";
import { COL_CF, COL_EV, ENTETES_CF, ENTETES_EV, objet, appliquerFormules } from "./entetes.mjs";

reglages.attenteVerificationMs = 0;
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const STL = new TextEncoder().encode("solid boite-rugged-m\nendsolid\n");
const r2 = { async head(k) { return k === "boite-rugged/m.stl" ? { size: STL.length } : null; },
  async get(k) { return k === "boite-rugged/m.stl" ? { size: STL.length, body: new Blob([STL]).stream() } : null; } };
const FAB = "Atelier Dupont", FAB2 = "Studio Martin";
const env = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice", HMAC_SECRET: "secret-de-test",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "proprio@example.com", WORKER_URL: "https://w.dev", STL: r2 };

let sheet, emails, lignesStripe;
beforeEach(() => {
  viderCacheJeton();
  sheet = { "Commandes EV": [ENTETES_EV.slice()], "Commandes CF": [ENTETES_CF.slice()], Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]], Listes: [["Transporteurs"], ["Colissimo"], ["Mondial Relay"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], [FAB, "atelier@example.com", "5", "non"], [FAB2, "studio@example.com", "7", "oui"]] };
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
  if (chemin === "values:batchGet") appliquerFormules(sheet);
  if (chemin === "values:batchGet") return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = plage(r);
    if (ref === "1:1") return { range: r, values: [sheet[onglet][0]] };
    const v = sheet[onglet].map(l => l[col(ref.split(":")[0])] ?? "");
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

async function requeteWebhook(id) {
  const session = { id, created: 1793000000, payment_status: "paid", payment_intent: "pi_1", amount_total: 5490, metadata: { ref: "EV-X", cadeau: "non" },
    customer_details: { name: "Camille Test", email: "client@example.com" },
    collected_information: { shipping_details: { name: "Camille Test", address: { line1: "1 rue des Lilas", postal_code: "75011", city: "Paris", country: "FR" } } } };
  const corps = JSON.stringify({ type: "checkout.session.completed", livemode: false, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const entete = `t=${t},v1=${await signer(env.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`)}`;
  return new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": entete }, body: corps });
}
const webhook = async id => { const r = await requeteWebhook(id); return silence(() => worker.fetch(r, env)); };
/* Commande client par session Stripe ; ses articles (onglet Commandes CF) ; saisie à la main du propriétaire */
const ligne = sid => (appliquerFormules(sheet), 0) || objet(ENTETES_EV, sheet["Commandes EV"].find(l => l[COL_EV["Stripe session id"]] === sid));
const articles = sid => sheet["Commandes CF"].filter(l => l[COL_CF["Commande EV"]] === ligne(sid).Commande).map(l => objet(ENTETES_CF, l));
const ecrire = (sid, n, valeurs) => {
  const r = sheet["Commandes CF"].find(l => l[COL_CF["Commande EV"]] === ligne(sid).Commande && l[COL_CF["Article n°"]] === String(n));
  for (const [k, v] of Object.entries(valeurs)) r[COL_CF[k]] = v;
};
const appeler = (url, champs) => silence(() => worker.fetch(new Request(url, champs ? { method: "POST", body: new URLSearchParams(champs) } : {}), env));
const liensF = texte => texte.match(/https:\/\/w\.dev\/f\/\S+/g);

/* Parcours commun à partir de envoyee_fabricant (un article, une CF) : e-mail fabricant → accepter → expédier → e-mail client */
async function suiteFabricant(sid, verifierEmail, { entrant = false } = {}) {
  const num = ligne(sid).Commande, cf = articles(sid)[0]["Commande CF"];
  assert.equal(cf, num.replace("EV-", "CF-") + "-A");
  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b.notifiees, [`${cf} : envoyee_fabricant`]);
  assert.equal(ligne(sid).Statut, "en_fabrication");
  const mf = emails.find(m => m.tags[0] === "fabricant");
  assert.equal(mf.to[0].email, "atelier@example.com");
  assert.match(mf.subject, new RegExp(`^\\[TEST\\] Commande ${cf} à fabriquer`));
  assert.doesNotMatch(mf.textContent, /EV-\d/, "le fabricant ne voit que le n° CF");
  await verifierEmail(mf.textContent);
  const [accepter, expedier] = liensF(mf.textContent);

  assert.equal((await appeler(accepter)).status, 200, "GET : page avec bouton, rien d'écrit");
  assert.equal(articles(sid)[0].Statut, "envoyee_fabricant");
  assert.equal((await appeler(accepter, {})).status, 200);
  assert.equal(articles(sid)[0].Statut, "acceptee");
  if (entrant) {
    /* Fabricant qui ne livre pas le client : « Déclarer l'expédition » = pièce envoyée à Evarysth, le client n'est pas prévenu */
    assert.match(await (await appeler(expedier)).text(), /Confirmer l&#39;envoi à l&#39;atelier/);
    assert.equal((await appeler(expedier, { transporteur: "Colissimo", suivi: "6A12345678901" })).status, 200);
    assert.equal(articles(sid)[0].Statut, "a_reexpedier");
    assert.ok(!articles(sid)[0]["N° de suivi"], "le suivi du colis client reste vide");
    assert.match(articles(sid)[0].Notes, /expédiée par Atelier Dupont à l'atelier Evarysth \(Colissimo · 6A12345678901\)/);
    const b1 = await silence(() => tachePlanifiee(env));
    assert.deepEqual(b1.notifiees, [`${cf} : a_reexpedier`]);
    assert.equal(emails.filter(m => m.tags[0] === "expedition").length, 0, "aucun e-mail « expédiée » au client");
    assert.equal(ligne(sid).Statut, "en_fabrication");
    assert.match(await (await appeler(expedier, { transporteur: "Colissimo", suivi: "AUTRE" })).text(), /Déjà confirmée/);
    assert.match(await (await appeler(accepter, {})).text(), /Déjà confirmée/, "« accepter » après l'envoi de la pièce : déjà fait");
    ecrire(sid, 1, { Transporteur: "Colissimo", "N° de suivi": "6A12345678901", Statut: "expediee" });   /* réexpédition au client, à la main dans le Sheet */
  } else {
    assert.equal((await appeler(expedier, { transporteur: "Colissimo", suivi: "6A12345678901" })).status, 200);
  }
  assert.equal(articles(sid)[0].Statut, "expediee");
  assert.equal(articles(sid)[0]["N° de suivi"], "6A12345678901");

  const b2 = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b2.notifiees, [`${cf} : expediee`], "un seul passage après les deux clics : expediee notifiée");
  const mc = emails.find(m => m.tags[0] === "expedition");
  assert.equal(mc.to[0].email, "client@example.com");
  assert.match(mc.subject, new RegExp(`Commande ${num} expédiée`));
  assert.match(mc.textContent, /Colissimo/);
  assert.match(mc.textContent, /6A12345678901/);
  assert.equal(articles(sid)[0]["Dernier statut notifié"], "expediee");
  assert.equal(ligne(sid).Statut, "expediee");
  assert.deepEqual((await silence(() => tachePlanifiee(env))).notifiees, [], "rien de plus au passage suivant");
  return sheet.Journal.slice(1).filter(l => l[1] === num || l[1] === cf).map(l => `${l[1].slice(0, 2)}:${l[3]}/${l[4]}`);
}

test("Parcours standard : paiement → a_valider → validation → e-mail fabricant avec lien STL R2 → acceptee → expediee → e-mail client", async () => {
  lignesStripe = [{ description: "Boîte rugged — M", quantity: 1, amount_total: 4900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "standard", taille: "M", cotes_mm: '{"a":150,"b":100,"c":50}', coloris: "noir" } } } }];
  assert.equal((await webhook("cs_test_std")).status, 200);
  const r = ligne("cs_test_std");
  assert.equal(r.Statut, "payee");
  assert.equal(r.Type, "standard");
  assert.equal(articles("cs_test_std").length, 1);
  assert.equal(articles("cs_test_std")[0].Fabricant, "", "fabricant choisi par le propriétaire");
  assert.ok(emails.some(m => m.tags[0] === "commande-recue"), "e-mail client « commande reçue »");
  assert.ok(emails.some(m => m.tags[0] === "commande" && m.to[0].email === "proprio@example.com"), "fiche de fabrication Brevo inchangée");
  ecrire("cs_test_std", 1, { Fabricant: FAB });                                 /* choix du fabricant à la main */
  await silence(() => tachePlanifiee(env));
  assert.equal(articles("cs_test_std")[0]["Commande CF"], r.Commande.replace("EV-", "CF-") + "-A", "n° CF attribué");
  assert.equal(ligne("cs_test_std")["Commandes CF"], articles("cs_test_std")[0]["Commande CF"]);
  assert.ok(!emails.some(m => m.tags[0] === "fabricant"), "payee : pas d'envoi automatique au fabricant");

  ecrire("cs_test_std", 1, { Statut: "envoyee_fabricant" });                   /* validation à la main par le propriétaire */
  const journal = await suiteFabricant("cs_test_std", async texte => {
    const lien = /Fichier STL : (https:\/\/w\.dev\/fichier\/\S+)/.exec(texte);
    assert.ok(lien, "lien STL R2 dans l'e-mail");
    const f = await appeler(lien[1]);
    assert.equal(f.status, 200);
    assert.deepEqual(new Uint8Array(await f.arrayBuffer()), STL);
    assert.doesNotMatch(texte, /rue des Lilas/, "adresse non transmise : le fabricant ne livre pas le client");
    assert.match(texte, /Pièce à nous renvoyer/);
  }, { entrant: true });
  assert.deepEqual(journal, ["EV:payee/worker", "EV:fabrication_non_configuree/worker", "CF:envoyee_fabricant/proprietaire", "EV:en_fabrication/worker", "CF:acceptee/fabricant",
    "CF:a_reexpedier/fabricant", "CF:expediee/proprietaire", "EV:expediee/worker"]);
});

test("Parcours sur-mesure : paiement → lien_stl_a_indiquer → lien Drive → e-mail fabricant (livre le client) → acceptee → expediee", async () => {
  sheet.Fabricants[1][3] = "oui";
  lignesStripe = [{ description: "Boîte rugged — Sur-mesure", quantity: 1, amount_total: 5900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "custom", cotes_mm: '{"a":142,"b":60,"c":45}', coloris: "noir" } } } }];
  assert.equal((await webhook("cs_test_sm")).status, 200);
  assert.equal(ligne("cs_test_sm").Statut, "payee");
  assert.equal(articles("cs_test_sm")[0].Statut, "lien_stl_a_indiquer");
  assert.match(articles("cs_test_sm")[0].Article, /a=142 b=60 c=45/);

  ecrire("cs_test_sm", 1, { Fabricant: FAB, "Lien STL": "https://drive.google.com/file/d/abc/view" });
  await silence(() => tachePlanifiee(env));
  ecrire("cs_test_sm", 1, { Statut: "envoyee_fabricant" });
  const journal = await suiteFabricant("cs_test_sm", async texte => {
    assert.match(texte, /Fichier STL : https:\/\/drive\.google\.com\/file\/d\/abc\/view/);
    assert.doesNotMatch(texte, /\/fichier\//);
    assert.match(texte, /À expédier directement au client :\nCamille Test\n.*rue des Lilas/);
    assert.doesNotMatch(texte, /client@example\.com/, "pas d'e-mail client transmis");
  });
  assert.deepEqual(journal, ["EV:payee/worker", "EV:fabrication_non_configuree/worker", "CF:envoyee_fabricant/proprietaire", "EV:en_fabrication/worker", "CF:acceptee/fabricant",
    "CF:expediee/fabricant", "EV:expediee/worker"]);
});

test("Standard sans binding R2 : pas d'e-mail fabricant sans lien STL ; parti dès que le lien est saisi", async () => {
  lignesStripe = [{ description: "Boîte rugged — M", quantity: 1, amount_total: 4900,
    price: { product: { metadata: { produit: "boite-rugged", mode: "standard", taille: "M", cotes_mm: "{}", coloris: "noir" } } } }];
  const sansR2 = { ...env }; delete sansR2.STL;
  const req = await requeteWebhook("cs_test_r2");
  await silence(() => worker.fetch(req, sansR2));
  assert.equal(articles("cs_test_r2")[0].Statut, "lien_stl_a_indiquer");
  ecrire("cs_test_r2", 1, { Fabricant: FAB, Statut: "envoyee_fabricant" });
  const b = await silence(() => tachePlanifiee(sansR2));
  assert.match(b.attente.join(), /lien STL manquant/);
  assert.ok(!emails.some(m => m.tags[0] === "fabricant"));
  ecrire("cs_test_r2", 1, { "Lien STL": "https://drive.google.com/file/d/std/view" });
  await silence(() => tachePlanifiee(sansR2));
  assert.match(emails.find(m => m.tags[0] === "fabricant").textContent, /Fichier STL : https:\/\/drive\.google\.com\/file\/d\/std\/view/);
  assert.equal((await silence(() => worker.fetch(new Request("https://w.dev/fichier/fichier.a.1.b"), sansR2))).status, 503);
});

test("Parcours deux fabricants : 2 CF, un e-mail chacun, 2 colis, statut client partiel puis expédié", async () => {
  lignesStripe = [
    { description: "Boîte rugged — M", quantity: 1, amount_total: 4900, price: { product: { metadata: { produit: "boite-rugged", mode: "standard", taille: "M", coloris: "noir" } } } },
    { description: "Boîte rugged — Sur-mesure", quantity: 1, amount_total: 5900, price: { product: { metadata: { produit: "boite-rugged", mode: "custom", cotes_mm: '{"a":142}', coloris: "noir" } } } }
  ];
  sheet.Fabricants[1][3] = "oui";                          /* les deux fabricants livrent le client : un colis chacun */
  await webhook("cs_test_2f");
  const num = ligne("cs_test_2f").Commande, base = num.replace("EV-", "CF-");
  assert.equal(articles("cs_test_2f").length, 2);
  ecrire("cs_test_2f", 1, { Fabricant: FAB, Statut: "envoyee_fabricant" });
  ecrire("cs_test_2f", 2, { Fabricant: FAB2, "Lien STL": "https://drive.google.com/file/d/sm/view", Statut: "envoyee_fabricant" });
  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual(articles("cs_test_2f").map(a => a["Commande CF"]), [`${base}-A`, `${base}-B`]);
  assert.deepEqual(b.notifiees.sort(), [`${base}-A : envoyee_fabricant`, `${base}-B : envoyee_fabricant`]);
  const [ma, mb] = ["atelier@example.com", "studio@example.com"].map(e => emails.find(m => m.tags[0] === "fabricant" && m.to[0].email === e));
  assert.match(ma.subject, new RegExp(`${base}-A`)); assert.match(mb.subject, new RegExp(`${base}-B`));
  assert.match(mb.textContent, /À expédier directement au client/, "le 2e fabricant livre le client");
  assert.equal(ligne("cs_test_2f")["Commandes CF"], `${base}-A\n${base}-B`);

  const [, expA] = liensF(ma.textContent), [, expB] = liensF(mb.textContent);
  assert.equal((await appeler(expA, { transporteur: "Colissimo", suivi: "COL1" })).status, 200, "expédition directe sans « accepter »");
  await silence(() => tachePlanifiee(env));
  assert.equal(ligne("cs_test_2f").Statut, "partiellement_expediee");
  const c1 = emails.filter(m => m.tags[0] === "expedition");
  assert.equal(c1.length, 1);
  assert.match(c1[0].textContent, /Un colis de votre commande[\s\S]*autre colis[\s\S]*COL1/);

  assert.equal((await appeler(expB, { transporteur: "Mondial Relay", suivi: "MR2" })).status, 200);
  await silence(() => tachePlanifiee(env));
  assert.equal(ligne("cs_test_2f").Statut, "expediee");
  const c2 = emails.filter(m => m.tags[0] === "expedition");
  assert.equal(c2.length, 2);
  assert.match(c2[1].textContent, /entièrement en route[\s\S]*MR2/);
  for (const m of c2) assert.doesNotMatch(m.textContent, /CF-\d/, "le client ne voit que le n° EV");
});
