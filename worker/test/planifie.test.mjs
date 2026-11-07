/* Tests de la tâche planifiée (bloc D) : Google et Brevo simulés, aucun appel réel */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { viderCacheJeton } from "../src/google.js";
import { verifierJeton } from "../src/jeton.js";
import { dateParis } from "../src/sheet.js";
import { lancerTache, parisVersMs, RELANCE, tachePlanifiee } from "../src/planifie.js";

const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const env = { CHECKOUT_MODE: "test", HMAC_SECRET: "secret-de-test", BREVO_API_KEY: "xkeysib-test", ORDER_EMAIL: "proprio@example.com",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice" };
const FAB = "Atelier Dupont";
const ENTETES = ["Commande", "Date", "Statut", "Type", "Action requise", "Pièce", "Commande OpenSCAD", "Client", "Fabricant", "Lien STL",
  "Transporteur", "N° de suivi", "Dernier statut notifié", "Stripe session id", "Cadeau / message", "Notes"];
const COL = Object.fromEntries(ENTETES.map((n, i) => [n, i]));
const il_y_a = h => dateParis(new Date(Date.now() - h * 3600_000));

let sheet, emails, brevoEnPanne;
const ligne = (num, statut, notifie, extra = {}) => {
  const l = ENTETES.map(() => "");
  Object.assign(l, { 0: num, 2: statut, 5: "boite-rugged · a=142 b=60 · Noir mat · ×1", 7: "Camille Martin\nc@example.com\n3 rue des Lilas, 75011 Paris, FR",
    8: FAB, 9: "https://drive.google.com/x", 12: notifie, 13: "cs_test_" + num });
  for (const [k, v] of Object.entries(extra)) l[COL[k]] = v;
  return l;
};
const journal = (num, ancien, nouveau, auteur, date = il_y_a(1)) => [date, num, ancien, nouveau, auteur];
beforeEach(() => {
  viderCacheJeton();
  sheet = {
    Commandes: [ENTETES.slice()],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], [FAB, "atelier@example.com", "5", "non"]]
  };
  emails = []; brevoEnPanne = false;
  globalThis.fetch = fauxFetch;
});

const col = lettre => [...lettre].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const lirePlage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o, ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url);
  const rep = (d, status = 200) => new Response(JSON.stringify(d), { status });
  if (u.host === "api.brevo.com") {
    if (brevoEnPanne) return new Response("panne", { status: 500 });
    emails.push(JSON.parse(init.body)); return rep({ messageId: "x" }, 201);
  }
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin === "values:batchGet") return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = lirePlage(r); const c = col(ref.split(":")[0]);
    return { range: r, values: [sheet[onglet].map(l => l[c] ?? "")] };
  }) });
  const [, a1, action] = /^values\/(.+?)(:append)?$/.exec(chemin);
  const { onglet, ref } = lirePlage(a1);
  if (action) { sheet[onglet].push(JSON.parse(init.body).values[0]); return rep({}); }
  if (!init.method || init.method === "GET") return rep({ values: [sheet[onglet][0]] });
  const [, c0, l0] = /^([A-Z]+)(\d+)/.exec(ref);
  JSON.parse(init.body).values[0].forEach((v, i) => { if (v !== null) sheet[onglet][Number(l0) - 1][col(c0) + i] = v; });
  return rep({});
}
const cellule = (num, nom) => sheet.Commandes.find(l => l[0] === num)[COL[nom]];
const silence = async f => { const e = console.error, w = console.warn, l = console.log; console.error = console.warn = console.log = () => {}; try { return await f(); } finally { Object.assign(console, { error: e, warn: w, log: l }); } };

test("Date du Journal (heure de Paris) relue en ms, été comme hiver", () => {
  for (const t of [Date.UTC(2026, 0, 15, 9, 30), Date.UTC(2026, 6, 15, 21, 5)]) assert.equal(parisVersMs(dateParis(new Date(t))), t);
  assert.ok(Number.isNaN(parisVersMs("à renseigner")));
});

test("envoyee_fabricant : un seul e-mail sur deux passages, liens signés, pas d'adresse si le fabricant ne livre pas", async () => {
  sheet.Commandes.push(ligne("EV-2026-0003", "payee", "payee"), ligne("EV-2026-0042", "envoyee_fabricant", "fichier_a_produire"));
  const b1 = await tachePlanifiee(env);
  const b2 = await tachePlanifiee(env);
  assert.deepEqual(b1.notifiees, ["EV-2026-0042 : envoyee_fabricant"]);
  assert.deepEqual(b2.notifiees, []);
  assert.equal(emails.length, 1);
  const m = emails[0];
  assert.deepEqual(m.to, [{ email: "atelier@example.com", name: FAB }]);
  assert.match(m.subject, /^\[TEST\] Commande EV-2026-0042 à fabriquer/);
  assert.match(m.textContent, /a=142 b=60 · Noir mat/);
  assert.match(m.textContent, /drive\.google\.com\/x/);
  assert.doesNotMatch(m.textContent + m.htmlContent, /Lilas|75011|Camille|c@example\.com/);
  const jetons = [...m.textContent.matchAll(/workers\.dev\/f\/(\S+)/g)].map(x => x[1]);
  assert.deepEqual(await Promise.all(jetons.map(async j => (await verifierJeton(env, j)).action)), ["accepter", "expedier"]);
  assert.equal(cellule("EV-2026-0042", "Dernier statut notifié"), "envoyee_fabricant");
  /* changement fait à la main : journalisé une fois, auteur proprietaire */
  const lignesJ = sheet.Journal.slice(1);
  assert.deepEqual(lignesJ.map(l => l.slice(1)), [["EV-2026-0042", "fichier_a_produire", "envoyee_fabricant", "proprietaire"]]);
});

test("Fabricant qui livre le client : nom et adresse transmis (sans l'e-mail du client)", async () => {
  sheet.Fabricants[1][3] = "oui";
  sheet.Commandes.push(ligne("EV-2026-0042", "envoyee_fabricant", ""));
  await tachePlanifiee(env);
  assert.match(emails[0].textContent, /Camille Martin\n3 rue des Lilas/);
  assert.doesNotMatch(emails[0].textContent, /c@example\.com/);
});

test("Échec d'envoi : colonne non mise à jour, rien au Journal, nouvel essai au passage suivant", async () => {
  sheet.Commandes.push(ligne("EV-2026-0042", "envoyee_fabricant", "fichier_a_produire"));
  brevoEnPanne = true;
  const b = await tachePlanifiee(env);
  assert.equal(b.erreurs.length, 1);
  assert.equal(cellule("EV-2026-0042", "Dernier statut notifié"), "fichier_a_produire");
  assert.equal(sheet.Journal.length, 1);
  brevoEnPanne = false;
  await tachePlanifiee(env);
  assert.equal(emails.length, 1);
  assert.equal(cellule("EV-2026-0042", "Dernier statut notifié"), "envoyee_fabricant");
});

test("Fabricant sans e-mail ou HMAC_SECRET absent : la ligne attend, sans erreur ni écriture", async () => {
  sheet.Commandes.push(ligne("EV-2026-0042", "envoyee_fabricant", ""));
  sheet.Fabricants[1][1] = "";
  const b = await tachePlanifiee(env);
  assert.equal(b.attente.length, 1); assert.equal(b.erreurs.length, 0);
  sheet.Fabricants[1][1] = "atelier@example.com";
  const b2 = await tachePlanifiee({ ...env, HMAC_SECRET: "" });
  assert.equal(b2.attente.length, 1);
  assert.equal(emails.length, 0);
  assert.equal(cellule("EV-2026-0042", "Dernier statut notifié"), "");
});

test("expediee : e-mail client avec transporteur et suivi ; changement du fabricant déjà au Journal → pas de doublon", async () => {
  sheet.Commandes.push(ligne("EV-2026-0042", "expediee", "acceptee", { Transporteur: "Colissimo", "N° de suivi": "6A123" }));
  sheet.Journal.push(journal("EV-2026-0042", "acceptee", "expediee", "fabricant"));
  await tachePlanifiee(env); await tachePlanifiee(env);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, [{ email: "c@example.com", name: "Camille Martin" }]);
  assert.match(emails[0].textContent, /Colissimo[\s\S]*6A123/);
  assert.equal(sheet.Journal.length, 2);
  assert.equal(cellule("EV-2026-0042", "Dernier statut notifié"), "expediee");
});

test("Autres statuts : colonne mise à jour sans e-mail ; création déjà journalisée par le webhook", async () => {
  sheet.Commandes.push(ligne("EV-2026-0001", "payee", ""), ligne("EV-2026-0002", "incident", "acceptee"));
  sheet.Journal.push(journal("EV-2026-0001", "", "payee", "worker"));
  await tachePlanifiee(env);
  assert.equal(emails.length, 0);
  assert.equal(cellule("EV-2026-0001", "Dernier statut notifié"), "payee");
  assert.equal(cellule("EV-2026-0002", "Dernier statut notifié"), "incident");
  assert.deepEqual(sheet.Journal.slice(1).map(l => l.slice(1)), [["EV-2026-0001", "", "payee", "worker"], ["EV-2026-0002", "acceptee", "incident", "proprietaire"]]);
});

test("Relance : une seule, 48 h après l'envoi au fabricant, au propriétaire", async () => {
  sheet.Commandes.push(ligne("EV-2026-0042", "envoyee_fabricant", "envoyee_fabricant"), ligne("EV-2026-0043", "envoyee_fabricant", "envoyee_fabricant"));
  sheet.Journal.push(journal("EV-2026-0042", "payee", "envoyee_fabricant", "proprietaire", il_y_a(49)),
    journal("EV-2026-0043", "payee", "envoyee_fabricant", "proprietaire", il_y_a(47)));
  const b = await tachePlanifiee(env);
  await tachePlanifiee(env); await tachePlanifiee(env);
  assert.deepEqual(b.relances, ["EV-2026-0042"]);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, [{ email: "proprio@example.com" }]);
  assert.match(emails[0].subject, /Relance : EV-2026-0042/);
  assert.equal(sheet.Journal.filter(l => l[3] === RELANCE).length, 1);
  /* 100 h plus tard : 0043 relancée à son tour, 0042 jamais une 2e fois */
  assert.deepEqual((await tachePlanifiee(env, Date.now() + 100 * 3600_000)).relances, ["EV-2026-0043"]);
  assert.equal(emails.length, 2);
});

test("Sans secrets Google : aucune action, aucune erreur ; handler scheduled ne lève jamais", async () => {
  globalThis.fetch = () => { throw new Error("aucun appel attendu"); };
  assert.deepEqual(await tachePlanifiee({ CHECKOUT_MODE: "test" }), { inactive: true });
  let attendu;
  await worker.scheduled({ cron: "*/10 * * * *" }, { CHECKOUT_MODE: "test" }, { waitUntil: p => { attendu = p; } });
  assert.deepEqual(await attendu, { inactive: true });
  /* Google en panne : erreur journalisée, pas d'exception */
  const r = await silence(() => lancerTache(env));
  assert.ok(r.erreur);
});
