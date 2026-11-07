/* Tests du back-office Google Sheet (bloc B) : Google, Stripe et Brevo simulés, aucun appel réel */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";
import { jetonAcces, jwtCompteService, viderCacheJeton, lettreColonne } from "../src/google.js";
import { prochainNumero, reglages, dateParis } from "../src/sheet.js";

reglages.attenteVerificationMs = 0;

/* Clé de compte de service factice, générée pour les tests */
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const base = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice" };
const envGoogle = { ...base, GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM.replace(/\n/g, "\\n"), SHEET_ID: "id-factice",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "atelier@example.com" };

const ENTETES = ["Commande", "Date", "Statut", "Type", "Action requise", "Pièce", "Commande OpenSCAD", "Client", "Fabricant", "Lien STL",
  "Transporteur", "N° de suivi", "Dernier statut notifié", "Stripe session id", "Cadeau / message", "Notes"];

/* Faux classeur : onglet → tableau de lignes (ligne 1 = en-têtes) */
let sheet, jetons, brevo, appelsGoogle, panneGoogle, apresEcriture, lignesStripe;
beforeEach(() => {
  viderCacheJeton();
  sheet = {
    Commandes: [ENTETES.slice(), ["EV-2026-0007", "2026-01-02 10:00", "livree", "standard", "", "x", "", "", "", "", "", "", "livree", "cs_test_ancien", "", "à garder"]],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], ["À renseigner", "", "5", "non"]]
  };
  jetons = 0; brevo = []; appelsGoogle = []; panneGoogle = false; apresEcriture = null;
  lignesStripe = [{ description: "Tablette café de balcon — Sur-mesure", quantity: 2, amount_total: 8200,
    price: { product: { metadata: { produit: "tablette-rambarde", mode: "custom", cotes_mm: '{"a":45,"b":300}', coloris: "rose" } } } }];
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
    if (onglet === "Commandes" && apresEcriture) { const f = apresEcriture; apresEcriture = null; f(ligne); }
    return rep({});
  }
  if (u.host === "api.stripe.com" && u.pathname.endsWith("/line_items")) return rep({ data: lignesStripe });
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
const ligneCommande = sid => { const t = sheet.Commandes; const r = t.find(l => l[13] === sid); return r && Object.fromEntries(ENTETES.map((n, i) => [n, r[i]])); };

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
  assert.equal(sheet.Commandes.indexOf(sheet.Commandes.find(l => l[13] === "cs_test_nouveau")), 2, "1re ligne vide");
  assert.match(r.Date, /^2026-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(r.Statut, "fichier_a_produire");
  assert.equal(r.Type, "sur-mesure");
  assert.equal(r["Pièce"], "tablette-rambarde · a=45 b=300 · Rose poudré · ×2");
  assert.equal(r.Client, "Camille Test\nclient@example.com\n1 rue des Lilas, 75011 Paris, FR");
  assert.equal(r.Fabricant, "À renseigner");
  assert.equal(r["Dernier statut notifié"], "fichier_a_produire", "noté après l'e-mail client");
  assert.equal(r["Cadeau / message"], "");
  for (const n of ["Action requise", "Commande OpenSCAD", "Lien STL", "Notes"]) assert.equal(r[n], undefined, `${n} jamais écrite`);
  assert.equal(appelsGoogle.filter(a => a.chemin.includes(":append") && a.chemin.includes("Commandes")).length, 0, "pas d'append sur Commandes");
  assert.deepEqual(sheet.Journal[1].slice(1), ["EV-2026-0008", "", "fichier_a_produire", "worker"]);

  const client = brevo.find(m => m.tags[0] === "commande-recue");
  assert.deepEqual(client.to, [{ email: "client@example.com", name: "Camille Test" }]);
  assert.equal(client.subject, "[TEST] Commande EV-2026-0008 reçue — Evarysth");
  assert.match(client.textContent, /fabriquée à vos cotes/);
  const fiche = brevo.find(m => m.tags[0] === "commande");
  assert.match(fiche.textContent, /Back-office : EV-2026-0008/);
  assert.match(fiche.subject, /Nouvelle commande EV-261107-ABCD/, "fiche de fabrication inchangée");

  assert.equal((await webhook(envGoogle)).status, 200);
  assert.equal(sheet.Commandes.filter(l => l[13] === "cs_test_nouveau").length, 1, "une seule ligne");
  assert.equal(sheet.Journal.length, 2, "une seule ligne de Journal");
  assert.equal(brevo.filter(m => m.tags[0] === "commande-recue").length, 1, "e-mail client envoyé une fois");
  assert.match(brevo.filter(m => m.tags[0] === "commande").at(-1).textContent, /Back-office : EV-2026-0008/);
  assert.equal(sheet.Commandes[1][15], "à garder", "ligne existante intacte");
});

test("webhook : commande standard → payee, emballage cadeau en colonne O, pas dans Pièce", async () => {
  lignesStripe = [
    { description: "Tablette — Standard", quantity: 1, amount_total: 3500, price: { product: { metadata: { produit: "tablette-rambarde", mode: "standard", taille: "M", cotes_mm: '{"a":45,"b":300}', coloris: "noir" } } } },
    { description: "Emballage cadeau", quantity: 1, amount_total: 300, price: { product: { metadata: { produit: "emballage-cadeau" } } } }
  ];
  assert.equal((await webhook(envGoogle, "cs_test_std", { metadata: { ref: "EV-1", cadeau: "oui", message_cadeau: "Joyeux anniversaire" } })).status, 200);
  const r = ligneCommande("cs_test_std");
  assert.equal(r.Statut, "payee");
  assert.equal(r.Type, "standard");
  assert.match(r["Pièce"], /^tablette-rambarde · M · [^·]+ · ×1$/);
  assert.equal(r["Cadeau / message"], "oui · Joyeux anniversaire");
  assert.match(brevo.find(m => m.tags[0] === "commande-recue").textContent, /part en fabrication/);
});

test("webhook : deux commandes simultanées sur la même ligne → n° distincts, aucune perdue", async () => {
  /* Juste après notre écriture, une autre commande (même état lu) écrit la même ligne avec le même n° */
  apresEcriture = ligne => { sheet.Commandes[ligne] = ["EV-2026-0008", "2026-11-07 10:00", "payee", "standard", undefined, "autre", undefined, "", "", "", "", "", "", "cs_test_concurrent", "", ""]; };
  assert.equal((await webhook(envGoogle)).status, 200);
  assert.equal(ligneCommande("cs_test_concurrent").Commande, "EV-2026-0008");
  assert.equal(ligneCommande("cs_test_nouveau").Commande, "EV-2026-0009");
  assert.equal(sheet.Commandes.length, 4);
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
