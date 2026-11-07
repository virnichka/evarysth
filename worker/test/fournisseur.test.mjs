/* Tests des liens fournisseur (bloc C) : Google simulé, aucun appel réel */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { viderCacheJeton } from "../src/google.js";
import { creerJeton, verifierJeton, ErreurJeton } from "../src/jeton.js";

const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const env = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", HMAC_SECRET: "secret-de-test",
  GOOGLE_SA_EMAIL: "worker@projet.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice" };
const FAB = "Atelier Dupont & Fils";

const ENTETES = ["Commande", "Date", "Statut", "Type", "Action requise", "Pièce", "Commande OpenSCAD", "Client", "Fabricant", "Lien STL",
  "Transporteur", "N° de suivi", "Dernier statut notifié", "Stripe session id", "Cadeau / message", "Notes"];
const COL = Object.fromEntries(ENTETES.map((n, i) => [n, i]));

let sheet, ecritures;
beforeEach(() => {
  viderCacheJeton();
  const ligne = (num, statut) => { const l = ENTETES.map(() => ""); l[0] = num; l[2] = statut; l[5] = "Boîte · M · noir · ×1"; l[7] = "Camille / c@example.com / Paris"; l[8] = FAB; return l; };
  /* Ordre volontairement « trié » : la commande visée n'est pas en ligne 2 */
  sheet = {
    Commandes: [ENTETES.slice(), ligne("EV-2026-0009", "payee"), ligne("EV-2026-0042", "envoyee_fabricant"), ligne("EV-2026-0001", "payee")],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]]
  };
  ecritures = 0;
  globalThis.fetch = fauxFetch;
});

const col = lettre => [...lettre].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const lirePlage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o, ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url);
  const rep = d => new Response(JSON.stringify(d), { status: 200 });
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin === "values:batchGet") return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = lirePlage(r); const c = col(ref.split(":")[0]);
    return { range: r, values: [sheet[onglet].map(l => l[c] ?? "")] };
  }) });
  const [, a1, action] = /^values\/(.+?)(:append)?$/.exec(chemin);
  const { onglet, ref } = lirePlage(a1);
  if (action) { ecritures++; sheet[onglet].push(JSON.parse(init.body).values[0]); return rep({}); }
  if (!init.method || init.method === "GET") return rep({ values: [sheet[onglet][0]] });
  ecritures++;
  const [, c0, l0] = /^([A-Z]+)(\d+)/.exec(ref);
  JSON.parse(init.body).values[0].forEach((v, i) => { if (v !== null) sheet[onglet][Number(l0) - 1][col(c0) + i] = v; });
  return rep({});
}

const cellule = (num, nom) => sheet.Commandes.find(l => l[0] === num)[COL[nom]];
const appeler = async (jeton, methode = "GET", champs, e = env) => {
  const err = console.error; console.error = () => {};
  try {
    return await worker.fetch(new Request(`https://w.dev/f/${jeton}`, methode === "POST"
      ? { method: "POST", body: new URLSearchParams(champs || {}) } : {}), e);
  } finally { console.error = err; }
};
const jeton = (action, extra = {}) => creerJeton(env, { commande: "EV-2026-0042", action, fabricant: FAB, ...extra });

test("Jeton : aller-retour, falsification et expiration", async () => {
  const j = await jeton("accepter");
  assert.equal(j.split(".").length, 5);
  assert.deepEqual((await verifierJeton(env, j)).fabricant, FAB);
  const p = j.split(".");
  for (const faux of [[p[0], "expedier", ...p.slice(2)], [...p.slice(0, 4), p[4].slice(0, -2) + "AA"], [p[0].replace("42", "43"), ...p.slice(1)]])
    await assert.rejects(verifierJeton(env, faux.join(".")), e => e instanceof ErreurJeton && e.code === "invalide");
  await assert.rejects(verifierJeton({ HMAC_SECRET: "autre" }, j), e => e.code === "invalide");
  const vieux = await jeton("accepter", { maintenant: Date.now() - 15 * 86400_000 });
  await assert.rejects(verifierJeton(env, vieux), e => e.code === "expire");
  assert.ok(await verifierJeton(env, await jeton("accepter", { maintenant: Date.now() - 13 * 86400_000 })));
});

test("Route : jeton falsifié → 403, expiré → 410 avec message clair, rien d'écrit", async () => {
  const j = await jeton("accepter");
  const r1 = await appeler(j.slice(0, -3) + "xyz", "POST");
  assert.equal(r1.status, 403);
  assert.match(await r1.text(), /Lien invalide/);
  const r2 = await appeler(await jeton("accepter", { maintenant: Date.now() - 20 * 86400_000 }), "POST");
  assert.equal(r2.status, 410);
  assert.match(await r2.text(), /expiré.*14 jours/s);
  assert.equal(ecritures, 0);
  assert.equal(cellule("EV-2026-0042", "Statut"), "envoyee_fabricant");
});

test("GET : page avec un bouton, aucune écriture, pas d'adresse client", async () => {
  const r = await appeler(await jeton("accepter"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /text\/html/);
  const html = await r.text();
  assert.match(html, /<form method="post"[^>]*>.*<button/s);
  assert.match(html, /EV-2026-0042/);
  assert.doesNotMatch(html, /c@example\.com/);
  assert.match(html, /Atelier|fabricant/);
  assert.equal(ecritures, 0);
  assert.equal(sheet.Journal.length, 1);
});

test("POST accepter : statut écrit sur la bonne ligne, Journal ; 2e clic → « déjà confirmée », une seule ligne", async () => {
  const j = await jeton("accepter");
  const r = await appeler(j, "POST");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /acceptée/);
  assert.equal(cellule("EV-2026-0042", "Statut"), "acceptee");
  assert.equal(cellule("EV-2026-0009", "Statut"), "payee");
  assert.deepEqual(sheet.Journal.slice(1).map(l => l.slice(1)), [["EV-2026-0042", "envoyee_fabricant", "acceptee", "fabricant"]]);
  const r2 = await appeler(j, "POST");
  assert.equal(r2.status, 200);
  assert.match(await r2.text(), /Déjà confirmée/);
  assert.equal(sheet.Journal.length, 2);
  assert.match(await (await appeler(j)).text(), /Déjà confirmée/);
});

test("Transition interdite : expedier depuis payee → 409, rien d'écrit", async () => {
  const j = await creerJeton(env, { commande: "EV-2026-0009", action: "expedier", fabricant: FAB });
  const r = await appeler(j, "POST", { transporteur: "Colissimo", suivi: "6A123" });
  assert.equal(r.status, 409);
  assert.equal(cellule("EV-2026-0009", "Statut"), "payee");
  assert.equal(ecritures, 0);
});

test("Expédier : transporteur + n° de suivi obligatoires, puis K et L écrits", async () => {
  sheet.Commandes[2][COL.Statut] = "acceptee";
  const j = await jeton("expedier");
  for (const champs of [{}, { transporteur: "Colissimo" }, { transporteur: "Colissimo", suivi: "   " }, { suivi: "6A123" }]) {
    const r = await appeler(j, "POST", champs);
    assert.equal(r.status, 400);
    assert.match(await r.text(), /obligatoires/);
  }
  assert.equal(ecritures, 0);
  const r = await appeler(j, "POST", { transporteur: " Colissimo ", suivi: "6A12345678901" });
  assert.equal(r.status, 200);
  assert.equal(cellule("EV-2026-0042", "Transporteur"), "Colissimo");
  assert.equal(cellule("EV-2026-0042", "N° de suivi"), "6A12345678901");
  assert.equal(cellule("EV-2026-0042", "Statut"), "expediee");
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["EV-2026-0042", "acceptee", "expediee", "fabricant"]);
  assert.match(await (await appeler(j, "POST", { transporteur: "UPS", suivi: "1Z" })).text(), /Déjà confirmée/);
  assert.equal(cellule("EV-2026-0042", "Transporteur"), "Colissimo");
  assert.equal(sheet.Journal.length, 2);
});

test("Lien d'un autre fabricant → refus", async () => {
  const j = await creerJeton(env, { commande: "EV-2026-0042", action: "accepter", fabricant: "Autre atelier" });
  assert.equal((await appeler(j, "POST")).status, 403);
  assert.equal(ecritures, 0);
});

test("Sans HMAC_SECRET ou sans secrets Google : /f/ en 503 propre, reste du Worker intact", async () => {
  const j = await jeton("accepter");
  const { HMAC_SECRET, ...sansHmac } = env;
  const { SHEET_ID, ...sansGoogle } = env;
  for (const e of [sansHmac, sansGoogle]) {
    const r = await appeler(j, "POST", {}, e);
    assert.equal(r.status, 503);
    assert.match(await r.text(), /pas encore ouvert/);
  }
  const accueil = await worker.fetch(new Request("https://w.dev/"), sansHmac);
  assert.equal(accueil.status, 200);
  assert.equal(ecritures, 0);
});

test("Google en panne → 503, page d'erreur sans plantage", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  const r = await appeler(await jeton("accepter"), "POST");
  assert.equal(r.status, 503);
  assert.match(await r.text(), /Réessayez/);
});
