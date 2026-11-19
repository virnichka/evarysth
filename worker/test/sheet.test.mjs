/* Tests du back-office Google Sheet : Google, Stripe et Brevo simulés, aucun appel réel */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";
import { jetonAcces, jwtCompteService, viderCacheJeton, lettreColonne, reglerAttentes } from "../src/google.js";
reglerAttentes([0, 0]); /* nouveaux essais sans attente dans les tests */
import { prochainNumero, reglages, dateParis } from "../src/sheet.js";
import { COL_EV, ENTETES_CF, ENTETES_EV } from "./entetes.mjs";
import { completerFrais, margeCommande, versNombre } from "../src/finances.js";
import { noterCouts } from "../src/sheet.js";

reglages.attenteVerificationMs = 0;

/* Clé de compte de service factice, générée pour les tests */
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const base = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice" };
const envGoogle = { ...base, GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM.replace(/\n/g, "\\n"), SHEET_ID: "id-factice",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "atelier@example.com" };

const SID = COL_EV["Stripe session id"];

/* Faux classeur : onglet → tableau de lignes (ligne 1 = en-têtes) */
let sheet, jetons, brevo, appelsGoogle, panneGoogle, apresEcriture, lignesStripe, sessionStripe;
beforeEach(() => {
  viderCacheJeton();
  sheet = {
    "Commandes EV": [ENTETES_EV.slice(), ["EV-2026-0007", "2026-01-02 10:00", "livree", "", "standard", "x", "", "CF-2026-0007-A", "", "livree", "cs_test_ancien", "à garder"]],
    "Commandes CF": [ENTETES_CF.slice(), ["CF-2026-0007-A", "EV-2026-0007", "1", "2026-01-02 10:00", "livree", "standard", undefined, "x", undefined, "MaxiCAD", "", "", "", "livree", ""]],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], ["À renseigner", "", "5", "non"]]
  };
  jetons = 0; brevo = []; appelsGoogle = []; panneGoogle = false; apresEcriture = null; sessionStripe = null;
  lignesStripe = [{ description: "Tablette café de balcon — Sur-mesure", quantity: 2, amount_total: 7700,
    price: { product: { metadata: { produit: "tablette-rambarde", mode: "custom", cotes_mm: '{"a":45,"b":250}', coloris: "rose" } } } }];
  globalThis.fetch = fauxFetch;
});

const col = lettre => [...lettre].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function lirePlage(a1) {
  const [, onglet, ref] = /^'(.+)'!(.+)$/.exec(a1);
  return { onglet: onglet.replace(/''/g, "'"), ref };
}

async function fauxFetch(url, init = {}) {
  const u = new URL(url);
  const rep = (d, statut = 200) => new Response(JSON.stringify(d), { status: statut });
  if (u.host === "oauth2.googleapis.com") {
    jetons++;
    const jwt = new URLSearchParams(init.body).get("assertion");
    const [e, c, s] = jwt.split(".");
    const sig = Buffer.from(s, "base64url");
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", paire.publicKey, sig, new TextEncoder().encode(`${e}.${c}`));
    const charge = JSON.parse(Buffer.from(c, "base64url").toString());
    if (!ok || charge.iss !== envGoogle.GOOGLE_SA_EMAIL || charge.aud !== "https://oauth2.googleapis.com/token") return rep({ error: "invalid_grant" }, 400);
    return rep({ access_token: `ya29.jeton${jetons}`, expires_in: 3599 });
  }
  if (u.host === "sheets.googleapis.com") {
    assert.match(init.headers.Authorization, /^Bearer ya29\./);
    const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
    appelsGoogle.push({ methode: init.method || "GET", chemin, params: Object.fromEntries(u.searchParams) });
    if (panneGoogle) return rep({ error: { message: "Backend Error" } }, 500);
    if (chemin === "values:batchGet") {
      return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
        const { onglet, ref } = lirePlage(r); const c = col(ref.split(":")[0]);
        const v = sheet[onglet].map(l => l[c] ?? "");
        while (v.length && v[v.length - 1] === "") v.pop();
        return { range: r, values: [v] };
      }) });
    }
    const [, a1, action] = /^values\/(.+?)(:append)?$/.exec(chemin);
    const { onglet, ref } = lirePlage(a1);
    const t = sheet[onglet];
    if (action) { t.push(JSON.parse(init.body).values[0]); return rep({}); }
    if (!init.method || init.method === "GET") { assert.equal(ref, "1:1"); return rep({ values: [t[0]] }); }
    assert.equal(u.searchParams.get("valueInputOption"), "RAW");
    const [, c0, l0] = /^([A-Z]+)(\d+)/.exec(ref);
    const ligne = Number(l0) - 1;
    while (t.length <= ligne) t.push([]);
    JSON.parse(init.body).values[0].forEach((v, i) => { if (v !== null) t[ligne][col(c0) + i] = v; });
    if (onglet === "Commandes EV" && apresEcriture) { const f = apresEcriture; apresEcriture = null; f(ligne); }
    return rep({});
  }
  if (u.host === "api.stripe.com" && u.pathname.endsWith("/line_items")) return rep({ data: lignesStripe });
  if (u.host === "api.stripe.com" && sessionStripe && /\/checkout\/sessions\/cs_/.test(u.pathname)) return rep(sessionStripe);   /* frais : payment_intent.latest_charge.balance_transaction */
  if (u.host === "api.brevo.com") { brevo.push(JSON.parse(init.body)); return rep({ messageId: "m1" }, 201); }
  throw new Error("Appel réseau inattendu : " + url);
}

async function webhook(env, id = "cs_test_nouveau", extra = {}) {
  const session = { id, created: 1793000000, payment_status: "paid", payment_intent: "pi_1", amount_total: 8690,
    metadata: { ref: "EV-261107-ABCD", cadeau: "non" }, customer_details: { name: "Camille Test", email: "client@example.com" },
    collected_information: { shipping_details: { name: "Camille Test", address: { line1: "1 rue des Lilas", postal_code: "75011", city: "Paris", country: "FR" } } }, ...extra };
  const corps = JSON.stringify({ type: "checkout.session.completed", livemode: false, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const entete = `t=${t},v1=${await signer(base.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`)}`;
  const log = console.log, warn = console.warn, err = console.error;
  console.log = console.warn = console.error = () => {};
  try { return await worker.fetch(new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": entete }, body: corps }), env); }
  finally { console.log = log; console.warn = warn; console.error = err; }
}
const ligneCommande = sid => { const r = sheet["Commandes EV"].find(l => l[SID] === sid); return r && Object.fromEntries(ENTETES_EV.map((n, i) => [n, r[i]])); };
const articles = numero => sheet["Commandes CF"].filter(l => l[1] === numero).map(r => Object.fromEntries(ENTETES_CF.map((n, i) => [n, r[i]])));

test("Google : JWT RS256 vérifiable avec la clé publique, jeton en cache 1 h", async () => {
  const jwt = await jwtCompteService(envGoogle.GOOGLE_SA_EMAIL, PEM, 1_700_000_000_000);
  const [e, c, s] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(e, "base64url")), { alg: "RS256", typ: "JWT" });
  const charge = JSON.parse(Buffer.from(c, "base64url"));
  assert.equal(charge.scope, "https://www.googleapis.com/auth/spreadsheets");
  assert.equal(charge.exp - charge.iat, 3600);
  assert.equal(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", paire.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${e}.${c}`)), true);

  const t0 = Date.now();
  assert.equal(await jetonAcces(envGoogle, t0), "ya29.jeton1", "clé avec « \\n » littéraux acceptée");
  assert.equal(await jetonAcces(envGoogle, t0 + 30 * 60e3), "ya29.jeton1");
  assert.equal(jetons, 1, "un seul échange pendant l'heure");
  assert.equal(await jetonAcces(envGoogle, t0 + 60 * 60e3), "ya29.jeton2", "renouvelé à l'expiration");
  assert.equal(lettreColonne(0) + lettreColonne(13) + lettreColonne(26), "ANAA");
});

test("n° de commande : plus grand n° de l'année + 1, autres années ignorées", () => {
  assert.equal(prochainNumero([], "2026"), "EV-2026-0001");
  assert.equal(prochainNumero(["EV-2026-0007", "EV-2025-0042", "", "EV-2026-0003", "note"], "2026"), "EV-2026-0008");
  assert.equal(prochainNumero(["EV-2026-9999"], "2026"), "EV-2026-10000");
  assert.equal(dateParis(new Date("2026-07-01T22:30:00Z")), "2026-07-02 00:30");
});

test("webhook : commande sur-mesure ajoutée (format du contrat), e-mail client, Journal ; 2e réception sans doublon", async () => {
  assert.equal((await webhook(envGoogle)).status, 200);
  const r = ligneCommande("cs_test_nouveau");
  assert.equal(r.Commande, "EV-2026-0008");
  assert.equal(sheet["Commandes EV"].indexOf(sheet["Commandes EV"].find(l => l[SID] === "cs_test_nouveau")), 2, "1re ligne vide");
  assert.match(r.Date, /^2026-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(r.Statut, undefined, "Statut : formule du Sheet, jamais écrite par le Worker");
  assert.equal(r.Type, "sur-mesure");
  assert.equal(r.Articles, "tablette-rambarde · a=45 b=250 · ASA · Rose poudré · ×2");
  assert.equal(r.Client, "Camille Test\nclient@example.com\n1 rue des Lilas, 75011 Paris, FR");
  assert.equal(r["Dernier statut notifié"], "payee", "noté après l'e-mail client");
  assert.equal(r["Cadeau / message"], "");
  for (const n of ["Statut forcé", "Commandes CF", "Notes"]) assert.equal(r[n], undefined, `${n} pas écrite par le webhook`);

  const a = articles("EV-2026-0008");
  assert.equal(a.length, 1, "une ligne par article dans Commandes CF");
  assert.equal(sheet["Commandes CF"].indexOf(sheet["Commandes CF"].find(l => l[1] === "EV-2026-0008")), 2, "1re ligne vide");
  assert.equal(a[0]["Article n°"], "1");
  assert.equal(a[0].Date, r.Date);
  assert.equal(a[0].Statut, "lien_stl_a_indiquer", "point de verrou : sur-mesure en attente du lien STL");
  assert.equal(a[0].Type, "sur-mesure");
  assert.equal(a[0].Article, "tablette-rambarde · a=45 b=250 · ASA · Rose poudré · ×2");
  assert.equal(a[0]["Dernier statut notifié"], "lien_stl_a_indiquer", "état initial : rien à notifier");
  for (const n of ["Commande CF", "Action requise", "Fabricant", "Lien STL", "Notes"])
    assert.equal(a[0][n], undefined, `${n} jamais écrite par le webhook`);
  assert.equal(appelsGoogle.filter(x => x.chemin.includes(":append") && x.chemin.includes("Commandes")).length, 0, "pas d'append sur les onglets de commandes");
  assert.deepEqual(sheet.Journal[1].slice(1), ["EV-2026-0008", "", "payee", "worker"]);

  const client = brevo.find(m => m.tags[0] === "commande-recue");
  assert.deepEqual(client.to, [{ email: "client@example.com", name: "Camille Test" }]);
  assert.equal(client.subject, "[TEST] Commande EV-2026-0008 reçue — Evarysth");
  assert.match(client.textContent, /fabriquée à vos cotes/);
  const fiche = brevo.find(m => m.tags[0] === "commande");
  assert.match(fiche.textContent, /Back-office : EV-2026-0008/);
  assert.match(fiche.subject, /Nouvelle commande EV-261107-ABCD/, "fiche de fabrication inchangée");

  assert.equal((await webhook(envGoogle)).status, 200);
  assert.equal(sheet["Commandes EV"].filter(l => l[SID] === "cs_test_nouveau").length, 1, "une seule ligne");
  assert.equal(articles("EV-2026-0008").length, 1, "articles non dupliqués");
  /* Journal : création + « fabrication non configurée » (GH_ACTIONS_TOKEN, FABRICATION_HMAC absents), une seule fois chacune */
  assert.deepEqual(sheet.Journal.slice(1).map(l => l[3]), ["payee", "fabrication_non_configuree"], "Journal non dupliqué au 2e webhook");
  assert.equal(brevo.filter(m => m.tags[0] === "commande-recue").length, 1, "e-mail client envoyé une fois");
  assert.match(brevo.filter(m => m.tags[0] === "commande").at(-1).textContent, /Back-office : EV-2026-0008/);
  assert.equal(sheet["Commandes EV"][1][COL_EV.Notes], "à garder", "ligne existante intacte");
  assert.equal(sheet["Commandes CF"][1][0], "CF-2026-0007-A", "article existant intact");
});

test("webhook : articles déjà en partie écrits (écriture interrompue) → seuls les manquants sont ajoutés", async () => {
  lignesStripe = [
    { description: "A", quantity: 1, amount_total: 3500, price: { product: { metadata: { produit: "tablette-rambarde", mode: "standard", taille: "M", coloris: "noir" } } } },
    { description: "B", quantity: 1, amount_total: 3500, price: { product: { metadata: { produit: "tablette-rambarde", mode: "custom", cotes_mm: '{"a":50}', coloris: "noir" } } } }
  ];
  sheet["Commandes EV"].push(["EV-2026-0008", "2026-11-07 10:00", "payee", "", "sur-mesure", "x", "", "", "", "payee", "cs_test_nouveau", ""]);
  sheet["Commandes CF"].push(["", "EV-2026-0008", "1", "2026-11-07 10:00", "payee", "standard", undefined, "tablette-rambarde · M · x · ×1"]);
  assert.equal((await webhook(envGoogle)).status, 200);
  const a = articles("EV-2026-0008");
  assert.deepEqual(a.map(x => [x["Article n°"], x.Statut, x.Type]), [["1", "payee", "standard"], ["2", "lien_stl_a_indiquer", "sur-mesure"]]);
});

test("webhook : commande standard → lien_stl_a_indiquer (sans R2), emballage cadeau dans « Cadeau / message », pas dans les articles", async () => {
  lignesStripe = [
    { description: "Tablette — Standard", quantity: 1, amount_total: 3500, price: { product: { metadata: { produit: "tablette-rambarde", mode: "standard", taille: "M", cotes_mm: '{"a":45,"b":250}', coloris: "noir" } } } },
    { description: "Emballage cadeau", quantity: 1, amount_total: 300, price: { product: { metadata: { produit: "emballage-cadeau" } } } }
  ];
  assert.equal((await webhook(envGoogle, "cs_test_std", { metadata: { ref: "EV-1", cadeau: "oui", message_cadeau: "Joyeux anniversaire" } })).status, 200);
  const r = ligneCommande("cs_test_std");
  assert.equal(r.Type, "standard");
  assert.match(r.Articles, /^tablette-rambarde · M · ASA · [^·]+ · ×1$/);
  const a = articles(r.Commande);
  assert.equal(a.length, 1, "emballage cadeau : pas de ligne fournisseur");
  assert.equal(a[0].Statut, "lien_stl_a_indiquer", "sans R2 : fichier standard inconnu, lien à indiquer");
  assert.equal(r["Cadeau / message"], "oui · Joyeux anniversaire");
  assert.match(brevo.find(m => m.tags[0] === "commande-recue").textContent, /part en fabrication/);
});

test("webhook : deux commandes simultanées sur la même ligne → n° distincts, aucune perdue", async () => {
  /* Juste après notre écriture, une autre commande (même état lu) écrit la même ligne avec le même n° */
  apresEcriture = ligne => { sheet["Commandes EV"][ligne] = ["EV-2026-0008", "2026-11-07 10:00", "payee", "", "standard", "autre", "", "", "", "", "cs_test_concurrent", ""]; };
  assert.equal((await webhook(envGoogle)).status, 200);
  assert.equal(ligneCommande("cs_test_concurrent").Commande, "EV-2026-0008");
  assert.equal(ligneCommande("cs_test_nouveau").Commande, "EV-2026-0009");
  assert.equal(sheet["Commandes EV"].length, 4);
  assert.equal(articles("EV-2026-0009").length, 1);
});

test("webhook : Google en erreur → 503 (Stripe réessaie), la fiche de fabrication part quand même", async () => {
  panneGoogle = true;
  assert.equal((await webhook(envGoogle)).status, 503);
  assert.equal(brevo.filter(m => m.tags[0] === "commande").length, 1);
  assert.equal(brevo.filter(m => m.tags[0] === "commande-recue").length, 0);
  panneGoogle = false;
  assert.equal((await webhook(envGoogle)).status, 200, "nouvel essai de Stripe");
  assert.equal(ligneCommande("cs_test_nouveau").Commande, "EV-2026-0008");
});

test("sans GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / SHEET_ID : rien ne change, la fiche Brevo part", async () => {
  const sansGoogle = { ...base, BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "atelier@example.com" };
  for (const env of [sansGoogle, { ...sansGoogle, SHEET_ID: "id-factice" }]) {
    brevo = [];
    assert.equal((await webhook(env)).status, 200);
    assert.equal(brevo.length, 1);
    assert.equal(brevo[0].tags[0], "commande");
    assert.doesNotMatch(brevo[0].textContent, /Back-office/);
  }
  assert.equal(appelsGoogle.length + jetons, 0, "aucun appel à Google");
});

test("webhook : commande standard dont le fichier est dans R2 → a_valider (jamais d'envoi automatique)", async () => {
  lignesStripe = [{ description: "Tablette — Standard", quantity: 1, amount_total: 3500, price: { product: { metadata: { produit: "tablette-rambarde", mode: "standard", taille: "M", coloris: "noir" } } } }];
  const r2 = { async head(k) { return k === "tablette-rambarde/m.stl" ? { size: 1 } : null; }, async get() { return null; } };
  assert.equal((await webhook({ ...envGoogle, STL: r2 }, "cs_test_r2")).status, 200);
  const a = articles(ligneCommande("cs_test_r2").Commande);
  assert.deepEqual([a[0].Statut, a[0]["Dernier statut notifié"]], ["a_valider", "a_valider"]);
  assert.ok(!brevo.some(m => m.tags[0] === "fabricant"), "rien au fabricant avant validation");
});

const EN_PLUS_EV = ["Environnement", "Total TTC (€)", "dont livraison (€)", "Remise (€)", "Frais Stripe (€)"];
const parNom = (onglet, i) => Object.fromEntries(sheet[onglet][0].map((n, k) => [n, sheet[onglet][i][k]]));

test("montants : environnement, total, livraison, remise et frais Stripe écrits à la commande si les colonnes existent", async () => {
  sheet["Commandes EV"][0].push(...EN_PLUS_EV);
  sessionStripe = { payment_intent: { latest_charge: { balance_transaction: { fee: 140 } } } };
  assert.equal((await webhook(envGoogle, "cs_test_montants", { total_details: { amount_shipping: 490, amount_discount: 500 } })).status, 200);
  const r = parNom("Commandes EV", 2);
  assert.equal(r["Stripe session id"], "cs_test_montants");
  assert.equal(r.Environnement, "test");
  assert.equal(r["Total TTC (€)"], 86.9);
  assert.equal(r["dont livraison (€)"], 4.9);
  assert.equal(r["Remise (€)"], 5);
  assert.equal(r["Frais Stripe (€)"], 1.4);
  const lignes = sheet["Commandes EV"].length;
  assert.equal((await webhook(envGoogle, "cs_test_montants", { total_details: { amount_shipping: 490, amount_discount: 500 } })).status, 200);
  assert.equal(sheet["Commandes EV"].length, lignes, "2e réception : rien de plus");
});

test("montants : colonnes absentes du Sheet → ignorées ; frais Stripe indisponibles → commande enregistrée quand même", async () => {
  sessionStripe = { payment_intent: { latest_charge: { balance_transaction: { fee: 140 } } } };
  assert.equal((await webhook(envGoogle, "cs_test_sans_colonnes")).status, 200);
  assert.equal(parNom("Commandes EV", 2)["Stripe session id"], "cs_test_sans_colonnes");
  assert.ok(sheet["Commandes EV"][2].length <= ENTETES_EV.length, "aucune cellule écrite hors des colonnes connues");
  sheet["Commandes EV"][0].push(...EN_PLUS_EV);
  sessionStripe = null;                                   /* Stripe ne répond pas : « Appel réseau inattendu » */
  assert.equal((await webhook(envGoogle, "cs_test_sans_frais")).status, 200);
  const r = parNom("Commandes EV", 3);
  assert.equal(r["Total TTC (€)"], 86.9);
  assert.ok(r["Frais Stripe (€)"] === undefined || r["Frais Stripe (€)"] === "", "frais laissés vides, repris par l'entretien");
});

test("entretien des frais : 3 commandes au plus par passage, mode et âge respectés, jamais d'écrasement", async () => {
  sheet["Commandes EV"][0].push(...EN_PLUS_EV);
  const maintenant = Date.UTC(2026, 10, 9, 12, 0);
  const ligne = (n, sid, date, total, frais = "") => { const l = ENTETES_EV.map(() => ""); l[COL_EV.Commande] = n; l[COL_EV.Date] = date; l[SID] = sid; return [...l, "test", total, "", "", frais]; };
  sheet["Commandes EV"].push(
    ligne("EV-2026-0101", "cs_test_a", "2026-11-09 10:00", 50),
    ligne("EV-2026-0102", "cs_test_b", "2026-11-09 10:05", 60, 2.1),     /* frais déjà connus : intacts */
    ligne("EV-2026-0103", "cs_live_c", "2026-11-09 10:10", 70),          /* autre mode que la clé de test : ignorée */
    ligne("EV-2026-0104", "cs_test_d", "2026-10-01 10:00", 80),          /* trop ancienne */
    ligne("EV-2026-0105", "cs_test_e", "2026-11-09 10:15", 90),
    ligne("EV-2026-0106", "cs_test_f", "2026-11-09 10:20", 90),
    ligne("EV-2026-0107", "cs_test_g", "2026-11-09 10:25", 90),
    ligne("EV-2026-0108", "cs_test_h", "2026-11-09 10:30", 90));
  sessionStripe = { payment_intent: { latest_charge: { balance_transaction: { fee: 175 } } } };
  const r = await completerFrais(envGoogle, maintenant);
  assert.deepEqual(r.fait, ["EV-2026-0101", "EV-2026-0105", "EV-2026-0106"]);
  const frais = n => parNom("Commandes EV", sheet["Commandes EV"].findIndex(l => l[COL_EV.Commande] === n))["Frais Stripe (€)"];
  assert.equal(frais("EV-2026-0101"), 1.75);
  assert.equal(frais("EV-2026-0102"), 2.1);
  assert.ok([frais("EV-2026-0103"), frais("EV-2026-0104"), frais("EV-2026-0107")].every(x => x === "" || x === undefined));
  assert.deepEqual((await completerFrais(envGoogle, maintenant)).fait, ["EV-2026-0107", "EV-2026-0108"], "passage suivant : la suite");
  assert.deepEqual((await completerFrais({ ...envGoogle, STRIPE_SECRET_KEY: "" }, maintenant)), { inactif: true });
});

test("coûts d'une CF : écrits sur la première ligne seulement, vidés ailleurs ; colonnes absentes → false", async () => {
  assert.equal(await noterCouts(envGoogle, "CF-2026-0007-A", { cout: 12, envoi: null }), false, "colonnes absentes du Sheet");
  sheet["Commandes CF"][0].push("Coût fabricant (€)", "Frais d'envoi (€)");
  const l2 = ENTETES_CF.map(() => ""); l2[0] = "CF-2026-0007-A"; l2[1] = "EV-2026-0007"; l2[2] = "2";
  sheet["Commandes CF"][1][2] = "1";
  sheet["Commandes CF"].push([...l2, 99, 99]);                            /* ancien montant sur la 2e ligne : doit disparaître */
  assert.equal(await noterCouts(envGoogle, "CF-2026-0007-A", { cout: 12.5, envoi: 4.2 }), true);
  const c1 = parNom("Commandes CF", 1), c2 = parNom("Commandes CF", 2);
  assert.equal(c1["Coût fabricant (€)"], 12.5);
  assert.equal(c1["Frais d'envoi (€)"], 4.2);
  assert.equal(c2["Coût fabricant (€)"], "");
  assert.equal(c2["Frais d'envoi (€)"], "");
  await noterCouts(envGoogle, "CF-2026-0007-A", { cout: null, envoi: 3 });
  assert.equal(parNom("Commandes CF", 1)["Coût fabricant (€)"], "", "case vidée");
  await assert.rejects(() => noterCouts(envGoogle, "CF-2026-9999-A", { cout: 1, envoi: 1 }), /introuvable/);
});

test("finances : nombres du Sheet (« 12,50 € », espaces) et marge d'une commande", () => {
  assert.equal(versNombre("12,50 €"), 12.5);
  assert.equal(versNombre("1 234,5"), 1234.5);
  assert.equal(versNombre("1,234.50"), 1234.5, "locale anglaise");
  assert.equal(versNombre("1 234,50 €"), 1234.5, "espace insécable");
  assert.equal(versNombre("-3,2"), -3.2);
  assert.equal(versNombre(7), 7);
  assert.equal(versNombre(""), null);
  assert.equal(versNombre("—"), null);
  const base = { total: 86.9, frais: 1.4, cfs: [{ cf: "CF-1-A", atelier: false, cout: 40, envoi: 4.9 }] };
  assert.deepEqual(margeCommande(base), { total: 86.9, frais: 1.4, couts: 40, envois: 4.9, manque: "", marge: 40.6 });
  assert.equal(margeCommande({ ...base, cfs: [{ cf: "CF-1-A", atelier: false, cout: null, envoi: null }] }).manque, "coût manquant : CF-1-A");
  assert.equal(margeCommande({ ...base, cfs: [{ cf: "CF-1-A", atelier: true, cout: null, envoi: null }] }).marge, 85.5, "atelier : coût facultatif");
  assert.equal(margeCommande({ ...base, frais: null }).manque, "frais Stripe pas encore connus");
  assert.equal(margeCommande({ ...base, total: null }).manque, "total non enregistré");
});
