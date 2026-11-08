/* Page d'administration (/admin) : accès Cloudflare Access revérifié, point de verrou, validation → e-mail fabricant
   immédiat, double clic, requêtes étrangères, blocage. Google Sheets, Brevo et Access simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { viderCacheJeton } from "../src/google.js";
import { viderCacheAcces } from "../src/acces.js";
import { lienValide } from "../src/admin.js";
import { tachePlanifiee } from "../src/planifie.js";
import { COL_CF, ENTETES_CF, ENTETES_EV, objet, appliquerFormules } from "./entetes.mjs";

const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const gen = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const [google, access, intrus] = await Promise.all([gen(), gen(), gen()]);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", google.privateKey)).toString("base64");
const PEM = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
const JWK = { ...(await crypto.subtle.exportKey("jwk", access.publicKey)), kid: "k1" };

const HOTE = "admin.test.dev", ORIGINE = `https://${HOTE}`, FAB = "Atelier Dupont";
const env = { ADMIN_HOST: HOTE, ACCESS_TEAM_DOMAIN: "equipe.cloudflareaccess.com", ACCESS_AUD: "aud-test", ADMIN_EMAILS: "Evarysth@gmail.com",
  CHECKOUT_MODE: "test", GOOGLE_SA_EMAIL: "w@p.iam.gserviceaccount.com", GOOGLE_SA_KEY: PEM, SHEET_ID: "id-factice", HMAC_SECRET: "secret-de-test",
  BREVO_API_KEY: "xkeysib-factice", WORKER_URL: "https://public.dev" };

async function jwt({ email = "evarysth@gmail.com", aud = ["aud-test"], iss = "https://equipe.cloudflareaccess.com", exp = Date.now() / 1000 + 3600, cle = access.privateKey } = {}) {
  const corps = `${b64({ alg: "RS256", kid: "k1", typ: "JWT" })}.${b64({ iss, aud, email, exp: Math.floor(exp), iat: Math.floor(Date.now() / 1000) })}`;
  return `${corps}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(corps))).toString("base64url")}`;
}

let sheet, emails, brevoEnPanne, meta;
beforeEach(() => {
  viderCacheJeton(); viderCacheAcces();
  brevoEnPanne = false; emails = []; meta = null;
  const ligneCF = (n, statut, extra = {}) => { const l = ENTETES_CF.map(() => ""); Object.assign(l, { [COL_CF["Commande EV"]]: "EV-2026-0010", [COL_CF["Article n°"]]: String(n),
    [COL_CF.Statut]: statut, [COL_CF["Dernier statut notifié"]]: statut, [COL_CF.Date]: "2026-11-08 10:00" });
    for (const [k, v] of Object.entries(extra)) l[COL_CF[k]] = v; return l; };
  const ev = ENTETES_EV.map(() => "");
  Object.assign(ev, { 0: "EV-2026-0010", 1: "2026-11-08 10:00", 4: "sur-mesure", 6: "Camille Test\nclient@example.com\n1 rue des Lilas, 75011 Paris, FR", 10: "cs_test_admin" });
  sheet = { "Commandes EV": [ENTETES_EV.slice(), ev],
    "Commandes CF": [ENTETES_CF.slice(),
      ligneCF(1, "lien_stl_a_indiquer", { Type: "sur-mesure", Article: "boite-rugged · a=142 b=60 c=45 · PETG · Noir mat · ×1" }),
      ligneCF(2, "lien_stl_a_indiquer", { Type: "standard", Article: "tablette-rambarde · M · ASA · Noir mat · ×1" })],
    Journal: [["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]],
    Fabricants: [["Nom", "E-mail", "Délai (jours)", "Livre le client"], [FAB, "atelier@example.com", "5", "non"], ["Sans Mail", "", "5", "non"]] };
  globalThis.fetch = fauxFetch;
});

const col = l => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const plage = a1 => { const [, o, ref] = /^'(.+)'!(.+)$/.exec(a1); return { onglet: o.replace(/''/g, "'"), ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.host === "equipe.cloudflareaccess.com" && u.pathname === "/cdn-cgi/access/certs") return rep({ keys: [JWK] });
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host === "api.brevo.com") { if (brevoEnPanne) return rep({ message: "panne" }, 500); emails.push(JSON.parse(init.body)); return rep({ messageId: "m" }, 201); }
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  if (u.pathname === "/v4/spreadsheets/id-factice:batchUpdate") {
    for (const r of JSON.parse(init.body).requests) {
      if (r.updateDeveloperMetadata) { if (!meta) return rep({ error: { message: "introuvable" } }, 400); meta = r.updateDeveloperMetadata.developerMetadata.metadataValue; return rep({ replies: [{ updateDeveloperMetadata: { developerMetadata: [{}] } }] }); }
      if (r.createDeveloperMetadata) { meta = r.createDeveloperMetadata.developerMetadata.metadataValue; return rep({ replies: [{}] }); }
    }
  }
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin.startsWith("developerMetadata/")) return meta ? rep({ metadataValue: meta }) : rep({ error: { message: "introuvable" } }, 404);
  if (chemin === "values:batchGet") { appliquerFormules(sheet); return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = plage(r), v = sheet[onglet].map(l => l[col(ref.split(":")[0])] ?? "");
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
const art = n => objet(ENTETES_CF, sheet["Commandes CF"][n]);

async function ouvrir({ jeton, hote = HOTE, e = env } = {}) {
  const headers = jeton === null ? {} : { "Cf-Access-Jwt-Assertion": jeton || await jwt() };
  return silence(() => worker.fetch(new Request(`https://${hote}/admin`, { headers }), e));
}
const csrfDe = html => /name="csrf" value="([^"]+)"/.exec(html)[1];
async function envoyer(chemin, champs, { origine = ORIGINE, csrf, site } = {}) {
  const html = await (await ouvrir()).text();
  const corps = new URLSearchParams({ csrf: csrf ?? csrfDe(html), ev: "EV-2026-0010", ...champs });
  const headers = { "Cf-Access-Jwt-Assertion": await jwt(), "Content-Type": "application/x-www-form-urlencoded", ...(origine ? { Origin: origine } : {}), ...(site ? { "Sec-Fetch-Site": site } : {}) };
  return silence(() => worker.fetch(new Request(`${ORIGINE}${chemin}`, { method: "POST", headers, body: corps }), env));
}
const bandeau = r => decodeURIComponent(new URL(r.headers.get("Location"), ORIGINE).searchParams.get("m") || "");

test("Accès : sans jeton Access, jeton d'une autre équipe ou d'une autre application, e-mail non autorisé, jeton expiré → 403", async () => {
  assert.equal((await ouvrir({ jeton: null })).status, 403);
  assert.equal((await ouvrir({ jeton: await jwt({ cle: intrus.privateKey }) })).status, 403, "signature d'une autre clé");
  assert.equal((await ouvrir({ jeton: await jwt({ aud: ["autre-app"] }) })).status, 403);
  assert.equal((await ouvrir({ jeton: await jwt({ iss: "https://pirate.cloudflareaccess.com" }) })).status, 403);
  assert.equal((await ouvrir({ jeton: await jwt({ email: "autre@gmail.com" }) })).status, 403);
  assert.equal((await ouvrir({ jeton: await jwt({ exp: Date.now() / 1000 - 10 }) })).status, 403);
  assert.equal((await ouvrir({ e: { ...env, ACCESS_AUD: "" } })).status, 403, "Access non configuré : fermé à tous");
  assert.equal((await ouvrir({ hote: "evarysth-admin.autre.workers.dev" })).status, 404, "autre nom d'hôte");
  assert.equal((await ouvrir()).status, 200, "e-mail autorisé (casse indifférente)");
});

test("Adresse publique : /admin n'existe pas, même avec un jeton Access valide", async () => {
  const r = await silence(async () => worker.fetch(new Request("https://public.dev/admin", { headers: { "Cf-Access-Jwt-Assertion": await jwt() } }), env));
  assert.equal(r.status, 404);
});

test("Worker d'administration : relais pur vers le Worker public (requête transmise telle quelle), 503 sans liaison", async () => {
  const recues = [];
  const relais = { ROLE: "admin", PUBLIC: { fetch: async r => { recues.push(r); return new Response("ok"); } } };
  const req = new Request(`${ORIGINE}/admin`, { headers: { "Cf-Access-Jwt-Assertion": "jwt" } });
  assert.equal(await (await worker.fetch(req, relais)).text(), "ok");
  assert.equal(recues[0], req, "même requête : adresse et jeton Access conservés");
  assert.equal((await worker.fetch(new Request(`${ORIGINE}/admin`), { ROLE: "admin" })).status, 503);
});

test("Page : commandes à valider, sans script, en-têtes de sécurité, adresse complète non affichée", async () => {
  const r = await ouvrir();
  const html = await r.text();
  assert.match(r.headers.get("Content-Security-Policy"), /default-src 'none'.*frame-ancestors 'none'/);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /1 commande à valider/);
  assert.match(html, /EV-2026-0010/);
  assert.match(html, /Camille Test · 75011 Paris/);
  assert.doesNotMatch(html, /rue des Lilas|client@example\.com/);
  assert.match(html, /Lien STL à indiquer/);
  assert.match(html, /name="fab_1"[\s\S]*Atelier Dupont/);
  assert.match(html, /action="\/admin\/valider"/);
});

test("Valider : refusé sans lien STL ni fabricant valide, rien n'est écrit ; puis validé → e-mail fabricant immédiat, Journal, n° CF", async () => {
  let r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "" });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /Article 1 : indiquez le lien du fichier STL/);
  r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "javascript:alert(1)" });
  assert.match(await r.text(), /adresse https:\/\/ complète/);
  r = await envoyer("/admin/valider", { fab_1: "Sans Mail", stl_1: "https://drive.google.com/a" });
  assert.match(await r.text(), /n&#39;a pas d&#39;e-mail/);
  r = await envoyer("/admin/valider", { fab_1: "", fab_2: "" });
  assert.match(await r.text(), /Choisissez le fabricant/);
  assert.equal(art(1).Statut, "lien_stl_a_indiquer");
  assert.equal(emails.length, 0);

  r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: "" });
  assert.equal(r.status, 303);
  assert.match(bandeau(r), /CF-2026-0010-A envoyée à Atelier Dupont ✓.*1 article laissé pour plus tard/);
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"], art(1)["Commande CF"], art(1).Fabricant, art(1)["Lien STL"]],
    ["envoyee_fabricant", "envoyee_fabricant", "CF-2026-0010-A", FAB, "https://drive.google.com/file/d/sm/view"]);
  assert.equal(art(2).Statut, "lien_stl_a_indiquer", "article non choisi : inchangé");
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to[0].email, "atelier@example.com");
  assert.match(emails[0].textContent, /Fichier STL : https:\/\/drive\.google\.com\/file\/d\/sm\/view/);
  assert.match(emails[0].textContent, /https:\/\/public\.dev\/f\//, "liens fournisseur vers le Worker public");
  assert.deepEqual(sheet.Journal.slice(1).map(l => l.slice(1)), [["CF-2026-0010-A", "lien_stl_a_indiquer", "envoyee_fabricant", "proprietaire"]]);

  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b.notifiees, [], "rien à renvoyer par la tâche planifiée");
});

test("Double clic : le 2e envoi ne renvoie rien (« déjà validée »)", async () => {
  sheet["Commandes CF"].splice(2, 1);
  const champs = { fab_1: FAB, stl_1: "https://drive.google.com/x" };
  const html = await (await ouvrir()).text();
  const csrf = csrfDe(html);
  assert.equal((await envoyer("/admin/valider", champs, { csrf })).status, 303);
  const r = await envoyer("/admin/valider", champs, { csrf });
  assert.match(bandeau(r), /déjà validée/);
  assert.equal(emails.length, 1);
});

test("Requêtes étrangères : sans Origin, autre Origin, jeton anti-falsification faux → rien n'est fait", async () => {
  const champs = { fab_1: FAB, stl_1: "https://drive.google.com/x" };
  assert.equal((await envoyer("/admin/valider", champs, { origine: null })).status, 403);
  assert.equal((await envoyer("/admin/valider", champs, { origine: "https://pirate.example" })).status, 403);
  assert.equal((await envoyer("/admin/valider", champs, { origine: "null" })).status, 403, "Origin null sans Sec-Fetch-Site");
  assert.equal((await envoyer("/admin/valider", champs, { site: "cross-site" })).status, 403);
  const r = await envoyer("/admin/valider", champs, { csrf: "9999999999.faux" });
  assert.match(bandeau(r), /Page expirée/);
  assert.equal(art(1).Statut, "lien_stl_a_indiquer");
  assert.equal(emails.length, 0);
});

test("Safari : Origin « null » mais Sec-Fetch-Site same-origin → accepté", async () => {
  const r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/x" }, { origine: "null", site: "same-origin" });
  assert.equal(r.status, 303);
  assert.equal(art(1).Statut, "envoyee_fabricant");
});

test("Brevo en panne : validée, e-mail en attente, la tâche planifiée l'envoie ensuite", async () => {
  brevoEnPanne = true;
  const r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/x" });
  assert.match(bandeau(r), /e-mail en attente/);
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"]], ["envoyee_fabricant", "lien_stl_a_indiquer"]);
  brevoEnPanne = false;
  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual(b.notifiees, ["CF-2026-0010-A : envoyee_fabricant"]);
  assert.equal(emails.length, 1);
});

test("Bloquer puis débloquer : incident, puis retour à lien_stl_a_indiquer ; jamais d'e-mail", async () => {
  let r = await envoyer("/admin/bloquer", {});
  assert.match(bandeau(r), /bloquée \(2 articles\)/);
  assert.deepEqual([art(1).Statut, art(2).Statut], ["incident", "incident"]);
  assert.match(await (await ouvrir()).text(), /Bloquées[\s\S]*Débloquer/);
  r = await envoyer("/admin/debloquer", {});
  assert.match(bandeau(r), /débloquée/);
  assert.deepEqual([art(1).Statut, art(2).Statut], ["lien_stl_a_indiquer", "lien_stl_a_indiquer"]);
  assert.equal(emails.length, 0);
});

test("lienValide : https seulement", () => {
  assert.equal(lienValide(""), "");
  assert.equal(lienValide("https://drive.google.com/a b"), "https://drive.google.com/a%20b");
  for (const x of ["http://drive.google.com/a", "javascript:alert(1)", "ftp://x.y/z", "https://localhost/x", "x".repeat(600)]) assert.equal(lienValide(x), null, x);
});

const vue = async (v, e = env) => silence(async () => worker.fetch(new Request(`${ORIGINE}/admin?vue=${v}`, { headers: { "Cf-Access-Jwt-Assertion": await jwt() } }), e));

test("Onglets : menu sur chaque vue, sans script ; vue inconnue → Commandes", async () => {
  for (const v of ["tableau", "catalogue", "systeme", "liens", "inconnue"]) {
    const r = await vue(v), html = await r.text();
    assert.equal(r.status, 200, v);
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /<nav[\s\S]*Tableau de bord[\s\S]*Catalogue[\s\S]*Système[\s\S]*Liens/);
    assert.match(html, new RegExp(`href="${v === "inconnue" ? "/admin" : `/admin\\?vue=${v}`}" aria-current="page"`), v);
  }
});

test("Tableau de bord : compteurs et alerte « sans fabricant depuis plus de 24 h »", async () => {
  sheet["Commandes EV"][1][1] = "2026-01-01 10:00";
  const html = await (await vue("tableau")).text();
  assert.match(html, /<div class="nombre">1<\/div><div class="muted">à valider/);
  assert.match(html, /<div class="nombre">0<\/div><div class="muted">bloquées/);
  assert.match(html, /EV-2026-0010[\s\S]*toujours sans fabricant/);
});

test("Liens : Sheet construit depuis SHEET_ID, site en mode test ; sans secret Google, Liens et Système restent visibles", async () => {
  const html = await (await vue("liens")).text();
  assert.match(html, /docs\.google\.com\/spreadsheets\/d\/id-factice\/edit/);
  assert.match(html, /evarysth\.fr\/\?checkout=test/);
  const sans = { ...env, SHEET_ID: "" };
  assert.doesNotMatch(await (await vue("liens", sans)).text(), /docs\.google/);
  assert.equal((await vue("systeme", sans)).status, 200);
  assert.equal((await vue("tableau", sans)).status, 503);
});

test("Catalogue : STL présent / manquant par taille standard (une liste R2), sans R2 : signalé", async () => {
  const STL = { head: async () => null, list: async () => ({ objects: [{ key: "crochet-balcon/m.stl" }], truncated: false }) };
  const html = await (await vue("catalogue", { ...env, STL })).text();
  assert.match(html, /Crochet de balcon[\s\S]*?>S <[\s\S]*?STL manquant[\s\S]*?>M <[\s\S]*?STL présent/);
  assert.match(html, /produits\/crochet-balcon\//);
  assert.match(html, /<details><summary><span class="nom">Crochet de balcon<\/span><span class="badge manque">STL 1\/3<\/span><span class="resume">12 €<\/span><\/summary>/, "une ligne repliée");
  assert.doesNotMatch(html, /<details open/);
  assert.match(await (await vue("catalogue")).text(), /Binding R2 « STL » absent/);
});

test("Système : voyants sans valeur de secret ; « Lancer la tâche » protégé, puis heure du dernier passage notée", async () => {
  let html = await (await vue("systeme")).text();
  assert.match(html, /aucun passage noté/);
  assert.match(html, /binding STL absent/);
  assert.match(html, /mode test[\s\S]*clé Stripe absente/);
  assert.doesNotMatch(html, /secret-de-test|xkeysib/);
  assert.match(html, /action="\/admin\/tache"/);
  const r0 = await envoyer("/admin/tache", {}, { origine: "https://pirate.dev" });
  assert.equal(r0.status, 403);
  assert.equal(meta, null, "requête étrangère : rien lancé");
  const r = await envoyer("/admin/tache", {});
  assert.equal(r.status, 303);
  assert.match(r.headers.get("Location"), /vue=systeme/);
  assert.match(bandeau(r), /Tâche faite/);
  assert.ok(JSON.parse(meta).t > 0);
  html = await (await vue("systeme")).text();
  assert.doesNotMatch(html, /aucun passage noté/);
  await envoyer("/admin/tache", {});
  assert.ok(JSON.parse(meta).t > 0, "2e passage : mise à jour");
});

test("/maj n'existe plus", async () => {
  const r = await silence(() => worker.fetch(new Request("https://public.dev/maj", { method: "POST" }), env));
  assert.equal(r.status, 404);
});

/* ---------- Lot 2 ---------- */
import { readFileSync } from "node:fs";
import { signature } from "../src/jeton.js";
import { ICONES } from "../src/icones.js";
import { masquerEmail } from "../src/admin.js";

const get = async (chemin, headers = {}) => silence(async () => worker.fetch(new Request(ORIGINE + chemin, { headers: { "Cf-Access-Jwt-Assertion": await jwt(), ...headers } }), env));

test("Bandeau : signé, affiché une seule fois (cookie), ignoré s'il est forgé ou a plus de 2 min ; Actualiser sans paramètres", async () => {
  const r = await envoyer("/admin/bloquer", {});
  const loc = r.headers.get("Location");
  assert.match(loc, /[?&]ts=\d+&s=/);
  const r1 = await get(loc), html1 = await r1.text();
  assert.match(html1, /class="bandeau ok"[^>]*>Commande EV-2026-0010 bloquée/);
  const cookie = r1.headers.get("Set-Cookie");
  assert.match(cookie, /^admin_flash=[^;]+; Path=\/admin; Max-Age=120; HttpOnly; Secure; SameSite=Strict$/);
  assert.match(html1, /<a href="\/admin">Actualiser<\/a>/);
  const r2 = await get(loc, { Cookie: cookie.split(";")[0] });
  assert.doesNotMatch(await r2.text(), /class="bandeau/, "rechargement : plus de bandeau");
  const u = new URL(loc, ORIGINE);
  u.searchParams.set("m", "Message inventé");
  assert.doesNotMatch(await (await get(u.pathname + u.search)).text(), /Message inventé/, "message modifié : signature fausse");
  assert.doesNotMatch(await (await get("/admin?m=Pirate&t=ok")).text(), /Pirate/, "sans signature");
  const ts = String(Math.floor(Date.now() / 1000) - 121), m = "Trop vieux";
  const s = await signature(env.HMAC_SECRET, `flash||ok|${ts}|${m}`);
  assert.doesNotMatch(await (await get(`/admin?${new URLSearchParams({ m, t: "ok", ts, s })}`)).text(), /Trop vieux/, "plus de 2 min");
  const ts2 = String(Math.floor(Date.now() / 1000)), s2 = await signature(env.HMAC_SECRET, `flash||ok|${ts2}|Récent`);
  assert.match(await (await get(`/admin?${new URLSearchParams({ m: "Récent", t: "ok", ts: ts2, s: s2 })}`)).text(), /Récent/, "signé et récent");
});

test("Icônes : servies par le Worker (identiques aux fichiers du dépôt), balises, manifeste, CSP au strict nécessaire", async () => {
  for (const nom of Object.keys(ICONES))
    assert.equal(Buffer.from(ICONES[nom].b64, "base64").compare(readFileSync(new URL(`../../assets/icons/${nom}`, import.meta.url))), 0, `${nom} à jour (node tools/icones-admin.mjs)`);
  const r = await get("/admin/apple-touch-icon.png");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "image/png");
  assert.equal(Buffer.from(await r.arrayBuffer()).compare(readFileSync(new URL("../../assets/icons/apple-touch-icon.png", import.meta.url))), 0);
  assert.equal((await get("/admin/favicon.svg")).headers.get("Content-Type"), "image/svg+xml");
  const man = await (await get("/admin/manifest.webmanifest")).json();
  assert.equal(man.name, "Evarysth admin");
  assert.equal(man.icons[0].src, "/admin/favicon-192.png");
  assert.equal((await get("/admin/favicon-192.png")).status, 200);
  assert.equal((await get("/admin/inconnu.png")).status, 404);
  const p = await get("/admin"), html = await p.text();
  assert.match(html, /<link rel="icon" href="\/admin\/favicon\.svg"/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/admin\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="manifest" href="\/admin\/manifest\.webmanifest"/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Evarysth admin">/);
  assert.equal(p.headers.get("Content-Security-Policy"), "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  const pub = await silence(() => worker.fetch(new Request("https://public.dev/admin/favicon.svg"), env));
  assert.equal(pub.status, 404, "pas sur l'adresse publique");
});

test("Recherche : par n° EV, n° CF ou nom (sans accents) → fiche avec articles et Journal, ville seulement, texte échappé", async () => {
  sheet["Commandes CF"][1][COL_CF["Commande CF"]] = "CF-2026-0010-A";
  sheet["Commandes CF"][1][COL_CF.Fabricant] = FAB;
  sheet["Commandes CF"][1][COL_CF.Transporteur] = "Colissimo";
  sheet["Commandes CF"][1][COL_CF["N° de suivi"]] = "6A123";
  sheet["Commandes CF"][1][COL_CF["Lien STL"]] = "https://drive.google.com/fichier";
  sheet.Journal.push(["2026-11-08 10:00", "EV-2026-0010", "", "payee", "worker"], ["2026-11-08 11:00", "CF-2026-0010-A", "a_valider", "envoyee_fabricant", "proprietaire"]);
  for (const q of ["EV-2026-0010", "cf-2026-0010-a", "camille", "CAMÍLLE TEST"]) {
    const html = await (await get(`/admin?q=${encodeURIComponent(q)}`)).text();
    assert.match(html, /<h1>EV-2026-0010<\/h1>/, q);
    assert.match(html, /Camille Test · 75011 Paris/);
    assert.doesNotMatch(html, /rue des Lilas|client@example\.com/);
    assert.match(html, /Article 1 · <b>CF-2026-0010-A<\/b>[\s\S]*Atelier Dupont[\s\S]*drive\.google\.com\/fichier[\s\S]*Colissimo · 6A123/);
    assert.match(html, /Historique[\s\S]*EV-2026-0010<\/b> · Payée<br>[\s\S]*CF-2026-0010-A<\/b> · À valider → Envoyée au fabricant[\s\S]*proprietaire/);
    assert.doesNotMatch(html, /<form method="post"/, "lecture seule");
  }
  const vide = await (await get(`/admin?q=${encodeURIComponent('<script>x</script>')}`)).text();
  assert.match(vide, /Aucune commande/);
  assert.doesNotMatch(vide, /<script>/);
  assert.match(vide, /&lt;script&gt;/);
  assert.match(await (await get("/admin")).text(), /<form method="get" action="\/admin" role="search"/);
});

test("Fabricants : e-mail masqué, CF en cours et en retard (délai dépassé d'après le Journal)", async () => {
  assert.equal(masquerEmail("atelier@example.com"), "a•••@example.com");
  assert.equal(masquerEmail(""), "—");
  const cf = sheet["Commandes CF"];
  Object.assign(cf[1], { [COL_CF["Commande CF"]]: "CF-2026-0010-A", [COL_CF.Fabricant]: FAB, [COL_CF.Statut]: "envoyee_fabricant", [COL_CF["Dernier statut notifié"]]: "envoyee_fabricant" });
  Object.assign(cf[2], { [COL_CF["Commande CF"]]: "CF-2026-0010-B", [COL_CF.Fabricant]: FAB, [COL_CF.Statut]: "acceptee", [COL_CF["Dernier statut notifié"]]: "acceptee" });
  sheet.Journal.push(["2026-01-01 10:00", "CF-2026-0010-A", "a_valider", "envoyee_fabricant", "proprietaire"],
    [new Date(Date.now() - 3600_000).toISOString().slice(0, 16).replace("T", " "), "CF-2026-0010-B", "a_valider", "envoyee_fabricant", "proprietaire"]);
  const html = await (await get("/admin?vue=fabricants")).text();
  assert.match(html, /<h1>2 fabricants<\/h1>/);
  assert.match(html, /Atelier Dupont[\s\S]*1 en retard[\s\S]*a•••@example\.com[\s\S]*5 j[\s\S]*Livre le client<\/span><span>non[\s\S]*En cours<\/span><span>2[\s\S]*En retard<\/span><span>1[\s\S]*CF-2026-0010-A/);
  assert.doesNotMatch(html, /atelier@example\.com/);
  assert.match(html, /<summary><span class="nom">Atelier Dupont<\/span><span class="badge manque">1 en retard<\/span><\/summary>/);
  assert.match(html, /<summary><span class="nom">Sans Mail<\/span><span class="resume">0 en cours<\/span><\/summary>/);
  assert.doesNotMatch(html, /<form method="post"/);
});
