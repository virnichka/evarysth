/* Tests de la tâche planifiée (bloc D, onglets Commandes EV / Commandes CF) : Google et Brevo simulés, aucun appel réel */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { viderCacheJeton, reglerAttentes } from "../src/google.js";
reglerAttentes([0, 0]); /* nouveaux essais sans attente dans les tests */
import { verifierJeton } from "../src/jeton.js";
import { dateParis } from "../src/sheet.js";
import { lancerTache, numerosCF, parisVersMs, RELANCE, statutEV, tachePlanifiee } from "../src/planifie.js";
import { COL_CF, COL_EV, ENTETES_CF, ENTETES_EV, appliquerFormules } from "./entetes.mjs";

const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const env = { CHECKOUT_MODE: "test", HMAC_SECRET: "secret-de-test", BREVO_API_KEY: "xkeysib-test", ORDER_EMAIL: "proprio@example.com",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice" };
const FAB = "Atelier Dupont", FAB2 = "Studio Martin";
const il_y_a = h => dateParis(new Date(Date.now() - h * 3600_000));
const CLIENT = "Camille Martin\nc@example.com\n3 rue des Lilas, 75011 Paris, FR";

let sheet, emails, brevoEnPanne;
/* Commande client (onglet Commandes EV) */
const commande = (num, statut = "payee", extra = {}) => {
  const l = ENTETES_EV.map(() => "");
  Object.assign(l, { [COL_EV.Commande]: num, [COL_EV.Statut]: statut, [COL_EV.Client]: CLIENT, [COL_EV["Stripe session id"]]: "cs_test_" + num });
  for (const [k, v] of Object.entries(extra)) l[COL_EV[k]] = v;
  sheet["Commandes EV"].push(l);
};
/* Article (onglet Commandes CF) */
const article = (ev, n, statut, notifie, extra = {}) => {
  const l = ENTETES_CF.map(() => "");
  Object.assign(l, { [COL_CF["Commande EV"]]: ev, [COL_CF["Article n°"]]: String(n), [COL_CF.Statut]: statut, [COL_CF["Dernier statut notifié"]]: notifie,
    [COL_CF.Article]: "boite-rugged · a=142 b=60 · Noir mat · ×1", [COL_CF["Lien STL"]]: "https://drive.google.com/x" });
  for (const [k, v] of Object.entries(extra)) l[COL_CF[k]] = v;
  sheet["Commandes CF"].push(l);
};
const journal = (num, ancien, nouveau, auteur, date = il_y_a(1)) => [date, num, ancien, nouveau, auteur];
beforeEach(() => {
  viderCacheJeton();
  sheet = {
    "Commandes EV": [ENTETES_EV.slice()],
    "Commandes CF": [ENTETES_CF.slice()],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], [FAB, "atelier@example.com", "5", "non"], [FAB2, "studio@example.com", "7", "non"]]
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
  if (chemin === "values:batchGet") appliquerFormules(sheet);
  if (chemin === "values:batchGet") return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = lirePlage(r); if (ref === "1:1") return { range: r, values: [sheet[onglet][0]] }; const c = col(ref.split(":")[0]);
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
const cf = (ev, n, nom) => sheet["Commandes CF"].find(l => l[COL_CF["Commande EV"]] === ev && l[COL_CF["Article n°"]] === String(n))[COL_CF[nom]];
const ev = (num, nom) => (appliquerFormules(sheet), sheet["Commandes EV"]).find(l => l[0] === num)[COL_EV[nom]];
const journalSans = () => sheet.Journal.slice(1).map(l => l.slice(1));
const silence = async f => { const e = console.error, w = console.warn, l = console.log; console.error = console.warn = console.log = () => {}; try { return await f(); } finally { Object.assign(console, { error: e, warn: w, log: l }); } };

test("Date du Journal (heure de Paris) relue en ms, été comme hiver", () => {
  for (const t of [Date.UTC(2026, 0, 15, 9, 30), Date.UTC(2026, 6, 15, 21, 5)]) assert.equal(parisVersMs(dateParis(new Date(t))), t);
  assert.ok(Number.isNaN(parisVersMs("à renseigner")));
});

test("n° CF : regroupement par commande et fabricant, lettre stable, article déjà envoyé jamais renuméroté", () => {
  const l = (statut, fabricant, cf = "", notifie = statut) => ({ statut, fabricant, cf, notifie });
  assert.deepEqual(numerosCF("EV-2026-0002", [l("payee", FAB), l("fichier_a_produire", FAB2), l("payee", FAB), l("payee", "")]),
    ["CF-2026-0002-A", "CF-2026-0002-B", "CF-2026-0002-A", ""]);
  /* groupe inchangé : garde sa lettre, même si un autre groupe passe devant */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("payee", FAB2), l("payee", FAB, "CF-2026-0002-B")]), ["CF-2026-0002-A", "CF-2026-0002-B"]);
  /* A déjà envoyée : un nouvel article chez le même fabricant part dans une nouvelle CF */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("envoyee_fabricant", FAB, "CF-2026-0002-A"), l("payee", FAB, "CF-2026-0002-A")]),
    ["CF-2026-0002-A", "CF-2026-0002-B"]);
  /* fabricant changé sur une ligne d'une CF pas encore envoyée : la ligne change de CF */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("payee", FAB, "CF-2026-0002-A"), l("payee", FAB2, "CF-2026-0002-A")]), ["CF-2026-0002-A", "CF-2026-0002-B"]);
  /* fabricant et envoyee_fabricant choisis d'un coup (e-mail pas encore parti) : n° attribué */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("envoyee_fabricant", FAB, "", "payee")]), ["CF-2026-0002-A"]);
  /* article déjà accepté ou expédié dont « Dernier statut notifié » a du retard : jamais renuméroté */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("expediee", FAB, "CF-2026-0002-A", "lien_stl_a_indiquer"), l("expediee", FAB, "CF-2026-0002-A", "envoyee_fabricant")]),
    ["CF-2026-0002-A", "CF-2026-0002-A"]);
  assert.deepEqual(numerosCF("EV-2026-0002", [l("acceptee", FAB, "CF-2026-0002-A", ""), l("a_valider", FAB)]), ["CF-2026-0002-A", "CF-2026-0002-B"]);
  /* fabricant effacé : n° effacé */
  assert.deepEqual(numerosCF("EV-2026-0002", [l("payee", "", "CF-2026-0002-A")]), [""]);
});

test("Statut client : calculé à partir des statuts des articles", () => {
  assert.equal(statutEV([]), null);
  assert.equal(statutEV(["payee", "fichier_a_produire"]), "payee");
  assert.equal(statutEV(["payee", "envoyee_fabricant"]), "en_fabrication");
  assert.equal(statutEV(["acceptee", "expediee"]), "partiellement_expediee");
  assert.equal(statutEV(["expediee", "livree", "annulee"]), "expediee");
  assert.equal(statutEV(["livree", "livree"]), "livree");
  assert.equal(statutEV(["expediee", "incident"]), "incident");
  assert.equal(statutEV(["annulee", "annulee"]), "annulee");
  assert.equal(statutEV(["remboursee", "annulee"]), "remboursee");
});

test("Attribution : n° CF écrits dans Commandes CF, liste des CF dans Commandes EV, rien à envoyer sans fabricant", async () => {
  commande("EV-2026-0002");
  article("EV-2026-0002", 1, "payee", "payee", { Fabricant: FAB });
  article("EV-2026-0002", 2, "fichier_a_produire", "fichier_a_produire", { Fabricant: FAB2 });
  article("EV-2026-0002", 3, "payee", "payee", { Fabricant: FAB });
  article("EV-2026-0002", 4, "payee", "payee");
  const b = await tachePlanifiee(env);
  assert.deepEqual([1, 2, 3, 4].map(n => cf("EV-2026-0002", n, "Commande CF")), ["CF-2026-0002-A", "CF-2026-0002-B", "CF-2026-0002-A", ""]);
  assert.equal(ev("EV-2026-0002", "Commandes CF"), "CF-2026-0002-A\nCF-2026-0002-B");
  assert.equal(b.attribuees.length, 3);
  assert.equal(emails.length, 0);
  /* l'article 2 rejoint le fabricant des articles 1 et 3 */
  sheet["Commandes CF"][2][COL_CF.Fabricant] = FAB;
  await tachePlanifiee(env);
  assert.equal(cf("EV-2026-0002", 2, "Commande CF"), "CF-2026-0002-A");
  assert.equal(ev("EV-2026-0002", "Commandes CF"), "CF-2026-0002-A");
  /* passage sans changement : aucune écriture */
  assert.deepEqual((await tachePlanifiee(env)).attribuees, []);
});

test("envoyee_fabricant : un seul e-mail par CF avec tous ses articles, n° CF seul, liens signés ; statut client en_fabrication", async () => {
  commande("EV-2026-0042");
  article("EV-2026-0042", 1, "envoyee_fabricant", "payee", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  article("EV-2026-0042", 2, "envoyee_fabricant", "fichier_a_produire", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A", Article: "tablette-rambarde · M · Noir mat · ×2", "Lien STL": "https://drive.google.com/y" });
  article("EV-2026-0042", 3, "payee", "payee", { Fabricant: FAB2 });
  const b1 = await tachePlanifiee(env);
  const b2 = await tachePlanifiee(env);
  assert.deepEqual(b1.notifiees, ["CF-2026-0042-A : envoyee_fabricant"]);
  assert.deepEqual(b2.notifiees, []);
  assert.equal(emails.length, 1, "un e-mail pour les 2 articles de la CF, rien pour l'article sans envoi");
  const m = emails[0];
  assert.deepEqual(m.to, [{ email: "atelier@example.com", name: FAB }]);
  assert.match(m.subject, /^\[TEST\] Commande CF-2026-0042-A à fabriquer/);
  assert.match(m.textContent, /a=142 b=60 · Noir mat[\s\S]*tablette-rambarde · M · Noir mat · ×2/);
  assert.match(m.textContent, /drive\.google\.com\/x/);
  assert.doesNotMatch(m.textContent + m.htmlContent, /EV-2026|Lilas|75011|Camille|c@example\.com/, "ni n° client ni coordonnées");
  const jetons = [...m.textContent.matchAll(/workers\.dev\/f\/(\S+)/g)].map(x => x[1]);
  const lus = await Promise.all(jetons.map(j => verifierJeton(env, j)));
  assert.deepEqual(lus.map(j => [j.action, j.commande, j.fabricant]), [["accepter", "CF-2026-0042-A", FAB], ["expedier", "CF-2026-0042-A", FAB]]);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "envoyee_fabricant");
  assert.equal(cf("EV-2026-0042", 2, "Dernier statut notifié"), "envoyee_fabricant");
  assert.equal(ev("EV-2026-0042", "Statut"), "en_fabrication");
  assert.deepEqual(journalSans(), [["CF-2026-0042-A", "payee", "envoyee_fabricant", "proprietaire"], ["EV-2026-0042", "", "en_fabrication", "worker"]], "statut client calculé par le Sheet : journalisé");
});

test("envoyee_fabricant sans fabricant choisi : la ligne attend", async () => {
  commande("EV-2026-0042");
  article("EV-2026-0042", 1, "envoyee_fabricant", "payee");
  const b = await tachePlanifiee(env);
  assert.deepEqual(b.attente, ["EV-2026-0042 : fabricant à choisir"]);
  assert.equal(emails.length, 0);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "payee");
});

test("envoyee_fabricant sans lien STL (ni saisi ni dans R2) : la CF attend, aucun e-mail", async () => {
  commande("EV-2026-0042");
  article("EV-2026-0042", 1, "envoyee_fabricant", "a_valider", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A", Article: "tablette-rambarde · M · Noir mat · ×1", "Lien STL": "" });
  const b = await tachePlanifiee(env);
  assert.deepEqual(b.attente, ["CF-2026-0042-A : lien STL manquant (tablette-rambarde M)"]);
  assert.equal(emails.length, 0);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "a_valider");
});

test("lien STL collé dans le Sheet : lien_stl_a_indiquer → a_valider, sans aucun e-mail", async () => {
  commande("EV-2026-0042");
  article("EV-2026-0042", 1, "lien_stl_a_indiquer", "lien_stl_a_indiquer", { "Lien STL": "https://drive.google.com/z" });
  article("EV-2026-0042", 2, "lien_stl_a_indiquer", "lien_stl_a_indiquer", { "Lien STL": "" });
  await tachePlanifiee(env);
  assert.deepEqual([1, 2].map(n => cf("EV-2026-0042", n, "Statut")), ["a_valider", "lien_stl_a_indiquer"]);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "a_valider");
  assert.equal(emails.length, 0);
  assert.deepEqual((await tachePlanifiee(env)).notifiees, [], "point de verrou : rien ne part sans validation");
});

test("Fabricant qui livre le client : nom et adresse de la commande EV transmis (sans l'e-mail du client)", async () => {
  sheet.Fabricants[1][3] = "oui";
  commande("EV-2026-0042");
  article("EV-2026-0042", 1, "envoyee_fabricant", "", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  await tachePlanifiee(env);
  assert.match(emails[0].textContent, /Camille Martin\n3 rue des Lilas/);
  assert.doesNotMatch(emails[0].textContent, /c@example\.com/);
});

test("Échec d'envoi : colonne non mise à jour, rien au Journal, nouvel essai au passage suivant", async () => {
  commande("EV-2026-0042", "en_fabrication");
  article("EV-2026-0042", 1, "envoyee_fabricant", "fichier_a_produire", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  brevoEnPanne = true;
  const b = await tachePlanifiee(env);
  assert.equal(b.erreurs.length, 1);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "fichier_a_produire");
  assert.equal(sheet.Journal.filter(l => l[1].startsWith("CF-")).length, 0, "rien au Journal pour la CF");
  brevoEnPanne = false;
  await tachePlanifiee(env);
  assert.equal(emails.length, 1);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "envoyee_fabricant");
});

test("Fabricant sans e-mail ou HMAC_SECRET absent : la ligne attend, sans erreur ni écriture", async () => {
  commande("EV-2026-0042", "en_fabrication");
  article("EV-2026-0042", 1, "envoyee_fabricant", "", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  sheet.Fabricants[1][1] = "";
  const b = await tachePlanifiee(env);
  assert.equal(b.attente.length, 1); assert.equal(b.erreurs.length, 0);
  sheet.Fabricants[1][1] = "atelier@example.com";
  const b2 = await tachePlanifiee({ ...env, HMAC_SECRET: "" });
  assert.equal(b2.attente.length, 1);
  assert.equal(emails.length, 0);
  assert.equal(cf("EV-2026-0042", 1, "Dernier statut notifié"), "");
});

test("expediee : suivi recopié dans la CF, e-mail client par colis avec le n° EV ; statut client partiel puis expédié", async () => {
  commande("EV-2026-0042", "en_fabrication");
  article("EV-2026-0042", 1, "expediee", "acceptee", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A", Transporteur: "Colissimo", "N° de suivi": "6A123" });
  article("EV-2026-0042", 2, "expediee", "acceptee", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A", Article: "tablette-rambarde · M · Noir mat · ×1" });
  article("EV-2026-0042", 3, "acceptee", "acceptee", { Fabricant: FAB2, "Commande CF": "CF-2026-0042-B" });
  sheet.Journal.push(journal("CF-2026-0042-A", "acceptee", "expediee", "fabricant"));
  await tachePlanifiee(env); await tachePlanifiee(env);
  assert.equal(cf("EV-2026-0042", 2, "N° de suivi"), "6A123", "suivi recopié sur l'autre ligne de la CF");
  assert.equal(cf("EV-2026-0042", 2, "Transporteur"), "Colissimo");
  assert.equal(cf("EV-2026-0042", 3, "N° de suivi"), "", "autre CF : intacte");
  assert.equal(emails.length, 1, "un e-mail pour le colis");
  const m = emails[0];
  assert.deepEqual(m.to, [{ email: "c@example.com", name: "Camille Martin" }]);
  assert.match(m.subject, /Commande EV-2026-0042 en partie expédiée/);
  assert.match(m.textContent, /Un colis de votre commande EV-2026-0042[\s\S]*Boîte[^\n]*a=142[\s\S]*Tablette[^\n]*· M ·/);
  assert.match(m.textContent, /autre colis/);
  assert.match(m.textContent, /Colissimo[\s\S]*6A123/);
  assert.doesNotMatch(m.textContent, /CF-2026/, "le client ne voit pas les n° CF");
  assert.equal(ev("EV-2026-0042", "Statut"), "partiellement_expediee");
  assert.deepEqual(journalSans(), [["CF-2026-0042-A", "acceptee", "expediee", "fabricant"], ["EV-2026-0042", "", "partiellement_expediee", "worker"]],
    "changement déjà journalisé par le lien fabricant : pas de doublon");

  /* 2e colis */
  sheet["Commandes CF"][3][COL_CF.Statut] = "expediee";
  sheet["Commandes CF"][3][COL_CF.Transporteur] = "DPD";
  sheet["Commandes CF"][3][COL_CF["N° de suivi"]] = "DPD9";
  await tachePlanifiee(env);
  assert.equal(emails.length, 2);
  assert.match(emails[1].subject, /Commande EV-2026-0042 expédiée/);
  assert.match(emails[1].textContent, /entièrement en route[\s\S]*DPD9/);
  assert.equal(ev("EV-2026-0042", "Statut"), "expediee");
});

test("Commande d'un seul colis : e-mail d'expédition simple", async () => {
  commande("EV-2026-0042", "en_fabrication");
  article("EV-2026-0042", 1, "expediee", "acceptee", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A", Transporteur: "Colissimo", "N° de suivi": "6A123" });
  await tachePlanifiee(env);
  assert.match(emails[0].textContent, /Votre commande EV-2026-0042 vient d'être expédiée/);
  assert.doesNotMatch(emails[0].textContent, /colis de votre commande|autre colis/);
});

test("Autres statuts : colonne mise à jour sans e-mail ; statut forcé prioritaire et journalisé", async () => {
  commande("EV-2026-0001");
  commande("EV-2026-0002", "", { "Statut forcé": "remboursee" });
  article("EV-2026-0001", 1, "payee", "");
  article("EV-2026-0002", 1, "incident", "acceptee", { Fabricant: FAB, "Commande CF": "CF-2026-0002-A" });
  sheet.Journal.push(journal("EV-2026-0001", "", "payee", "worker"));
  await tachePlanifiee(env);
  assert.equal(emails.length, 0);
  assert.equal(cf("EV-2026-0001", 1, "Dernier statut notifié"), "payee");
  assert.equal(cf("EV-2026-0002", 1, "Dernier statut notifié"), "incident");
  assert.equal(ev("EV-2026-0002", "Statut"), "remboursee", "statut forcé prioritaire sur le calcul");
  assert.deepEqual(journalSans(), [["EV-2026-0001", "", "payee", "worker"], ["CF-2026-0002-A", "acceptee", "incident", "proprietaire"],
    ["EV-2026-0002", "", "remboursee", "worker"]]);
});

test("Relance : une seule par CF, 48 h après l'envoi au fabricant, au propriétaire", async () => {
  commande("EV-2026-0042", "en_fabrication"); commande("EV-2026-0043", "en_fabrication");
  article("EV-2026-0042", 1, "envoyee_fabricant", "envoyee_fabricant", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  article("EV-2026-0042", 2, "envoyee_fabricant", "envoyee_fabricant", { Fabricant: FAB, "Commande CF": "CF-2026-0042-A" });
  article("EV-2026-0043", 1, "envoyee_fabricant", "envoyee_fabricant", { Fabricant: FAB, "Commande CF": "CF-2026-0043-A" });
  sheet.Journal.push(journal("CF-2026-0042-A", "payee", "envoyee_fabricant", "proprietaire", il_y_a(49)),
    journal("CF-2026-0043-A", "payee", "envoyee_fabricant", "proprietaire", il_y_a(47)));
  const b = await tachePlanifiee(env);
  await tachePlanifiee(env); await tachePlanifiee(env);
  assert.deepEqual(b.relances, ["CF-2026-0042-A"]);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, [{ email: "proprio@example.com" }]);
  assert.match(emails[0].subject, /Relance : CF-2026-0042-A/);
  assert.equal(sheet.Journal.filter(l => l[3] === RELANCE).length, 1);
  /* 100 h plus tard : 0043 relancée à son tour, 0042 jamais une 2e fois */
  assert.deepEqual((await tachePlanifiee(env, Date.now() + 100 * 3600_000)).relances, ["CF-2026-0043-A"]);
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
