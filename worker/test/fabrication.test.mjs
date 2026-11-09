/* Chaîne de fabrication (Fabrication · phase 2a) : déclenchement au paiement, idempotence, rappel signé HMAC,
   nouveaux essais par la tâche planifiée, absence de configuration. Stripe, Google Sheets, Brevo et GitHub simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";
import { viderCacheJeton, reglerAttentes } from "../src/google.js";
import { reglages } from "../src/sheet.js";
import { parametresSession, lirePanier } from "../src/commande.js";
import { COLS, ESSAIS_MAX, GEN, lireRef, refArticle, relancerDeclenchements, routeRetour, verifierRappel, versionSite, viderCacheVersion } from "../src/fabrication.js";
import { ENTETES_CF, ENTETES_EV } from "./entetes.mjs";

reglerAttentes([0, 0]);
reglages.attenteVerificationMs = 0;
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const SHA = "0123456789abcdef0123456789abcdef01234567", SHA2 = "89abcdef0123456789abcdef0123456789abcdef";
const HMAC = "secret-fabrication-de-test";
const BASE = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice", HMAC_SECRET: "secret-de-test",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "proprio@example.com", WORKER_URL: "https://w.dev" };
const CONFIG = { ...BASE, GH_ACTIONS_TOKEN: "github_pat_factice", FABRICATION_HMAC: HMAC };
const SUIVI = Object.values(COLS);

let sheet, appels, github, lignesStripe, metaSession, versionJson;
const nouveauSheet = (colonnesSuivi = true) => ({ "Commandes EV": [ENTETES_EV.slice()], "Commandes CF": [ENTETES_CF.concat(colonnesSuivi ? SUIVI : [])],
  Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]], Listes: [["Transporteurs"], ["Colissimo"]],
  Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"]] });
beforeEach(() => {
  viderCacheJeton(); viderCacheVersion();
  sheet = nouveauSheet();
  appels = []; github = { statut: 204 }; metaSession = { ref: "EV-X", cadeau: "non", sha: SHA }; versionJson = { sha: SHA2 };
  lignesStripe = [
    { description: "Passe-câble", quantity: 2, amount_total: 1800,
      price: { product: { metadata: { produit: "passe-cable", mode: "standard", taille: "Ø 60", cotes_mm: '{"a":60}', coloris: "marine" } } } },
    { description: "Emballage cadeau", quantity: 1, amount_total: 300, price: { product: { metadata: { produit: "emballage-cadeau" } } } },
    { description: "Tablette", quantity: 1, amount_total: 3900,
      price: { product: { metadata: { produit: "tablette-rambarde", mode: "custom", cotes_mm: '{"a":45,"b":250}', coloris: "noir" } } } }];
  globalThis.fetch = fauxFetch;
});

const col = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const plage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o.replace(/''/g, "'"), ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200) => new Response(d === null ? null : JSON.stringify(d), { status: s });
  appels.push({ host: u.host, chemin: u.pathname, corps: init.body, entetes: init.headers });
  if (u.host === "evarysth.fr" && u.pathname === "/version.json") return versionJson ? rep(versionJson) : rep({}, 404);
  if (u.host === "api.github.com") {
    if (typeof github.statut === "function") return rep(...github.statut());
    return github.statut === 204 ? new Response(null, { status: 204 }) : rep({ message: "Server Error" }, github.statut);
  }
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host === "api.stripe.com" && u.pathname.endsWith("/line_items")) return rep({ data: lignesStripe });
  if (u.host === "api.stripe.com" && u.pathname.startsWith("/v1/checkout/sessions/")) return rep({ id: "cs", metadata: metaSession });
  if (u.host === "api.stripe.com") throw new Error("Appel Stripe inattendu : " + url);
  if (u.host === "api.brevo.com") return rep({ messageId: "m" }, 201);
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
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

async function webhook(env, id = "cs_test_fab") {
  const session = { id, created: 1793000000, payment_status: "paid", payment_intent: "pi_1", amount_total: 6290, metadata: metaSession,
    customer_details: { name: "Camille Test", email: "client@example.com" },
    collected_information: { shipping_details: { name: "Camille Test", address: { line1: "1 rue des Lilas", postal_code: "75011", city: "Paris", country: "FR" } } } };
  const corps = JSON.stringify({ type: "checkout.session.completed", livemode: false, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const req = new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": `t=${t},v1=${await signer(env.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`)}` }, body: corps });
  return silence(() => worker.fetch(req, env));
}
const dispatches = () => appels.filter(a => a.host === "api.github.com");
const lignesCF = () => { const [e, ...ls] = sheet["Commandes CF"]; return ls.map(l => Object.fromEntries(e.map((n, i) => [n, l[i] ?? ""]))); };
const journal = () => sheet.Journal.slice(1).map(l => `${l[1]}:${l[3]}`);

async function rappel(env, corpsObj, { ts = Math.floor(Date.now() / 1000), secret = HMAC, sig } = {}) {
  const corps = JSON.stringify(corpsObj);
  sig ??= await signer(secret, `${ts}.${corps}`);
  return silence(() => worker.fetch(new Request("https://w.dev/fabrication/retour", { method: "POST", body: corps,
    headers: { "Content-Type": "application/json", "X-Evarysth-Horodatage": String(ts), "X-Evarysth-Signature": sig } }), env));
}

/* ─── Absence de configuration ─── */
test("non configurée (ni GH_ACTIONS_TOKEN ni FABRICATION_HMAC) : aucun déclenchement, Journal noté une fois, commande normale", async () => {
  assert.equal((await webhook(BASE)).status, 200);
  assert.equal(dispatches().length, 0, "aucun appel à GitHub");
  assert.equal(lignesCF().length, 2, "articles enregistrés comme avant (emballage cadeau exclu)");
  assert.deepEqual(journal(), ["EV-2026-0001:payee", "EV-2026-0001:fabrication_non_configuree"]);
  assert.ok(lignesCF().every(l => l[COLS.generation] === ""), "colonnes de suivi laissées vides");
  assert.equal((await webhook(BASE)).status, 200);
  assert.deepEqual(journal(), ["EV-2026-0001:payee", "EV-2026-0001:fabrication_non_configuree"], "rien de plus au 2e webhook");
});

test("non configurée : un seul des deux secrets ne suffit pas", async () => {
  for (const env of [{ ...BASE, GH_ACTIONS_TOKEN: "x" }, { ...BASE, FABRICATION_HMAC: "x" }]) {
    sheet = nouveauSheet();
    assert.equal((await webhook(env)).status, 200);
    assert.equal(dispatches().length, 0);
    assert.ok(journal().includes("EV-2026-0001:fabrication_non_configuree"));
  }
});

test("non configurée : tâche planifiée et rappel sans effet", async () => {
  assert.deepEqual(await relancerDeclenchements(BASE), { inactive: true });
  const r = await rappel(BASE, { cf: "CF-2026-0001-1", sha: SHA, statut: "prete" });
  assert.equal(r.status, 503);
  assert.equal(appels.length, 0);
});

/* ─── Déclenchement simulé ─── */
test("webhook payé → un workflow_dispatch par article (entrées limitées, sans donnée client), suivi « en_cours »", async () => {
  assert.equal((await webhook(CONFIG)).status, 200);
  const d = dispatches();
  assert.equal(d.length, 2, "deux articles, emballage cadeau exclu");
  assert.equal(d[0].chemin, "/repos/virnichka/evarysth/actions/workflows/fabrication.yml/dispatches");
  assert.equal(d[0].entetes.Authorization, "Bearer github_pat_factice");
  const corps = d.map(x => JSON.parse(x.corps));
  assert.deepEqual(corps[0], { ref: "main", inputs: { cf: "CF-2026-0001-1", produit: "passe-cable", cotes: '{"a":60}', coloris: "marine", quantite: "2", sha: SHA } });
  assert.deepEqual(corps[1].inputs, { cf: "CF-2026-0001-2", produit: "tablette-rambarde", cotes: '{"a":45,"b":250}', coloris: "noir", quantite: "1", sha: SHA });
  for (const c of corps) {
    assert.deepEqual(Object.keys(c.inputs).sort(), ["cf", "coloris", "cotes", "produit", "quantite", "sha"]);
    assert.doesNotMatch(JSON.stringify(c), /Camille|example\.com|Lilas|75011|EV-|62\.9|6290/, "aucune donnée client, ni n° EV, ni montant");
  }
  assert.deepEqual(lignesCF().map(l => [l[COLS.generation], l[COLS.sha], l[COLS.motif]]), [[GEN.cours, SHA, ""], [GEN.cours, SHA, ""]]);
  assert.deepEqual(journal(), ["EV-2026-0001:payee"], "pas de ligne « non configurée »");
});

test("idempotence : webhook reçu deux fois → aucun second déclenchement", async () => {
  await webhook(CONFIG);
  await webhook(CONFIG);
  assert.equal(dispatches().length, 2);
});

test("idempotence sans colonnes de suivi : déclenché au 1er webhook seulement, colonnes absentes ignorées sans erreur", async () => {
  sheet = nouveauSheet(false);
  assert.equal((await webhook(CONFIG)).status, 200);
  assert.equal((await webhook(CONFIG)).status, 200);
  assert.equal(dispatches().length, 2);
  assert.deepEqual(await relancerDeclenchements(CONFIG), { inactive: "colonnes" });
  const r = await rappel(CONFIG, { cf: "CF-2026-0001-1", sha: SHA, statut: "prete", masse_g: 1 });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { recu: true, colonnes: false });
});

test("SHA absent des metadata Stripe → version.json relu au webhook ; illisible → échec noté, rien déclenché", async () => {
  metaSession = { ref: "EV-X", cadeau: "non" };
  await webhook(CONFIG);
  assert.equal(JSON.parse(dispatches()[0].corps).inputs.sha, SHA2);
  sheet = nouveauSheet(); appels = []; viderCacheVersion(); versionJson = null;
  await webhook(CONFIG);
  assert.equal(dispatches().length, 0);
  assert.deepEqual(lignesCF().map(l => l[COLS.generation]), [GEN.echec, GEN.echec]);
  assert.match(lignesCF()[0][COLS.motif], /SHA du site inconnu/);
});

test("GitHub en panne : commande enregistrée (200), article « a_declencher », nouvel essai par la tâche planifiée", async () => {
  github.statut = 503;
  assert.equal((await webhook(CONFIG)).status, 200, "le paiement n'est jamais bloqué");
  assert.deepEqual(lignesCF().map(l => l[COLS.generation]), [GEN.attente, GEN.attente]);
  assert.match(lignesCF()[0][COLS.motif], /GitHub 503.*essai 1\/6/);
  appels = [];
  github.statut = 204;
  const b = await silence(() => relancerDeclenchements(CONFIG));
  assert.deepEqual(b.relances, ["CF-2026-0001-1", "CF-2026-0001-2"]);
  assert.deepEqual(JSON.parse(dispatches()[1].corps).inputs, { cf: "CF-2026-0001-2", produit: "tablette-rambarde", cotes: '{"a":45,"b":250}', coloris: "noir", quantite: "1", sha: SHA });
  assert.deepEqual(lignesCF().map(l => [l[COLS.generation], l[COLS.motif]]), [[GEN.cours, ""], [GEN.cours, ""]]);
  assert.deepEqual((await silence(() => relancerDeclenchements(CONFIG))).relances, [], "rien de plus ensuite");
});

test(`nouveaux essais limités : échec définitif après ${ESSAIS_MAX} déclenchements`, async () => {
  github.statut = 422;
  await webhook(CONFIG);
  for (let i = 2; i <= ESSAIS_MAX; i++) await silence(() => relancerDeclenchements(CONFIG));
  assert.deepEqual(lignesCF().map(l => l[COLS.generation]), [GEN.echec, GEN.echec]);
  assert.match(lignesCF()[0][COLS.motif], /impossible après 6 essais \(GitHub 422/);
  const n = dispatches().length;
  await silence(() => relancerDeclenchements(CONFIG));
  assert.equal(dispatches().length, n, "plus aucun essai");
  assert.equal(n, 2 * ESSAIS_MAX);
});

/* ─── Rappel signé HMAC ─── */
test("rappel valide → colonnes Génération, SHA, Masse g, Temps min, Plateaux, Motif génération", async () => {
  await webhook(CONFIG);
  const r = await rappel(CONFIG, { cf: "CF-2026-0001-2", sha: SHA, statut: "prete", masse_g: 41.2, temps_min: 95, plateaux: 1, motif: "" });
  assert.equal(r.status, 200);
  const l = lignesCF()[1];
  assert.deepEqual([l[COLS.generation], l[COLS.sha], l[COLS.masse], l[COLS.temps], l[COLS.plateaux], l[COLS.motif]], [GEN.prete, SHA, 41.2, 95, 1, ""]);
  assert.equal(lignesCF()[0][COLS.generation], GEN.cours, "l'autre article n'est pas touché");
  const e = await rappel(CONFIG, { cf: "CF-2026-0001-1", sha: SHA, statut: "echec", motif: "génération : cote hors bornes" });
  assert.equal(e.status, 200);
  assert.deepEqual([lignesCF()[0][COLS.generation], lignesCF()[0][COLS.motif]], [GEN.echec, "génération : cote hors bornes"]);
});

test("rappel : signature invalide, autre secret, rejoué (horodatage ancien) ou absent → 401, rien d'écrit", async () => {
  await webhook(CONFIG);
  const corps = { cf: "CF-2026-0001-1", sha: SHA, statut: "prete", masse_g: 1 };
  assert.equal((await rappel(CONFIG, corps, { sig: "0".repeat(64) })).status, 401);
  assert.equal((await rappel(CONFIG, corps, { secret: "autre" })).status, 401);
  assert.equal((await rappel(CONFIG, corps, { ts: Math.floor(Date.now() / 1000) - 600 })).status, 401, "rejeu après 10 min");
  assert.equal((await rappel(CONFIG, corps, { ts: Math.floor(Date.now() / 1000) + 600 })).status, 401, "horodatage futur");
  const sansEntete = await silence(() => worker.fetch(new Request("https://w.dev/fabrication/retour", { method: "POST", body: JSON.stringify(corps) }), CONFIG));
  assert.equal(sansEntete.status, 401);
  /* signature d'un autre corps rejouée sur celui-ci */
  const ts = Math.floor(Date.now() / 1000), autre = await signer(HMAC, `${ts}.${JSON.stringify({ ...corps, statut: "echec" })}`);
  assert.equal((await rappel(CONFIG, corps, { ts, sig: autre })).status, 401);
  assert.ok(lignesCF().every(l => l[COLS.generation] === GEN.cours), "rien d'écrit");
  assert.equal((await silence(() => worker.fetch(new Request("https://w.dev/fabrication/retour"), CONFIG))).status, 405);
});

test("rappel : même requête rejouée dans la fenêtre → même écriture (idempotent) ; SHA d'un autre run → 409 ; inconnu → 404 ; invalide → 400", async () => {
  await webhook(CONFIG);
  const corps = { cf: "CF-2026-0001-1", sha: SHA, statut: "prete", masse_g: 10, temps_min: 20, plateaux: 1 };
  const ts = Math.floor(Date.now() / 1000), sig = await signer(HMAC, `${ts}.${JSON.stringify(corps)}`);
  assert.equal((await rappel(CONFIG, corps, { ts, sig })).status, 200);
  assert.equal((await rappel(CONFIG, corps, { ts, sig })).status, 200);
  assert.equal(lignesCF()[0][COLS.masse], 10);
  assert.equal((await rappel(CONFIG, { ...corps, sha: SHA2, masse_g: 99 })).status, 409);
  assert.equal(lignesCF()[0][COLS.masse], 10);
  assert.equal((await rappel(CONFIG, { ...corps, cf: "CF-2026-0099-1" })).status, 404);
  assert.equal((await rappel(CONFIG, { ...corps, cf: "CF-2026-0001-A" })).status, 400, "n° CF fournisseur (lettre) refusé");
  assert.equal((await rappel(CONFIG, { ...corps, statut: "en_cours" })).status, 400);
});

test("verifierRappel : formats et fenêtre de 5 min", async () => {
  const ts = "1793000000", sig = await signer("k", `${ts}.{}`);
  assert.equal(await verifierRappel("{}", ts, sig, "k", 1793000000 + 299), true);
  assert.equal(await verifierRappel("{}", ts, sig, "k", 1793000000 + 301), false);
  assert.equal(await verifierRappel("{}", ts, sig.toUpperCase(), "k", 1793000000), false);
  assert.equal(await verifierRappel("{}", ts, sig, "", 1793000000), false);
});

/* ─── N° d'article, SHA du site ─── */
test("n° d'article : CF-AAAA-NNNN-<n> ↔ commande EV + article", () => {
  assert.equal(refArticle("EV-2026-0042", 3), "CF-2026-0042-3");
  assert.deepEqual(lireRef("CF-2026-0042-3"), { ev: "EV-2026-0042", n: "3" });
  assert.equal(lireRef("CF-2026-0042-A"), null);
  assert.equal(lireRef("EV-2026-0042"), null);
});

test("version.json → SHA dans les metadata de la session Stripe ; site injoignable → paiement inchangé, sans SHA", async () => {
  assert.equal(await versionSite({}), SHA2);
  versionJson = null;
  assert.equal(await versionSite({}), SHA2, "gardé 60 s");
  viderCacheVersion();
  assert.equal(await versionSite({}), "");
  globalThis.fetch = async () => { throw new Error("réseau"); };
  viderCacheVersion();
  assert.equal(await versionSite({}), "", "ne lève jamais");
  const lignes = lirePanier({ items: [{ id: "passe-cable", mode: "standard", variant: 1, color: "noir", qty: 1 }] });
  const opts = { base: "https://www.evarysth.fr/", retour: "https://www.evarysth.fr/", ref: "EV-1", catalogue: "abc", environnement: "test" };
  assert.equal(parametresSession(lignes, { ...opts, sha: SHA }).metadata.sha, SHA);
  assert.equal("sha" in parametresSession(lignes, opts).metadata, false);
});

test("POST /checkout : SHA du site lu et passé à Stripe", async () => {
  let params = null;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === "/version.json") return new Response(JSON.stringify({ sha: SHA }));
    if (u.host === "api.stripe.com") { params = new URLSearchParams(init.body); return new Response(JSON.stringify({ id: "cs", url: "https://checkout.stripe.com/x" })); }
    throw new Error(url);
  };
  const r = await silence(() => worker.fetch(new Request("https://w.dev/checkout", { method: "POST", headers: { Origin: "https://www.evarysth.fr", "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: "passe-cable", mode: "standard", variant: 1, color: "noir", qty: 1 }], base: "https://www.evarysth.fr/" }) }), CONFIG));
  assert.equal(r.status, 200);
  assert.equal(params.get("metadata[sha]"), SHA);
});
