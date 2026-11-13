/* Fichiers générés dans /admin (état, liens, relance, régénération au SHA actuel), validation
   refusée tant que les fichiers ne sont pas prêts, e-mail fabricant avec 3 liens signés 14 jours, fabricant « atelier »
   selon la matière, archive zip virtuelle, Système (jeton GitHub, dernier run, R2), Tableau de bord.
   Google Sheets, Brevo, Access, Stripe, GitHub et R2 simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import worker from "../src/index.js";
import { viderCacheJeton, reglerAttentes, NOMS_AFFICHES } from "../src/google.js";
reglerAttentes([0, 0]);
import { viderCacheAcces } from "../src/acces.js";
import { tachePlanifiee } from "../src/planifie.js";
import { viderCacheVersion, MATIERES_ATELIER, atelierPossible } from "../src/fabrication.js";
import { creerJetonFichier, verifierJetonFichier } from "../src/fichier.js";
import { crc32, zipStocke } from "../src/zip.js";
import { COL_CF, ENTETES_CF, ENTETES_EV, objet, appliquerFormules } from "./entetes.mjs";

const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const gen = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const [google, access] = await Promise.all([gen(), gen()]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", google.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
const JWK = { ...(await crypto.subtle.exportKey("jwk", access.publicKey)), kid: "k1" };

const HOTE = "admin.test.dev", ORIGINE = `https://${HOTE}`, EV = "EV-2026-0004";
const SHA = "448818330ea9" + "0".repeat(28), SHA2 = "abcdef012345" + "1".repeat(28);
const COLS_GEN = ["Génération", "SHA", "Masse g", "Temps min", "Plateaux", "Motif génération"];
const ENT_CF = [...ENTETES_CF, ...COLS_GEN];
const C = Object.fromEntries(ENT_CF.map((n, i) => [n, i]));

/* R2 simulé : Map clé → octets */
function fauxR2(objets) {
  const m = new Map(Object.entries(objets).map(([k, v]) => [k, typeof v === "string" ? new TextEncoder().encode(v) : v]));
  const obj = k => ({ size: m.get(k).length, body: m.get(k), text: async () => new TextDecoder().decode(m.get(k)), arrayBuffer: async () => m.get(k).buffer.slice(m.get(k).byteOffset, m.get(k).byteOffset + m.get(k).length) });
  return { m, get: async k => (m.has(k) ? obj(k) : null), head: async k => (m.has(k) ? { size: m.get(k).length } : null),
    list: async ({ prefix = "" } = {}) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k, size: m.get(k).length })), truncated: false }) };
}
const DOSSIER = `commandes/CF-2026-0004-1/${SHA.slice(0, 12)}/`;
const FICHIERS = ["passe-cable-1.stl", "passe-cable-2.stl", "plateau-1.3mf", "plateau-1.gcode.3mf", "fiche.html", "manifeste.json"];
const r2Plein = () => fauxR2({ ...Object.fromEntries(FICHIERS.filter(f => f !== "manifeste.json").map(f => [DOSSIER + f, f === "fiche.html" ? "<!DOCTYPE html><p>fiche</p>" : `contenu ${f}`])),
  [DOSSIER + "manifeste.json"]: JSON.stringify({ cf: "CF-2026-0004-1", sha: SHA, fichiers: FICHIERS }) });

const envBase = () => ({ ADMIN_HOST: HOTE, ACCESS_TEAM_DOMAIN: "equipe.cloudflareaccess.com", ACCESS_AUD: "aud-test", ADMIN_EMAILS: "evarysth@gmail.com",
  CHECKOUT_MODE: "test", GOOGLE_SA_EMAIL: "w@p.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice", HMAC_SECRET: "secret-de-test",
  BREVO_API_KEY: "xkeysib-factice", WORKER_URL: "https://public.dev", STRIPE_SECRET_KEY: "sk_test_factice",
  GH_ACTIONS_TOKEN: "github_pat_factice", FABRICATION_HMAC: "hmac-fab", SITE_URL: "https://site.test", STL: r2Plein() });

async function jwt() {
  const corps = `${b64({ alg: "RS256", kid: "k1", typ: "JWT" })}.${b64({ iss: "https://equipe.cloudflareaccess.com", aud: ["aud-test"], email: "evarysth@gmail.com", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${corps}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", access.privateKey, new TextEncoder().encode(corps))).toString("base64url")}`;
}

let env, sheet, emails, dispatches, ghExpiration, ghRuns, shaSite;
const ligneCF = (n, statut, extra = {}) => { const l = ENT_CF.map(() => ""); Object.assign(l, { [C["Commande EV"]]: EV, [C["Article n°"]]: String(n),
  [C.Statut]: statut, [C["Dernier statut notifié"]]: statut, [C.Date]: "2026-11-09 10:00" });
  for (const [k, v] of Object.entries(extra)) l[C[k]] = v; return l; };
beforeEach(() => {
  viderCacheJeton(); viderCacheAcces(); viderCacheVersion();
  env = envBase(); emails = []; dispatches = []; shaSite = SHA2;
  ghExpiration = "2027-03-01 10:00:00 UTC"; ghRuns = [{ display_title: "Fabrication CF-2026-0004-1", status: "completed", conclusion: "success", created_at: "2026-11-09T18:40:00Z", html_url: "https://github.com/virnichka/evarysth/actions/runs/1" }];
  const ev = ENTETES_EV.map(() => "");
  Object.assign(ev, { 0: EV, 1: "2026-11-09 10:00", 4: "sur-mesure", 6: "Camille Test\nclient@example.com\n1 rue des Lilas, 75011 Paris, FR", 10: "cs_test_gen" });
  sheet = { "Commandes EV": [ENTETES_EV.slice(), ev],
    "Commandes CF": [ENT_CF.slice(),
      ligneCF(1, "lien_stl_a_indiquer", { Type: "sur-mesure", Article: "passe-cable · a=60 · PLA · Noir mat · ×1", Génération: "prete", SHA, "Masse g": "18.44", "Temps min": "42", Plateaux: "1" }),
      ligneCF(2, "a_valider", { Type: "standard", Article: "tablette-rambarde · M · ASA · Noir mat · ×1", Génération: "echec", SHA, "Motif génération": "génération : erreur simulée" })],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client", "Envoi"], ["Atelier Evarysth", "", "3", "non", "atelier"], ["Atelier Dupont", "dupont@example.com", "5", "non", ""]] };
  globalThis.fetch = fauxFetch;
});

const col = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const plage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o.replace(/''/g, "'"), ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: h });
  if (u.host === "equipe.cloudflareaccess.com") return rep({ keys: [JWK] });
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host === "api.brevo.com") { emails.push(JSON.parse(init.body)); return rep({ messageId: "m" }, 201); }
  if (u.host === "site.test" && u.pathname === "/version.json") return rep({ sha: shaSite });
  if (u.host === "api.stripe.com") {
    if (u.pathname.endsWith("/line_items")) return rep({ data: [
      { quantity: 1, price: { product: { metadata: { produit: "passe-cable", mode: "custom", cotes_mm: '{"a":60}', coloris: "noir" } } } },
      { quantity: 1, price: { product: { metadata: { produit: "tablette-rambarde", mode: "standard", cotes_mm: '{"a":40}', coloris: "noir" } } } }] });
    return rep({ id: "cs_test_gen", metadata: { sha: SHA } });
  }
  if (u.host === "api.github.com") {
    if (init.method === "POST") { dispatches.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
    return rep({ workflow_runs: ghRuns }, 200, ghExpiration ? { "github-authentication-token-expiration": ghExpiration } : {});
  }
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin.startsWith("developerMetadata/")) return rep({ error: { message: "introuvable" } }, 404);
  if (chemin === "values:batchGet") { appliquerFormules(sheet); return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = plage(r);
    if (ref === "1:1") return { range: r, values: [sheet[onglet][0]] };
    const v = sheet[onglet].map(l => l[col(ref.split(":")[0])] ?? "");
    while (v.length && v[v.length - 1] === "") v.pop();
    return { range: r, values: [v] };
  }) }); }
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
const art = n => objet(ENT_CF, sheet["Commandes CF"][n]);
const get = async chemin => silence(async () => worker.fetch(new Request(ORIGINE + chemin, { headers: { "Cf-Access-Jwt-Assertion": await jwt() } }), env));
const fiche = async () => (await get(`/admin?q=${EV}`)).text();
async function envoyer(chemin, champs) {
  const corps = new URLSearchParams({ csrf: /name="csrf" value="([^"]+)"/.exec(await fiche())[1], ev: EV });
  for (const [k, v] of Object.entries(champs)) corps.append(k, v);
  return silence(async () => worker.fetch(new Request(ORIGINE + chemin, { method: "POST", body: corps,
    headers: { "Cf-Access-Jwt-Assertion": await jwt(), "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGINE } }), env));
}
const bandeau = r => decodeURIComponent(new URL(r.headers.get("Location"), ORIGINE).searchParams.get("m") || "");
const jetonDe = url => decodeURIComponent(/\/fichier\/([^"\s<]+)/.exec(url)[1]);
const servir = async (jeton, e = env) => silence(() => worker.fetch(new Request(`https://public.dev/fichier/${encodeURIComponent(jeton)}`), e));

test("Zip : CRC-32 de référence, archive lisible par Python (zipfile), contenus intacts", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = zipStocke([{ nom: "a.stl", octets: new TextEncoder().encode("solide A") }, { nom: "b.stl", octets: new Uint8Array([0, 1, 2, 255]) }]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-")), "t.zip");
  fs.writeFileSync(f, zip);
  const sortie = execFileSync("python3", ["-I", "-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(z.namelist(), z.read('a.stl').decode(), list(z.read('b.stl')))", f]).toString();
  assert.equal(sortie.trim(), "['a.stl', 'b.stl'] solide A [0, 1, 2, 255]");
});

test("Liens de fichiers générés : clé du dossier de commande signée, chemin détourné refusé, archive des STL, fiche affichée isolée", async () => {
  const jeton = await creerJetonFichier(env, { cle: DOSSIER + "plateau-1.gcode.3mf" });
  assert.equal((await verifierJetonFichier(env, jeton)).cle, DOSSIER + "plateau-1.gcode.3mf");
  for (const cle of [`commandes/CF-2026-0004-1/${SHA.slice(0, 12)}/../secret.stl`, "commandes/EV-2026-0004/abc/x.stl", DOSSIER + "manifeste.json", DOSSIER + "x.exe"])
    await assert.rejects(creerJetonFichier(env, { cle }), /invalide/, cle);
  const r = await servir(jeton);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Disposition"), /attachment; filename="CF-2026-0004-1-plateau-1\.gcode\.3mf"/);
  const z = await servir(await creerJetonFichier(env, { cle: DOSSIER + "stl.zip" }));
  assert.equal(z.status, 200);
  assert.equal(z.headers.get("Content-Type"), "application/zip");
  const octets = new Uint8Array(await z.arrayBuffer());
  const texte = new TextDecoder("latin1").decode(octets);
  assert.match(texte, /passe-cable-1\.stl[\s\S]*passe-cable-2\.stl/);
  assert.doesNotMatch(texte, /plateau-1/, "seulement les STL");
  const h = await servir(await creerJetonFichier(env, { cle: DOSSIER + "fiche.html" }));
  assert.match(h.headers.get("Content-Type"), /text\/html/);
  assert.match(h.headers.get("Content-Disposition"), /^inline/);
  assert.match(h.headers.get("Content-Security-Policy"), /^sandbox; default-src 'none'/);
  assert.equal((await servir(await creerJetonFichier(env, { cle: `commandes/CF-2026-0004-9/${SHA.slice(0, 12)}/3mf.zip` }))).status, 404);
});

test("Fiche : fichiers prêts (masse, temps, plateaux, liens STL zip / 3MF / tranché / fiche), échec avec motif et boutons de relance", async () => {
  const html = await fiche();
  assert.doesNotMatch(html, /<h2>Fichiers d'impression/, "plus de section à part : un pli sous chaque article");
  const valider = /<form class="valider"[\s\S]*?<\/form>/.exec(html)[0];
  assert.doesNotMatch(valider.slice(1), /<form/, "pas de formulaire imbriqué dans « Valider et envoyer »");
  assert.match(valider, /Article 1<\/span>[\s\S]*passe-cable · a=60[^<]*<\/div>\n<div class="fich"><span class="badge t-ok">Fichiers prêts<\/span><span><a [^>]+>STL \(2 fichiers, zip\) ↗<\/a>[^]*?<\/span><span class="muted">18\.44 g · 42 min · 1 plateau<\/span><\/div>\n<label for="fab-[^]*?<details class="options"><summary><span class="nom">Autres options<\/span><\/summary><div class="detail"><label for="stl-EV-2026-0004-1">Lien STL <span class="muted">\(remplace les fichiers générés, facultatif\)[^]*?dossier CF-2026-0004-1 · SHA 448818330ea9 · PLA \(atelier possible\)[^]*?Article 2<\/span>/, "une ligne de fichiers ; lien STL et détails dans « Autres options »");
  assert.match(valider, /Article 2<\/span>[\s\S]*Génération en échec<\/span><span><span class="a-faire">génération : erreur simulée<\/span>[\s\S]*form="gen-EV-2026-0004-2-relancer">Relancer la génération<\/button>\n<label for="fab-[^]*?<label for="stl-EV-2026-0004-2">Lien STL<\/label>[^]*?Autres options/, "échec : motif, relance et lien STL visibles");
  assert.match(html, /<form id="gen-EV-2026-0004-2-relancer" method="post" action="\/admin\/generation">[^]*?name="n" value="2"><input type="hidden" name="mode" value="relancer"><\/form>/);
  assert.match(html, /STL \(2 fichiers, zip\) ↗[\s\S]*3MF ↗[\s\S]*Tranché P2S plateau-1 ↗[\s\S]*Fiche ↗/);
  const lienStl = /href="(https:\/\/public\.dev\/fichier\/[^"]+)"[^>]*>STL \(2/.exec(html)[1];
  const { cle, expiration } = await verifierJetonFichier(env, jetonDe(lienStl));
  assert.equal(cle, DOSSIER + "stl.zip");
  assert.ok(Math.abs(expiration - Date.now() - 2 * 86400_000) < 60_000, "liens de /admin : 2 jours");
  assert.match(html, /Génération en échec[\s\S]*génération : erreur simulée[\s\S]*Relancer la génération/);
  assert.match(html, /form="gen-EV-2026-0004-1-actuel" type="checkbox" name="confirmer" value="oui" required[\s\S]*form="gen-EV-2026-0004-1-actuel">Régénérer au SHA actuel/);
  assert.equal((html.match(/value="relancer"/g) || []).length, 1, "pas de relance pour un article déjà prêt");
  assert.doesNotMatch(html, /<script/i);
});

test("Valider : refusé tant que la génération n'est pas prête (sauf lien STL saisi) ; prête → e-mail fabricant avec STL, 3MF et fiche (14 jours)", async () => {
  let r = await envoyer("/admin/valider", { fab_2: "Atelier Dupont", stl_2: "" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Article 2 : fichiers pas encore prêts \(génération en échec : génération : erreur simulée\)/);
  assert.equal(art(2).Statut, "a_valider", "rien d'écrit");

  r = await envoyer("/admin/valider", { fab_1: "Atelier Dupont", stl_1: "" });
  assert.equal(r.status, 303, bandeau(r));
  assert.equal(art(1).Statut, "envoyee_fabricant");
  assert.equal(art(1)["Lien STL"], "", "fichiers générés : pas de lien recopié");
  assert.equal(emails.length, 1);
  const t = emails[0].textContent;
  assert.match(t, /Fichiers d'impression \(liens valables 14 jours[\s\S]*STL \(2 fichiers, archive zip\) : https:\/\/public\.dev\/fichier\/\S+\n3MF non tranché : https:\/\/public\.dev\/fichier\/\S+\nFiche d'impression : https:\/\/public\.dev\/fichier\/\S+/);
  assert.doesNotMatch(t, /gcode|Tranché/, "fabricant externe : pas de fichier tranché");
  const h = emails[0].htmlContent;
  assert.match(h, /<a href="https:\/\/public\.dev\/fichier\/[^"]+"[^>]*>STL \(2 fichiers, archive zip\)<\/a><br><a href="https:\/\/public\.dev\/fichier\/[^"]+"[^>]*>3MF non tranché<\/a><br><a href="[^"]+"[^>]*>Fiche d&#39;impression<\/a>/,
    "liens nommés, une ligne chacun");
  assert.doesNotMatch(h.replace(/<a [^>]*>/g, ""), /https:\/\//, "aucune URL en texte brut (Gmail y collait la ligne suivante)");
  const liens = [...t.matchAll(/https:\/\/public\.dev\/fichier\/(\S+)/g)].map(m => decodeURIComponent(m[1]));
  assert.equal(liens.length, 3);
  for (const j of liens) {
    const { expiration } = await verifierJetonFichier(env, j);
    assert.ok(Math.abs(expiration - Date.now() - 14 * 86400_000) < 60_000);
    assert.equal((await servir(j)).status, 200, "lien valide");
  }

  r = await envoyer("/admin/valider", { fab_2: "Atelier Dupont", stl_2: "https://drive.google.com/fichier-a-la-main" });
  assert.equal(r.status, 303, "lien saisi à la main : accepté malgré l'échec");
  assert.equal(art(2)["Lien STL"], "https://drive.google.com/fichier-a-la-main");
});

test("Atelier : proposé seulement pour PLA/PETG, refusé pour un article en ASA ; PLA → acceptée sans e-mail, fichier tranché sur la fiche", async () => {
  assert.deepEqual(MATIERES_ATELIER, ["pla", "petg"]);
  const profils = fs.readFileSync(new URL("../../tools/trancher.mjs", import.meta.url), "utf8");
  for (const m of MATIERES_ATELIER) assert.match(profils, new RegExp(`${m}: "filament-${m}\\.json"`), "même liste que les profils de tranchage");
  assert.equal(atelierPossible("tablette-rambarde · M · ASA · Noir mat · ×1"), false);
  assert.equal(atelierPossible("cintre-sac · M · PETG · Noir mat · ×1"), true);
  const html = await fiche();
  const select = n => new RegExp(`<select id="fab-${EV}-${n}"[\\s\\S]*?</select>`).exec(html)[0];
  assert.match(select(1), /Atelier Evarysth \(atelier\)/);
  assert.doesNotMatch(select(2), /Atelier Evarysth/, "ASA : atelier non proposé");
  let r = await envoyer("/admin/valider", { fab_2: "Atelier Evarysth", stl_2: "https://drive.google.com/x" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Article 2 : l&#39;atelier n&#39;imprime que PLA et PETG \(matière ASA\)/);
  r = await envoyer("/admin/valider", { fab_1: "Atelier Evarysth", stl_1: "" });
  assert.equal(r.status, 303);
  assert.equal(art(1).Statut, "acceptee");
  assert.equal(emails.length, 0);
  const apres = await fiche();
  assert.match(apres, /Fiche à transmettre[\s\S]*Fichier tranché P2S \(plateau-1\.gcode\.3mf\) : https:\/\/public\.dev\/fichier\//);
  const envoi = /<h2>Envois fabricant[\s\S]*/.exec(apres)[0];
  assert.match(envoi, /Article 1<\/span>[\s\S]*class="fich"><span class="badge t-ok">Fichiers prêts[\s\S]*Tranché P2S plateau-1 ↗/, "fichiers sous l'article envoyé");
  assert.doesNotMatch(envoi.split("Historique")[0], /Régénérer|Relancer/, "article envoyé : fichiers en lecture seule");
  const fab = await (await get("/admin?vue=fabricants")).text();
  assert.match(fab, /Atelier \(envoi manuel ; PLA, PETG seulement\)/);
});

test("Relancer la génération : même SHA, Génération en_cours, ligne d'Historique ; puis le rappel du workflow la passe à prête", async () => {
  const r = await envoyer("/admin/generation", { n: "2", mode: "relancer" });
  assert.match(bandeau(r), /Article 2 : génération relancée/);
  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0].inputs, { cf: "CF-2026-0004-2", produit: "tablette-rambarde", cotes: '{"a":40}', coloris: "noir", quantite: "1", sha: SHA });
  assert.equal(art(2).Génération, "en_cours");
  assert.equal(art(2)["Motif génération"], "");
  const j = sheet.Journal.at(-1);
  assert.deepEqual(j.slice(1), ["CF-2026-0004-2", "echec", "generation_relancee", "proprietaire"]);
  assert.match(await fiche(), /CF-2026-0004-2<\/b> · Fichiers : génération en échec → Génération relancée \(même SHA\)/);

  /* Rappel signé du workflow (même SHA) → prete */
  const corps = JSON.stringify({ cf: "CF-2026-0004-2", sha: SHA, statut: "prete", masse_g: 30, temps_min: 50, plateaux: 1 });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = Buffer.from(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", new TextEncoder().encode("hmac-fab"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(`${ts}.${corps}`))).toString("hex");
  const rr = await silence(() => worker.fetch(new Request("https://public.dev/fabrication/retour", { method: "POST", body: corps, headers: { "X-Evarysth-Horodatage": ts, "X-Evarysth-Signature": sig } }), env));
  assert.equal(rr.status, 200);
  assert.equal(art(2).Génération, "prete");

  const deja = await envoyer("/admin/generation", { n: "1", mode: "relancer" });
  assert.match(bandeau(deja), /déjà prêts/);
  assert.equal(dispatches.length, 1, "article prêt : rien relancé");
});

test("Régénérer au SHA actuel : case obligatoire, nouveau SHA écrit (le rappel à ce SHA est accepté), Historique ; article envoyé : refusé", async () => {
  let r = await envoyer("/admin/generation", { n: "1", mode: "actuel" });
  assert.match(bandeau(r), /Cochez « Je confirme »/);
  assert.equal(dispatches.length, 0);
  r = await envoyer("/admin/generation", { n: "1", mode: "actuel", confirmer: "oui" });
  assert.match(bandeau(r), /régénération au SHA abcdef012345/);
  assert.equal(dispatches[0].inputs.sha, SHA2);
  assert.equal(art(1).SHA, SHA2);
  assert.equal(art(1).Génération, "en_cours");
  assert.equal(art(1)["Masse g"], "", "anciennes valeurs effacées");
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0004-1", "SHA 448818330ea9", "regeneree_sha_actuel", "proprietaire"]);

  sheet["Commandes CF"][1][C.Statut] = "envoyee_fabricant";
  r = await envoyer("/admin/generation", { n: "1", mode: "actuel", confirmer: "oui" });
  assert.match(bandeau(r), /déjà envoyé ou clos/);
  assert.equal(dispatches.length, 1);
});

test("Relance : GitHub refuse → message clair, a_declencher (nouvel essai planifié) ; fabrication non configurée → aucun bouton", async () => {
  globalThis.fetch = async (url, init) => (new URL(url).host === "api.github.com" && init && init.method === "POST"
    ? new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }) : fauxFetch(url, init));
  const r = await envoyer("/admin/generation", { n: "2", mode: "relancer" });
  assert.match(bandeau(r), /GitHub a refusé le lancement \(déclenchement en échec \(GitHub 401 : Bad credentials\), essai 1\/6\)/);
  assert.equal(art(2).Génération, "a_declencher");
  delete env.GH_ACTIONS_TOKEN;
  const html = await fiche();
  assert.doesNotMatch(html, /\/admin\/generation/);
});

test("Tableau de bord : génération en échec signalée ; Système : jeton GitHub (alerte à J-30), dernier run, R2", async () => {
  const tab = await (await get("/admin?vue=tableau")).text();
  assert.match(tab, /CF-2026-0004-2<\/b><\/a><br><span class="muted">génération des fichiers en échec : génération : erreur simulée/);
  let sys = await (await get("/admin?vue=systeme")).text();
  assert.match(sys, /v-ok"><\/span>Jeton GitHub<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">expire le 1 mars 2027/);
  assert.match(sys, /Dernière fabrication<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">Fabrication CF-2026-0004-1 · 9 nov\. 2026 à 18:40 UTC · réussie/);
  assert.match(sys, /v-ok"><\/span>R2 \(fichiers\)<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">bucket lisible/);
  const dans = new Date(Date.now() + 10 * 86400_000).toISOString().replace("T", " ").slice(0, 19);
  ghExpiration = `${dans} UTC`;
  sys = await (await get("/admin?vue=systeme")).text();
  assert.match(sys, /v-att"><\/span>Jeton GitHub<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">expire le .* \(dans (9|10) jours : à renouveler\)/);
  ghExpiration = "2020-01-02 00:00:00 +0100";
  sys = await (await get("/admin?vue=systeme")).text();
  assert.match(sys, /v-err"><\/span>Jeton GitHub<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">expiré le 1 janv\. 2020/);
  /* Aide « ? » sur chaque voyant (details/summary, sans script) */
  for (const nom of ["Google Sheet", "Brevo \\(e-mails\\)", "R2 \\(fichiers\\)", "Paiement : mode test", "Tâche planifiée", "Fabrication automatique", "Jeton GitHub", "Dernière fabrication"])
    assert.match(sys, new RegExp(`<details class="aide"><summary class="ligne"[^>]*><span><span class="voyant v-[a-z]+"></span>${nom}<span class="q" aria-hidden="true">\\?</span>[\\s\\S]*?<p class="aide-texte">[^<]{40,}</p></details>`), nom);
  assert.match(sys, /Jeton GitHub[\s\S]*?orange 30 jours avant, il faut alors en créer une nouvelle/);
  assert.doesNotMatch(sys, /<script/i);
  env.STL = { ...env.STL, list: async () => { throw new Error("panne"); } };
  sys = await (await get("/admin?vue=systeme")).text();
  assert.match(sys, /v-err"><\/span>R2 \(fichiers\)<span class="q" aria-hidden="true">\?<\/span><\/span><span class="muted">R2 ne répond pas/);
});

test("Tâche planifiée : fichiers prêts → « Lien STL à indiquer » devient « À valider » (aucun e-mail) ; en échec : inchangé", async () => {
  sheet["Commandes CF"][2][C.Statut] = sheet["Commandes CF"][2][C["Dernier statut notifié"]] = "lien_stl_a_indiquer";
  await silence(() => tachePlanifiee(env));
  assert.equal(art(1).Statut, "a_valider");
  assert.equal(art(2).Statut, "lien_stl_a_indiquer");
  assert.equal(emails.length, 0);
});

test("En-têtes renommés dans le Sheet (noms parlants) : fiche, validation, tâche planifiée et rappel de fabrication fonctionnent", async () => {
  for (const onglet of ["Commandes EV", "Commandes CF", "Journal"]) {
    const vers = Object.fromEntries(Object.entries(NOMS_AFFICHES[onglet]).map(([affiche, interne]) => [interne, affiche]));
    sheet[onglet][0] = sheet[onglet][0].map(n => vers[n] || n);
  }
  assert.equal(sheet["Commandes CF"][0][C.Génération], "Fichiers d'impression");
  assert.equal(sheet["Commandes CF"][0][C["Lien STL"]], "Lien STL manuel");
  assert.match(await fiche(), /Fichiers prêts[\s\S]*18\.44 g · 42 min/);
  await silence(() => tachePlanifiee(env));
  assert.equal(sheet["Commandes CF"][1][C.Statut], "a_valider", "colonne « Statut article » trouvée");
  let r = await envoyer("/admin/valider", { fab_1: "Atelier Dupont", stl_1: "" });
  assert.equal(r.status, 303, bandeau(r));
  assert.equal(sheet["Commandes CF"][1][C.Statut], "envoyee_fabricant");
  assert.equal(sheet["Commandes CF"][1][C["Dernier statut notifié"]], "envoyee_fabricant", "« Dernier e-mail envoyé » écrit");
  assert.equal(emails.length, 1);
  r = await envoyer("/admin/generation", { n: "2", mode: "relancer" });
  assert.match(bandeau(r), /génération relancée/);
  assert.equal(sheet["Commandes CF"][2][C.Génération], "en_cours");
  assert.equal(sheet.Journal.at(-1)[1], "CF-2026-0004-2", "Journal : colonne « N° concerné »");
});
