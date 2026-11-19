/* Entretien du système (systeme.js) : maintien de la clé Brevo, sauvegarde hebdomadaire du Sheet dans R2, pause des ventes.
   Google, Brevo et R2 simulés, aucun appel réel. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { reglerAttentes, viderCacheJeton } from "../src/google.js";
reglerAttentes([0, 0]);
import { CLES, derniereSauvegardeZip, enCsv, entretien, lireEtatR2, lirePause, maintenirBrevo, MESSAGE_PAUSE, nomFichier, PERIODE_BREVO_MS,
  PERIODE_SAUVEGARDE_MS, REESSAI_MS, reglerPause, sauvegarderSheet } from "../src/systeme.js";
import { fauxBucket } from "./r2.mjs";

const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", paire.privateKey)).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
const silence = async f => { const s = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await f(); } finally { [console.log, console.warn, console.error] = s; } };

let r2, env, brevoStatut, appels, classeur, panneSheets;
beforeEach(() => {
  viderCacheJeton();
  r2 = fauxBucket();
  env = { CHECKOUT_MODE: "test", ALLOWED_ORIGINS: "https://www.evarysth.fr", STRIPE_SECRET_KEY: "sk_test_factice", STL: r2, BREVO_API_KEY: "xkeysib-factice",
    GOOGLE_SA_EMAIL: "w@p.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice" };
  brevoStatut = 200; appels = []; panneSheets = false;
  classeur = {
    "Commandes EV": [["N° commande", "Client", "Notes"], ["EV-2026-0001", "Camille \"Cam\" Test\nclient@example.com\n1 rue des Lilas, 75011 Paris", "a, b"]],
    "Modèles d'e-mails": [["Situation", "Objet"], ["Retard", "Commande {Réf} : léger retard"]]
  };
  globalThis.fetch = fauxFetch;
});

async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  appels.push(`${init.method || "GET"} ${u.host}${u.pathname}`);
  if (u.host === "api.brevo.com") { assert.equal(init.headers["api-key"], "xkeysib-factice"); return rep({ email: "x" }, brevoStatut); }
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  if (panneSheets) return rep({ error: { message: "Backend Error" } }, 500);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice", "")).replace(/^\//, "");
  if (chemin === "") return rep({ sheets: Object.keys(classeur).map(title => ({ properties: { title } })) });
  if (chemin === "values:batchGet") {
    const formule = u.searchParams.get("valueRenderOption") === "FORMULA";
    return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
      const [, titre, ref] = /^'(.+)'(?:!(.+))?$/.exec(r);
      const t = classeur[titre.replace(/''/g, "'")];
      return { range: r, values: ref === "1:3" ? t.slice(0, 3).map(l => (formule ? l.map(c => (String(c).startsWith("EV-") ? "=" + c : c)) : l)) : t };
    }) });
  }
  throw new Error("Chemin Sheets inattendu : " + chemin);
}

test("CSV : guillemets doublés, retours à la ligne et virgules gardés dans la cellule, BOM UTF-8 ; noms de fichiers sans accents", () => {
  const csv = enCsv([["a", "b,c"], ["d\"e", "f\ng"]]);
  assert.equal(csv, "﻿a,\"b,c\"\r\n\"d\"\"e\",\"f\ng\"\r\n");
  assert.equal(nomFichier("Commandes EV"), "Commandes-EV");
  assert.equal(nomFichier("Modèles d'e-mails"), "Modeles-d-e-mails");
});

test("Brevo : un appel de maintien par jour, nouvel essai toutes les heures après un échec, jamais sans clé ni R2", async () => {
  assert.deepEqual(await maintenirBrevo({ ...env, BREVO_API_KEY: "" }), { inactif: true });
  assert.deepEqual(await maintenirBrevo({ ...env, STL: undefined }), { inactif: true });
  assert.equal(appels.length, 0);
  const t0 = Date.UTC(2026, 10, 9, 10, 0);
  assert.deepEqual(await maintenirBrevo(env, t0), { ok: true, detail: "" });
  assert.deepEqual(appels, ["GET api.brevo.com/v3/account"]);
  assert.deepEqual(await lireEtatR2(env, CLES.brevo), { t: t0, ok: true, detail: "" });
  assert.deepEqual(await maintenirBrevo(env, t0 + PERIODE_BREVO_MS - 1000), { saute: true });
  assert.equal(appels.length, 1, "moins de 24 h : aucun nouvel appel");
  brevoStatut = 401;
  const r = await silence(() => maintenirBrevo(env, t0 + PERIODE_BREVO_MS + 1000));
  assert.equal(r.ok, false);
  assert.match(r.detail, /clé refusée \(HTTP 401\)/);
  assert.deepEqual(await maintenirBrevo(env, t0 + PERIODE_BREVO_MS + 2000), { saute: true }, "échec : pas de nouvel essai avant 1 h");
  brevoStatut = 200;
  assert.equal((await maintenirBrevo(env, t0 + PERIODE_BREVO_MS + REESSAI_MS + 5000)).ok, true);
});

test("Sauvegarde : une archive (un CSV par onglet, formules d'en-tête, manifeste) ; une par semaine ; 12 semaines gardées", async () => {
  const t0 = Date.UTC(2026, 10, 9, 10, 0);
  const r = await sauvegarderSheet(env, { maintenant: t0 });
  assert.equal(r.ok, true);
  assert.equal(r.cle, "sauvegardes/evarysth-2026-11-09.zip");
  assert.equal(r.onglets, 2);
  const zip = Buffer.from(r2.m.get(r.cle)).toString("utf8");           /* archive « stored » : le contenu est lisible tel quel */
  assert.match(zip, /^PK/);
  for (const n of ["Commandes-EV.csv", "Modeles-d-e-mails.csv", "formules-en-tetes.json", "manifeste.json"]) assert.ok(zip.includes(n), n);
  assert.ok(zip.includes("﻿N° commande,Client,Notes\r\n"));
  assert.ok(zip.includes('"Camille ""Cam"" Test\nclient@example.com\n1 rue des Lilas, 75011 Paris"'));
  assert.ok(zip.includes('"=EV-2026-0001"'), "formules des en-têtes");
  assert.equal([...r2.m.keys()].filter(k => k.startsWith("sauvegardes/")).length, 1, "un seul objet R2 par sauvegarde");
  const avant = appels.length;
  assert.deepEqual(await sauvegarderSheet(env, { maintenant: t0 + PERIODE_SAUVEGARDE_MS - 1000 }), { saute: true });
  assert.equal(appels.length, avant, "moins de 7 jours : aucun appel à Google");
  assert.equal((await sauvegarderSheet(env, { maintenant: t0 + 3600_000, force: true })).ok, true, "à la demande : refaite tout de suite");
  /* 14 semaines de plus : seules les 12 dernières restent */
  for (let k = 1; k <= 14; k++) assert.equal((await sauvegarderSheet(env, { maintenant: t0 + 3600_000 + k * PERIODE_SAUVEGARDE_MS + 1000 })).ok, true);
  const cles = [...r2.m.keys()].filter(k => k.startsWith("sauvegardes/")).sort();
  assert.equal(cles.length, 12);
  assert.equal(cles[0], "sauvegardes/evarysth-2026-11-30.zip", "15 sauvegardes faites, les 3 plus anciennes sont supprimées");
  assert.ok(r2.m.has(CLES.sauvegarde), "l'état n'est pas dans le dossier des sauvegardes");
});

test("Sauvegarde : Google en panne → échec noté (réessai dans 1 h), dernière réussite conservée ; sans R2 ni Google : inactive", async () => {
  assert.deepEqual(await sauvegarderSheet({ ...env, STL: undefined }), { inactif: true });
  assert.deepEqual(await sauvegarderSheet({ ...env, SHEET_ID: "" }), { inactif: true });
  const t0 = Date.UTC(2026, 10, 9, 10, 0);
  await sauvegarderSheet(env, { maintenant: t0 });
  panneSheets = true;
  const r = await silence(() => sauvegarderSheet(env, { maintenant: t0 + 8 * 86400_000 }));
  assert.equal(r.ok, false);
  assert.match(r.detail, /Sheets 500/);
  assert.equal(r.tOk, t0, "date de la dernière réussite gardée");
  panneSheets = false;
  assert.deepEqual(await sauvegarderSheet(env, { maintenant: t0 + 8 * 86400_000 + 60_000 }), { saute: true });
  assert.equal((await sauvegarderSheet(env, { maintenant: t0 + 8 * 86400_000 + REESSAI_MS + 1000 })).ok, true);
});

test("Sauvegarde : dernière réussite téléchargeable (ZIP : CSV, formules, manifeste) ; aucune sauvegarde → null", async () => {
  assert.equal(await derniereSauvegardeZip(env), null);
  await sauvegarderSheet(env, { maintenant: Date.UTC(2026, 10, 9, 10, 0) });
  const z = await derniereSauvegardeZip(env);
  assert.equal(z.nom, "evarysth-2026-11-09.zip");
  const texte = Buffer.from(z.octets).toString("latin1");
  assert.equal(texte.slice(0, 2), "PK");
  for (const n of ["Commandes-EV.csv", "Modeles-d-e-mails.csv", "formules-en-tetes.json", "manifeste.json"]) assert.ok(texte.includes(n), n);
});

test("Entretien : ne lève jamais, bilan par tâche", async () => {
  const b = await entretien(env, Date.UTC(2026, 10, 9, 10, 0));
  assert.equal(b.brevo.ok, true);
  assert.equal(b.sauvegarde.ok, true);
  panneSheets = true; brevoStatut = 500;
  const b2 = await silence(() => entretien(env, Date.UTC(2026, 11, 20, 10, 0)));
  assert.equal(b2.brevo.ok, false);
  assert.equal(b2.sauvegarde.ok, false);
});

test("Pause des ventes : POST /checkout refusé avec le message, rouvert ensuite ; R2 absent ou illisible → ventes ouvertes", async () => {
  assert.deepEqual(await lirePause(env), { active: false, message: "", depuis: "" });
  const checkout = () => silence(() => worker.fetch(new Request("https://w.dev/checkout", { method: "POST", headers: { Origin: "https://www.evarysth.fr", "Content-Type": "application/json" }, body: "{}" }), env));
  assert.equal((await checkout()).status, 400, "ouvert : le panier vide est refusé pour son propre motif");
  await reglerPause(env, { active: true });
  let r = await checkout();
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: MESSAGE_PAUSE, pause: true });
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://www.evarysth.fr", "le panier du site peut lire le message");
  await reglerPause(env, { active: true, message: "  Fermé jusqu'au 20 novembre.  " });
  assert.equal((await (await checkout()).json()).error, "Fermé jusqu'au 20 novembre.");
  await reglerPause(env, { active: false });
  assert.equal((await checkout()).status, 400);
  r2.m.set(CLES.pause, "pas du json");
  assert.deepEqual(await silence(() => lirePause(env)), { active: false, message: "", depuis: "" });
  await assert.rejects(() => reglerPause({ ...env, STL: undefined }, { active: true }), /R2 indisponible/);
});
