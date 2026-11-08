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

let sheet, emails, brevoEnPanne;
beforeEach(() => {
  viderCacheJeton(); viderCacheAcces();
  brevoEnPanne = false; emails = [];
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
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
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
