/* Page d'administration (/admin) : accès Cloudflare Access revérifié, point de verrou, validation → e-mail fabricant
   immédiat, double clic, requêtes étrangères, blocage. Google Sheets, Brevo et Access simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { viderCacheJeton, reglerAttentes } from "../src/google.js";
reglerAttentes([0, 0]); /* nouveaux essais sans attente dans les tests */
import { viderCacheAcces } from "../src/acces.js";
import { lienValide } from "../src/admin.js";
import { tachePlanifiee } from "../src/planifie.js";
import { COL_CF, ENTETES_CF, ENTETES_EV, objet, appliquerFormules } from "./entetes.mjs";
import { fauxBucket } from "./r2.mjs";

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
const plage = a1 => { const [, o, ref = ""] = /^'(.+?)'(?:!(.+))?$/.exec(a1); return { onglet: o.replace(/''/g, "'"), ref }; };
async function fauxFetch(url, init = {}) {
  const u = new URL(url), rep = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (u.host === "equipe.cloudflareaccess.com" && u.pathname === "/cdn-cgi/access/certs") return rep({ keys: [JWK] });
  if (u.host === "oauth2.googleapis.com") return rep({ access_token: "ya29.test", expires_in: 3599 });
  if (u.host === "api.brevo.com" && u.pathname === "/v3/account") return rep({ email: "x" });
  if (u.host === "api.umami.is") return umami(u, init, rep);
  if (u.host === "api.brevo.com") { if (brevoEnPanne) return rep({ message: "panne" }, 500); emails.push(JSON.parse(init.body)); return rep({ messageId: "m" }, 201); }
  if (u.host !== "sheets.googleapis.com") throw new Error("Appel réseau inattendu : " + url);
  if (u.pathname === "/v4/spreadsheets/id-factice:batchUpdate") {
    for (const r of JSON.parse(init.body).requests) {
      if (r.updateDeveloperMetadata) { if (!meta) return rep({ error: { message: "introuvable" } }, 400); meta = r.updateDeveloperMetadata.developerMetadata.metadataValue; return rep({ replies: [{ updateDeveloperMetadata: { developerMetadata: [{}] } }] }); }
      if (r.createDeveloperMetadata) { meta = r.createDeveloperMetadata.developerMetadata.metadataValue; return rep({ replies: [{}] }); }
    }
  }
  if (u.pathname === "/v4/spreadsheets/id-factice") return rep({ sheets: Object.keys(sheet).map(title => ({ properties: { title } })) });   /* liste des onglets */
  const chemin = decodeURIComponent(u.pathname.replace("/v4/spreadsheets/id-factice/", ""));
  if (chemin.startsWith("developerMetadata/")) return meta ? rep({ metadataValue: meta }) : rep({ error: { message: "introuvable" } }, 404);
  if (chemin === "values:batchGet") { appliquerFormules(sheet); return rep({ valueRanges: u.searchParams.getAll("ranges").map(r => {
    const { onglet, ref } = plage(r);
    if (ref === "1:1") return { range: r, values: [sheet[onglet][0]] };
    if (ref === "") return { range: r, values: sheet[onglet].map(l => Array.from(l, c => c ?? "")) };        /* onglet entier (sauvegarde) */
    if (ref === "1:3") return { range: r, values: sheet[onglet].slice(0, 3).map(l => Array.from(l, c => c ?? "")) };
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
const art = n => objet(ENTETES_CF, sheet["Commandes CF"][n]);

async function ouvrir({ jeton, hote = HOTE, e = env } = {}) {
  const headers = jeton === null ? {} : { "Cf-Access-Jwt-Assertion": jeton || await jwt() };
  return silence(() => worker.fetch(new Request(`https://${hote}/admin`, { headers }), e));
}
const csrfDe = html => /name="csrf" value="([^"]+)"/.exec(html)[1];
async function envoyer(chemin, champs, { origine = ORIGINE, csrf, site } = {}) {
  const html = await (await get("/admin?q=EV-2026-0010")).text();   /* jeton de la fiche, où sont les actions */
  const corps = new URLSearchParams({ csrf: csrf ?? csrfDe(html), ev: "EV-2026-0010" });
  for (const [k, v] of Object.entries(champs)) for (const x of [v].flat()) corps.append(k, x);   /* tableau : plusieurs valeurs (cases) */
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
  assert.doesNotMatch(html, /<h1>/, "filtre actif : pas de titre");
  assert.match(html, /<nav class="filtres" aria-label="Filtres"><a href="\/admin" aria-current="page">À traiter/);
  assert.match(html, /À traiter <span class="compte">1<\/span>[\s\S]*Toutes <span class="compte">1<\/span>/);
  assert.match(html, /<a class="cmd bord t-att" href="\/admin\?q=EV-2026-0010"><span class="tete"><b>EV-2026-0010<\/b><span class="badge t-att">À valider/, "badge : ce qui attend le propriétaire");
  assert.match(html, /Camille Test · 75011 Paris · 8 nov\. 2026 · 2 articles/);
  assert.doesNotMatch(html, /2 à valider|sur 2 à valider/, "tous à valider : le badge suffit");
  assert.doesNotMatch(html, /rue des Lilas|client@example\.com/);
  assert.doesNotMatch(html, /<form method="post"/, "liste : aucune action, on ouvre la fiche");
  const fiche = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(fiche, /À valider <span class="compte">2<\/span>[\s\S]*Lien STL à indiquer[\s\S]*name="fab_1"[\s\S]*Atelier Dupont/);
  assert.match(fiche, /action="\/admin\/valider"/);
  assert.match(fiche, /<details class="carte pli zone">[\s\S]*action="\/admin\/bloquer"/, "actions définitives repliées");
  assert.doesNotMatch(fiche, /rue des Lilas|client@example\.com|<script/i);
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
  const csrf = csrfDe(await (await get("/admin?q=EV-2026-0010")).text());
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
  assert.match(await (await get("/admin?f=bloquees")).text(), /Bloquées <span class="compte">1<\/span>[\s\S]*2 bloqués/);
  assert.match(await (await get("/admin?q=EV-2026-0010")).text(), /Bloqués <span class="compte">2<\/span>[\s\S]*Débloquer/);
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

/* Umami simulé (format récent : valeurs seules, mesures { x, y }, type « path ») ; umamiPanne = statut renvoyé à tout appel */
let umamiPanne = 0, umamiAppels = [];
function umami(u, init, rep) {
  umamiAppels.push(u.pathname + u.search);
  if (init.headers["x-umami-api-key"] !== "cle-umami") return rep({ error: "Unauthorized" }, 401);
  if (umamiPanne) return rep({ error: "panne" }, umamiPanne);
  const p = u.pathname.replace(/^\/v1\/websites\/[^/]+/, ""), t = u.searchParams.get("type");
  const ancien = Number(u.searchParams.get("endAt")) < Date.now() - 86400_000;
  if (p === "/stats") return rep(ancien ? { pageviews: 100, visitors: 40, visits: 50, bounces: 25, totaltime: 3000 }
    : { pageviews: 150, visitors: 60, visits: 75, bounces: 30, totaltime: 9000 });
  if (p === "/pageviews") return rep({ pageviews: [{ x: "2026-11-10 00:00:00", y: 20 }], sessions: [{ x: "2026-11-10 00:00:00", y: 8 }] });
  if (p === "/metrics" && t === "path") return rep([{ x: "/", y: 40 }, { x: "/produits/pince-sac-verseur/", y: 30 }, { x: "/produits/pince-sac-verseur/#vue", y: 5 }, { x: "/catalogue/", y: 12 }, { x: "/produits/cintre-sac/", y: 10 }]);
  if (p === "/metrics" && t === "referrer") return rep([{ x: "www.google.com", y: 9 }, { x: "pinterest.fr", y: 3 }]);
  if (p === "/metrics" && t === "device") return rep([{ x: "mobile", y: 50 }, { x: "desktop", y: 25 }]);
  if (p === "/metrics" && t === "country") return rep([{ x: "FR", y: 70 }, { x: "BE", y: 5 }]);
  if (p === "/metrics" && t === "event") return rep([{ x: "Ajout panier", y: 7 }]);
  if (p === "/event-data/values") return rep([{ value: "pince-sac-verseur", total: 5 }, { value: "cintre-sac", total: 2 }]);
  if (p === "/active") return rep({ visitors: 2 });
  return rep({ error: "inconnu" }, 404);
}

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
  assert.match(html, /<details><summary><span class="nom">Crochet de balcon<\/span><span class="badge manque">STL 1\/3<\/span><span class="resume">dès 13 €<\/span><\/summary>/, "une ligne repliée");
  assert.doesNotMatch(html, /<details open/);
  /* Décomposition du prix (docs/prix.md) sous chaque taille ; ASA = filière externe, prix provisoire */
  assert.match(html, /Crochet de balcon[\s\S]*?S <[\s\S]*?Mat 0,76 \+ Mach 0,38 \+ Vm 0,55 \+ MO 2,49 \+ emballage 0,30 \+ fixes 4,00 \+ lancement 2,00 \+ prélèvements 1,83 = 12,31 € → 13 € · provisoire \(devis à venir\)/);
  assert.doesNotMatch(html, /supplément|plancher/);
  assert.match(await (await vue("catalogue")).text(), /Binding R2 « STL » absent/);
});

test("Catalogue : la pastille « STL présent » télécharge le fichier via /admin/stl (derrière Access, clé standard seulement)", async () => {
  const octets = new TextEncoder().encode("solid x\nendsolid\n");
  const STL = { head: async k => k === "crochet-balcon/m.stl" ? { size: octets.length } : null,
    get: async k => k === "crochet-balcon/m.stl" ? { size: octets.length, body: new Blob([octets]).stream() } : null,
    list: async () => ({ objects: [{ key: "crochet-balcon/m.stl" }], truncated: false }) };
  const e = { ...env, STL };
  assert.match(await (await vue("catalogue", e)).text(), /<a class="badge present" href="\/admin\/stl\?cle=crochet-balcon%2Fm\.stl" download/);
  const telecharger = async (cle, jeton = true) => silence(async () => worker.fetch(new Request(`${ORIGINE}/admin/stl?cle=${encodeURIComponent(cle)}`,
    { headers: jeton ? { "Cf-Access-Jwt-Assertion": await jwt() } : {} }), e));
  const r = await telecharger("crochet-balcon/m.stl");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Disposition"), /attachment; filename="crochet-balcon-m\.stl"/);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), octets);
  assert.equal((await telecharger("crochet-balcon/s.stl")).status, 404, "absent");
  assert.equal((await telecharger("commandes/CF-2026-0001-1/0123456789ab/a.stl")).status, 404, "fichiers de commande : pas par cette route");
  assert.equal((await telecharger("../x.stl")).status, 404);
  assert.equal((await telecharger("crochet-balcon/m.stl", false)).status, 403, "sans Access");
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

test("Système : maintien Brevo, sauvegarde du Sheet et pause des ventes pilotés depuis /admin (R2 simulé)", async () => {
  env.STL = fauxBucket();
  try {
    let html = await (await vue("systeme")).text();
    assert.match(html, /pas encore d&#39;appel de maintien/);
    assert.match(html, /pas encore de sauvegarde/);
    assert.match(html, /mode test \(fermées au public\)/);
    assert.doesNotMatch(html, /sauvegarde\.zip/, "rien à télécharger avant la première sauvegarde");
    assert.equal((await get("/admin/sauvegarde.zip")).status, 404);
    assert.equal((await silence(() => worker.fetch(new Request(`${ORIGINE}/admin/sauvegarde.zip`), env))).status, 403, "sans jeton Access : refusé");

    /* Sauvegarde à la demande : protégée (Origin), puis voyant vert et archive téléchargeable */
    assert.equal((await envoyer("/admin/sauvegarde", {}, { origine: "https://pirate.dev" })).status, 403);
    assert.equal([...env.STL.m.keys()].filter(k => k.startsWith("sauvegardes/")).length, 0, "requête étrangère : rien sauvegardé");
    const r = await envoyer("/admin/sauvegarde", {});
    assert.equal(r.status, 303);
    assert.match(bandeau(r), /Sauvegarde faite ✓ \(4 onglets/);
    html = await (await vue("systeme")).text();
    assert.match(html, /voyant v-ok"><\/span>Sauvegarde du Sheet/);
    assert.match(html, /href="\/admin\/sauvegarde\.zip"/);
    const z = await get("/admin/sauvegarde.zip");
    assert.equal(z.headers.get("Content-Type"), "application/zip");
    assert.match(z.headers.get("Content-Disposition"), /evarysth-\d{4}-\d{2}-\d{2}\.zip/);
    assert.equal(z.headers.get("Cache-Control"), "no-store");
    assert.ok(Buffer.from(await z.arrayBuffer()).toString("latin1").includes("Commandes-EV.csv"));

    /* Pause des ventes : message libre, voyant orange, puis réouverture */
    assert.equal((await envoyer("/admin/pause", { etat: "pause" }, { origine: "https://pirate.dev" })).status, 403);
    assert.equal(env.STL.m.has("systeme/pause.json"), false);
    const p = await envoyer("/admin/pause", { etat: "pause", message: "Vacances jusqu'au 20 novembre <b>" });
    assert.match(bandeau(p), /Ventes en pause/);
    assert.equal(JSON.parse(env.STL.m.get("systeme/pause.json")).message, "Vacances jusqu'au 20 novembre <b>");
    html = await (await vue("systeme")).text();
    assert.match(html, /en pause depuis le/);
    assert.match(html, /Vacances jusqu&#39;au 20 novembre &lt;b&gt;/, "message échappé");
    assert.match(html, /Rouvrir les ventes/);
    const o = await envoyer("/admin/pause", { etat: "ouvrir" });
    assert.match(bandeau(o), /Ventes rouvertes/);
    html = await (await vue("systeme")).text();
    assert.doesNotMatch(html, /en pause depuis/);
    assert.match(html, /Mettre les ventes en pause/);

    /* « Lancer la tâche » fait aussi l'entretien du jour (clé Brevo) */
    assert.match(html, /pas encore d&#39;appel de maintien/);
    await envoyer("/admin/tache", {});
    html = await (await vue("systeme")).text();
    assert.match(html, /voyant v-ok"><\/span>Clé Brevo/);
  } finally { delete env.STL; }
});

test("Montants et coûts : pli « Montants » de la fiche, saisie des coûts par CF, marge TTC calculée ; valeurs invalides refusées", async () => {
  const hEV = sheet["Commandes EV"][0], hCF = sheet["Commandes CF"][0];
  hEV.push("Environnement", "Total TTC (€)", "dont livraison (€)", "Remise (€)", "Frais Stripe (€)");
  hCF.push("Coût fabricant (€)", "Frais d'envoi (€)");
  const iEV = n => hEV.indexOf(n), iCF = n => hCF.indexOf(n);
  Object.assign(sheet["Commandes EV"][1], { [iEV("Environnement")]: "test", [iEV("Total TTC (€)")]: "86,90 €", [iEV("dont livraison (€)")]: 4.9, [iEV("Frais Stripe (€)")]: "1,40 €" });
  for (const n of [1, 2]) Object.assign(sheet["Commandes CF"][n], { [COL_CF.Statut]: "acceptee", [COL_CF["Dernier statut notifié"]]: "acceptee", [COL_CF["Commande CF"]]: "CF-2026-0010-A", [COL_CF.Fabricant]: FAB });
  let html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /<span class="nom">Montants<\/span><span class="resume">marge à calculer<\/span>/);
  assert.match(html, /Total payé \(TTC\)<\/span><span>86,90 €/, "« 86,90 € » du Sheet relu comme un nombre");
  assert.match(html, /coût manquant : CF-2026-0010-A/);
  assert.match(html, /action="\/admin\/couts"/);

  /* Valeurs invalides : rien n'est écrit */
  const mauvais = await envoyer("/admin/couts", { cf: "CF-2026-0010-A", cout: "abc", envoi: "" });
  assert.match(bandeau(mauvais), /montants invalides/);
  assert.equal(sheet["Commandes CF"][1][iCF("Coût fabricant (€)")], undefined);
  assert.equal((await envoyer("/admin/couts", { cf: "CF-2026-0010-A", cout: "12", envoi: "" }, { origine: "https://pirate.dev" })).status, 403);
  assert.equal(sheet["Commandes CF"][1][iCF("Coût fabricant (€)")], undefined);

  /* Coûts valides : sur la première ligne de la CF seulement (2 articles, un seul montant) */
  sheet["Commandes CF"][2][iCF("Coût fabricant (€)")] = 99;
  const ok = await envoyer("/admin/couts", { cf: "CF-2026-0010-A", cout: "40,5", envoi: "4.9" });
  assert.match(bandeau(ok), /coûts enregistrés \(40,50 € · envoi 4,90 €\)/);
  assert.equal(sheet["Commandes CF"][1][iCF("Coût fabricant (€)")], 40.5);
  assert.equal(sheet["Commandes CF"][1][iCF("Frais d'envoi (€)")], 4.9);
  assert.equal(sheet["Commandes CF"][2][iCF("Coût fabricant (€)")], "", "ancien montant de la 2e ligne effacé");
  html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /<span class="nom">Montants<\/span><span class="resume">marge 40,10 €<\/span>/);
  assert.match(html, /<b>40,10 €<\/b>/);
  assert.match(html, /name="cout" [^>]*value="40,5"/);

  /* Sans colonnes de coûts dans le Sheet : pas de formulaire, message clair si on force la requête */
  hCF.splice(iCF("Coût fabricant (€)"), 2);
  html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.doesNotMatch(html, /action="\/admin\/couts"/);
  assert.match(html, /marge non calculée/);
  assert.match(bandeau(await envoyer("/admin/couts", { cf: "CF-2026-0010-A", cout: "1", envoi: "" })), /absentes de l'onglet Commandes CF/);
});

test("Tableau de bord : échéance légale, hors délai (même atelier / envoi manuel), à réexpédier, coût manquant et alertes système, sans e-mail", async () => {
  const jours = n => dateParis(new Date(Date.now() - n * 86400_000));
  const iEV = sheet["Commandes EV"][0], hCF = sheet["Commandes CF"][0];
  hCF.push("Coût fabricant (€)", "Frais d'envoi (€)");
  sheet["Commandes EV"][1][1] = jours(25);
  const cf = (n, statut, lettre) => Object.assign(sheet["Commandes CF"][n] || (sheet["Commandes CF"][n] = sheet["Commandes CF"][1].slice()), { [COL_CF.Statut]: statut, [COL_CF["Dernier statut notifié"]]: statut, [COL_CF["Commande CF"]]: `CF-2026-0010-${lettre}`, [COL_CF.Fabricant]: FAB, [COL_CF["Article n°"]]: String(n), [COL_CF["Commande EV"]]: "EV-2026-0010" });
  cf(1, "acceptee", "A"); cf(2, "a_reexpedier", "B"); cf(3, "expediee", "C");
  sheet.Journal.push([jours(8), "CF-2026-0010-A", "a_valider", "envoyee_fabricant", "proprietaire"], [jours(7), "CF-2026-0010-A", "envoyee_fabricant", "acceptee", "fabricant"],
    [jours(1), "CF-2026-0010-B", "acceptee", "a_reexpedier", "fabricant"]);
  const nombre = (html, texte) => new RegExp(`<div class="nombre">(\\d+)</div><div class="muted">${texte}`).exec(html)[1];
  const emailsAvant = emails.length;
  let html = await (await vue("tableau")).text();
  assert.equal(nombre(html, "à réexpédier"), "1");
  assert.equal(nombre(html, "hors délai"), "1");
  assert.match(html, /CF-2026-0010-A<\/b><\/a><br><span class="muted">Atelier Dupont : 8 j depuis l(?:'|&#39;)envoi, délai convenu 5 j<\/span>[\s\S]*Hors délai/);
  assert.match(html, /CF-2026-0010-B<\/b><\/a><br><span class="muted">pièce chez Evarysth, à contrôler puis réexpédier au client/);
  assert.match(html, /EV-2026-0010<\/b><\/a><br><span class="muted">échéance légale \(30 j\) dans 5 j · 2 articles pas encore partis · payée il y a 25 j/);
  assert.match(html, /CF-2026-0010-C<\/b><\/a><br><span class="muted">expédiée, coût du fabricant à saisir/);
  assert.equal(emails.length, emailsAvant, "aucun e-mail : tout reste dans le tableau de bord");

  /* Coût saisi → plus d'alerte ; échéance dépassée ; atelier interne : jamais d'alerte de coût */
  sheet["Commandes CF"][3][hCF.indexOf("Coût fabricant (€)")] = 30;
  sheet["Commandes EV"][1][1] = jours(31);
  html = await (await vue("tableau")).text();
  assert.doesNotMatch(html, /coût du fabricant à saisir/);
  assert.match(html, /échéance légale dépassée de 1 j/);
  assert.match(html, /Légal : dépassé/);

  /* Alertes système lues dans R2 */
  env.STL = fauxBucket({
    "systeme/pause.json": JSON.stringify({ active: true, message: "Vacances", depuis: "2026-11-09 10:00" }),
    "systeme/brevo.json": JSON.stringify({ t: Date.now(), ok: false, detail: "clé refusée (HTTP 401)" }),
    "systeme/sauvegarde.json": JSON.stringify({ t: Date.now(), ok: false, detail: "Sheets 500", tOk: Date.now() - 20 * 86400_000 })
  });
  try {
    html = await (await vue("tableau")).text();
    assert.match(html, /Ventes en pause<\/b><\/a><br><span class="muted">depuis le 2026-11-09 10:00 · « Vacances »/);
    assert.match(html, /Clé Brevo refusée[\s\S]*clé refusée \(HTTP 401\) : aucun e-mail ne partirait/);
    assert.match(html, /Sauvegarde du Sheet en échec/);
    env.STL.m.set("systeme/sauvegarde.json", JSON.stringify({ t: Date.now(), ok: true, tOk: Date.now() - 20 * 86400_000 }));
    html = await (await vue("tableau")).text();
    assert.match(html, /Sauvegarde du Sheet en retard/);
    env.STL.m.set("systeme/sauvegarde.json", JSON.stringify({ t: Date.now(), ok: true, tOk: Date.now() - 3600_000 }));
    env.STL.m.delete("systeme/pause.json"); env.STL.m.delete("systeme/brevo.json");
    html = await (await vue("tableau")).text();
    assert.doesNotMatch(html, /Ventes en pause|Clé Brevo refusée|Sauvegarde du Sheet/);
  } finally { delete env.STL; }
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
  assert.match(html1, /<a href="\/admin\?q=EV-2026-0010">Actualiser<\/a>/, "retour sur la fiche, Actualiser sans le bandeau");
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
    assert.match(html, /<b>Camille Test<\/b>[\s\S]*75011 Paris · 8 nov\. 2026 à 10:00/);
    assert.doesNotMatch(html, /rue des Lilas|client@example\.com/);
    assert.match(html, /<details class="carte pli bord t-att" open><summary><span class="nom">CF-2026-0010-A<br><span class="muted">Atelier Dupont · 1 article[\s\S]*Colissimo · 6A123[\s\S]*Article 1[\s\S]*drive\.google\.com\/fichier/);
    assert.match(html, /Historique[\s\S]*EV-2026-0010<\/b> · Payée<br>[\s\S]*CF-2026-0010-A<\/b> · À valider → Envoyée au fabricant[\s\S]*proprietaire/);
    assert.match(html, /href="https:\/\/dashboard\.stripe\.com\/test\/search\?query=cs_test_admin"/, "lien vers le paiement Stripe");
    assert.match(html, /Bloquer, annuler ou rembourser[\s\S]*action="\/admin\/cloturer"[\s\S]*value="annulee"[\s\S]*value="remboursee"/);
  }
  const vide = await (await get(`/admin?q=${encodeURIComponent('<script>x</script>')}`)).text();
  assert.match(vide, /<h1>Aucune commande<\/h1>/);
  assert.doesNotMatch(vide, /<script>/);
  assert.match(vide, /&lt;script&gt;/);
  const liste = await (await get("/admin")).text();
  assert.match(liste, /<form method="get" action="\/admin" role="search"[\s\S]*<label for="q" class="vh">Rechercher une commande<\/label>[\s\S]*name="q"[\s\S]*aria-label="Rechercher"/);
  assert.doesNotMatch(await (await get("/admin?q=EV-2026-0010")).text(), /role="search"/, "fiche : pas de recherche");
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

const fiche = async () => (await get(`/admin?q=EV-2026-0010`)).text();
const versFiche = r => new URL(r.headers.get("Location"), ORIGINE).searchParams.get("q");

test("Annuler : au moins un article coché et « Je confirme » ; puis articles annulés, Journal, aucun e-mail, plus rien à valider", async () => {
  let r = await envoyer("/admin/cloturer", { statut: "annulee", confirmer: "oui" });
  assert.match(bandeau(r), /Cochez au moins un article/);
  r = await envoyer("/admin/cloturer", { statut: "annulee", art: "1" });
  assert.match(bandeau(r), /Cochez « Je confirme »/);
  assert.equal(art(1).Statut, "lien_stl_a_indiquer");
  r = await envoyer("/admin/cloturer", { statut: "supprimee", art: "1", confirmer: "oui" });
  assert.match(bandeau(r), /Action inconnue/);
  assert.match(await fiche(), /name="art" value="1"> <span>Article 1 · boite-rugged[\s\S]*name="art" value="2">[\s\S]*Annuler les articles cochés/);
  r = await envoyer("/admin/cloturer", { statut: "annulee", art: ["1", "2"], confirmer: "oui" });
  assert.equal(versFiche(r), "EV-2026-0010", "retour sur la fiche");
  assert.match(bandeau(r), /2 articles annulés \(1, 2\)/);
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"], art(2).Statut], ["annulee", "annulee", "annulee"]);
  assert.deepEqual(sheet.Journal.slice(1).map(l => l.slice(1)), [["EV-2026-0010", "lien_stl_a_indiquer", "annulee", "proprietaire"]]);
  assert.match(await (await ouvrir()).text(), /Rien à traiter/);
  assert.doesNotMatch(await fiche(), /action="\/admin\/cloturer"/, "plus aucune action une fois close");
  const b = await silence(() => tachePlanifiee(env));
  assert.equal(emails.length, 0);
  assert.deepEqual(b.notifiees, []);
});

test("Un seul article : annulé ou remboursé sans toucher aux autres ; expédié : seulement « remboursé » ; rappel du fabricant", async () => {
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/x" });
  let r = await envoyer("/admin/cloturer", { statut: "annulee", art: "1", confirmer: "oui" });
  assert.match(bandeau(r), /1 article annulé \(1\).*Prévenez le fabricant : CF-2026-0010-A \(Atelier Dupont\)/);
  assert.deepEqual([art(1).Statut, art(2).Statut], ["annulee", "lien_stl_a_indiquer"], "l'autre article continue");

  sheet["Commandes CF"][2][COL_CF.Statut] = sheet["Commandes CF"][2][COL_CF["Dernier statut notifié"]] = "expediee";
  sheet["Commandes CF"][2][COL_CF["Commande CF"]] = "CF-2026-0010-B";
  r = await envoyer("/admin/cloturer", { statut: "annulee", art: "2", confirmer: "oui" });
  assert.match(bandeau(r), /Article 2 : déjà expédié.*marqué remboursé.*Rien n'a été modifié/);
  assert.equal(art(2).Statut, "expediee");
  assert.doesNotMatch(await fiche(), /value="annulee"/);
  r = await envoyer("/admin/cloturer", { statut: "remboursee", art: "2", confirmer: "oui" });
  assert.match(bandeau(r), /1 article marqué remboursé \(2\)/);
  assert.deepEqual([art(1).Statut, art(2).Statut], ["annulee", "remboursee"]);
  assert.doesNotMatch(await fiche(), /action="\/admin\/cloturer"/, "tout est clos : plus de formulaire");
});

test("Renvoyer : e-mail fabricant renvoyé sans changer le statut ; expédiée → e-mail client ; sinon refusé", async () => {
  let r = await envoyer("/admin/renvoyer", { cf: "CF-2026-0010-A" });
  assert.match(bandeau(r), /aucun e-mail à renvoyer/);
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/x" });
  assert.match(await fiche(), /Renvoyer l'e-mail au fabricant<\/button>/);
  const journal = sheet.Journal.length;
  r = await envoyer("/admin/renvoyer", { cf: "CF-2026-0010-A" });
  assert.match(bandeau(r), /renvoyé au fabricant ✓/);
  assert.equal(emails.length, 2);
  assert.equal(emails[1].to[0].email, "atelier@example.com");
  assert.deepEqual([art(1).Statut, sheet.Journal.length], ["envoyee_fabricant", journal], "statut et Journal inchangés");

  sheet["Commandes CF"][1][COL_CF.Statut] = sheet["Commandes CF"][1][COL_CF["Dernier statut notifié"]] = "expediee";
  r = await envoyer("/admin/renvoyer", { cf: "CF-2026-0010-A" });
  assert.match(bandeau(r), /d'expédition renvoyé au client ✓/);
  assert.equal(emails[2].to[0].email, "client@example.com");

  brevoEnPanne = true;
  r = await envoyer("/admin/renvoyer", { cf: "CF-2026-0010-A" });
  assert.match(bandeau(r), /non renvoyé/);
});

import { dateParis } from "../src/sheet.js";
test("Attente du fabricant : signalée dans la liste, la fiche et le tableau de bord ; orange après 48 h sans réponse", async () => {
  sheet["Commandes CF"].splice(2, 1);
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/x" });
  let liste = await (await get("/admin?f=fabricant")).text();
  assert.match(liste, /class="cmd bord t-wait"[\s\S]*<span class="badge t-wait">En attente fabricant<\/span>[\s\S]*<span class="attend">1 en attente d&#39;acceptation<\/span>/);
  assert.match(await (await get("/admin?q=EV-2026-0010")).text(), /<details class="carte pli bord t-wait" open>[\s\S]*<span class="badge t-wait">Envoyée au fabricant<\/span><\/span><span class="attend">En attente d&#39;acceptation depuis aujourd&#39;hui<\/span>/);
  assert.match(await (await get("/admin?vue=tableau")).text(), /chez le fabricant<\/div><span class="attend">dont 1 en attente d&#39;acceptation/);

  const j = sheet.Journal.findIndex(l => l[1] === "CF-2026-0010-A" && l[3] === "envoyee_fabricant");
  sheet.Journal[j][0] = dateParis(new Date(Date.now() - 3 * 86400_000 - 3600_000));
  liste = await (await get("/admin?f=fabricant")).text();
  assert.match(liste, /class="cmd bord t-att"[\s\S]*<span class="attend retard">1 envoi sans réponse depuis 3 j<\/span>/);
  assert.match(await (await get("/admin?q=EV-2026-0010")).text(), /<span class="attend retard">Sans réponse depuis 3 j<\/span>/);
  assert.match(await (await get("/admin?vue=tableau")).text(), /class="carte alerte" href="\/admin\?f=fabricant"[\s\S]*dont 1 en attente, 1 sans réponse/);

  sheet["Commandes CF"][1][COL_CF.Statut] = "acceptee";
  liste = await (await get("/admin?f=fabricant")).text();
  assert.doesNotMatch(liste, /class="attend/, "acceptée : plus de signal");
  assert.match(liste, /<span class="badge t-fab">En fabrication<\/span>/, "acceptée : « En fabrication »");
});

/* Robustesse face à Google : lectures groupées, nouveaux essais sur les lectures seulement, messages selon la cause */
const espion = (panne = () => null) => {
  const appels = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === "sheets.googleapis.com") {
      const a = { methode: init.method || "GET", chemin: decodeURIComponent(u.pathname) };
      appels.push(a);
      const s = panne(a, appels);
      if (s) return new Response(JSON.stringify({ error: { message: "panne" } }), { status: s });
    }
    return fauxFetch(url, init);
  };
  return appels;
};

test("Google : la liste des commandes lit le Sheet en 2 appels (4 onglets groupés)", async () => {
  const appels = espion();
  assert.equal((await ouvrir()).status, 200);
  assert.equal(appels.length, 2, JSON.stringify(appels));
});

test("Google : lecture en 503 puis rétablie → nouvel essai, page affichée", async () => {
  const appels = espion((a, t) => t.length === 1 ? 503 : null);
  const r = await ouvrir();
  assert.equal(r.status, 200);
  assert.match(await r.text(), /EV-2026-0010/);
  assert.equal(appels.length, 3);
});

test("Google : quota (429) → pas de nouvel essai, message dédié ; panne durable → message de lecture", async () => {
  let appels = espion(() => 429);
  let r = await ouvrir();
  assert.equal(r.status, 503);
  assert.match(await r.text(), /Trop de lectures du Sheet/);
  assert.equal(appels.length, 1, "429 : un seul appel");
  appels = espion(() => 500);
  r = await ouvrir();
  assert.equal(r.status, 503);
  const html = await r.text();
  assert.match(html, /Google Sheets n(&#39;|')a pas répondu\. Actualisez la page dans un instant/);
  assert.doesNotMatch(html, /ce qui a été enregistré/, "affichage : rien n'a été enregistré");
  assert.equal(appels.length, 3, "1 appel + 2 nouveaux essais");
});

test("Google : une écriture en échec n'est jamais retentée (pas de doublon)", async () => {
  const appels = espion(a => a.methode !== "GET" ? 503 : null);
  const r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: FAB, stl_2: "https://drive.google.com/file/d/sm/view" });
  const ecritures = appels.filter(a => a.methode !== "GET");
  assert.equal(ecritures.length, 1, JSON.stringify(ecritures));
  assert.ok(r.status === 503 || r.status === 303, String(r.status));
});

test("Retirer au fabricant : confirmation obligatoire ; articles à valider, fabricant prévenu, historique ; nouvel envoi sous un autre n° CF", async () => {
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: "" });
  assert.equal(art(1)["Commande CF"], "CF-2026-0010-A");
  const fiche = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(fiche, /action="\/admin\/retirer"[\s\S]*name="cf" value="CF-2026-0010-A"[\s\S]*name="confirmer" value="oui" required/);

  let r = await envoyer("/admin/retirer", { cf: "CF-2026-0010-A", motif: "pas de réponse" });
  assert.match(bandeau(r), /Rien n'a été retiré/);
  assert.equal(art(1).Statut, "envoyee_fabricant");
  r = await envoyer("/admin/retirer", { cf: "CF-2026-0099-A", confirmer: "oui" });
  assert.match(bandeau(r), /inconnue/, "n° CF d'une autre commande refusé");

  const avant = emails.length;
  r = await envoyer("/admin/retirer", { cf: "CF-2026-0010-A", motif: "pas de réponse", confirmer: "oui" });
  assert.match(bandeau(r), /CF-2026-0010-A retirée à Atelier Dupont : 1 article de nouveau à valider ; fabricant prévenu ✓/);
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"], art(1)["Commande CF"], art(1).Fabricant], ["a_valider", "a_valider", "", ""]);
  assert.match(art(1).Notes, /CF-2026-0010-A retirée à Atelier Dupont : pas de réponse$/);
  assert.equal(emails.length, avant + 1);
  assert.match(emails.at(-1).subject, /CF-2026-0010-A annulée de votre côté/);
  assert.match(emails.at(-1).textContent, /ne pas la fabriquer[\s\S]*Motif : pas de réponse/);
  assert.match(bandeau(await envoyer("/admin/retirer", { cf: "CF-2026-0010-A", confirmer: "oui" })), /rien à retirer/, "2e envoi sans effet");
  assert.equal(emails.length, avant + 1);

  const liste = await (await get("/admin")).text();
  assert.match(liste, /<span class="a-faire">(\d sur \d à valider · )?fabricant à changer<\/span>/);
  for (const q of ["EV-2026-0010", "cf-2026-0010-a"]) {
    const html = await (await get(`/admin?q=${encodeURIComponent(q)}`)).text();
    assert.match(html, /<h1>EV-2026-0010<\/h1>/, q);
    assert.doesNotMatch(html, /retirée au fabricant le/, "un seul message : la note, qui nomme le fabricant");
    assert.match(html, /class="note">[^<]*retirée à Atelier Dupont : pas de réponse/);
    assert.match(html, /CF-2026-0010-A<\/b> · Envoyée au fabricant → Retirée au fabricant/);
  }

  r = await envoyer("/admin/valider", { fab_1: FAB, stl_1: "", fab_2: "" });
  assert.match(bandeau(r), /CF-2026-0010-B envoyée à Atelier Dupont ✓/, "n° rendu jamais réattribué");
  assert.equal(art(1)["Commande CF"], "CF-2026-0010-B");
});

/* Fabricant « manuel » (colonne Envoi) : atelier interne, plateforme, téléphone… */
const MANUEL = "Atelier Evarysth";
function avecManuel() {
  sheet.Fabricants[0].push("Envoi");
  sheet.Fabricants.push([MANUEL, "", "3", "oui", "Manuel"]);
  sheet.Listes = [["Transporteurs"], ["Colissimo"], ["Remise en main propre"]];
  sheet["Commandes CF"][0].push("Référence externe");
}
const colRef = () => sheet["Commandes CF"][0].indexOf("Référence externe");

test("Envoi manuel : validé directement « acceptée » sans e-mail, fiche à transmettre, référence externe, expédition déclarée → e-mail client", async () => {
  avecManuel();
  assert.match(await (await get("/admin?q=EV-2026-0010")).text(), /<option value="Atelier Evarysth">Atelier Evarysth \(envoi manuel\)<\/option>/);
  let r = await envoyer("/admin/valider", { fab_1: MANUEL, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: "" });
  assert.match(bandeau(r), /CF-2026-0010-A confiée à Atelier Evarysth \(envoi manuel/);
  assert.equal(emails.length, 0, "aucun e-mail au fabricant");
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"], art(1)["Commande CF"]], ["acceptee", "acceptee", "CF-2026-0010-A"]);
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0010-A", "lien_stl_a_indiquer", "acceptee", "proprietaire"]);

  let html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /Atelier Evarysth · envoi manuel · 1 article/);
  assert.match(html, /<textarea id="fiche-CF-2026-0010-A" class="fiche" readonly[^>]*>Commande CF-2026-0010-A\n\nPièces[^\n]*\nboite-rugged · a=142[\s\S]*Fichier STL : https:\/\/drive\.google\.com\/file\/d\/sm\/view\n\nDélai convenu : 3 jours\n\nÀ expédier directement au client :\nCamille Test\n1 rue des Lilas, 75011 Paris, FR<\/textarea>/);
  assert.doesNotMatch(html, /Renvoyer l&#39;e-mail au fabricant|Renvoyer l'e-mail au fabricant/);
  assert.doesNotMatch(html, /Il a répondu autrement/, "manuel : actions affichées directement");
  assert.match(html, /action="\/admin\/expedier"[\s\S]*<option value="Remise en main propre">/);

  r = await envoyer("/admin/reference", { cf: "CF-2026-0010-A", ref: "PLAT-123" });
  assert.match(bandeau(r), /référence externe « PLAT-123 » enregistrée/);
  assert.equal(sheet["Commandes CF"][1][colRef()], "PLAT-123");
  assert.match(await (await get("/admin?q=EV-2026-0010")).text(), /envoi manuel · 1 article · réf\. PLAT-123/);
  assert.match(bandeau(await envoyer("/admin/reference", { cf: "CF-2026-0011-A", ref: "x" })), /inconnue/, "CF d'une autre commande refusée");

  r = await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Pigeon", suivi: "" });
  assert.match(bandeau(r), /choisissez un transporteur/);
  assert.equal(art(1).Statut, "acceptee");
  r = await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Remise en main propre", suivi: "" });
  assert.match(bandeau(r), /CF-2026-0010-A expédiée \(Remise en main propre\) ; client prévenu ✓/);
  assert.deepEqual([art(1).Statut, art(1)["Dernier statut notifié"], art(1).Transporteur], ["expediee", "expediee", "Remise en main propre"]);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, [{ email: "client@example.com", name: "Camille Test" }]);
  assert.match(emails[0].textContent, /Transporteur : Remise en main propre/);
  assert.doesNotMatch(emails[0].textContent, /N° de suivi/, "pas de ligne de suivi vide");
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0010-A", "acceptee", "expediee", "proprietaire"]);
  const b = await silence(() => tachePlanifiee(env));
  assert.deepEqual([b.notifiees, emails.length], [[], 1], "la tâche ne renvoie rien");
  assert.match(bandeau(await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Colissimo" })), /rien à expédier/);
});

test("Fabricant par e-mail qui répond autrement : « Marquer acceptée » puis expédition avec suivi, depuis /admin", async () => {
  avecManuel();
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: "" });
  assert.equal(emails.length, 1);
  const html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /Il a répondu autrement[\s\S]*action="\/admin\/accepter"[\s\S]*action="\/admin\/expedier"/);
  assert.doesNotMatch(html, /class="fiche"/, "pas de fiche à transmettre : il a reçu l'e-mail");
  let r = await envoyer("/admin/accepter", { cf: "CF-2026-0010-A" });
  assert.match(bandeau(r), /CF-2026-0010-A marquée acceptée ✓/);
  assert.equal(art(1).Statut, "acceptee");
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0010-A", "envoyee_fabricant", "acceptee", "proprietaire"]);
  assert.match(bandeau(await envoyer("/admin/accepter", { cf: "CF-2026-0010-A" })), /rien à accepter/);
  /* Ce fabricant ne livre pas le client (« Livre le client » = non) : son expédition est l'envoi de la pièce à Evarysth */
  assert.match(html, /Pièce expédiée à Evarysth \(pas d'e-mail au client\)/);
  assert.match(html, /Ce fabricant ne livre pas le client|Transporteur <span class="muted">\(facultatif\)/);
  r = await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Colissimo", suivi: "IN-FAB-1" });
  assert.match(bandeau(r), /pièce en route vers l'atelier\. Aucun e-mail au client/);
  assert.equal(art(1).Statut, "a_reexpedier");
  assert.equal(art(1).Transporteur, "", "le suivi du colis client reste vide");
  assert.match(art(1).Notes, /CF-2026-0010-A expédiée par Atelier Dupont à l'atelier Evarysth \(Colissimo · IN-FAB-1\)/);
  assert.equal(emails.length, 1, "aucun e-mail au client à l'envoi de la pièce à Evarysth");
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0010-A", "acceptee", "a_reexpedier", "proprietaire"]);
  assert.match(bandeau(await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "", suivi: "" })), /choisissez un transporteur/, "réexpédition : transporteur obligatoire");
  assert.equal(art(1).Statut, "a_reexpedier");
  /* À réexpédier : bien visible dans la liste « À traiter » et sur la fiche, la commande reste « en fabrication » */
  const liste = await (await get("/admin")).text();
  assert.match(liste, /EV-2026-0010[\s\S]*1 à réexpédier au client/);
  const fiche = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(fiche, /Pièce à réexpédier au client\.<\/b> Le fabricant l'a envoyée à l'atelier Evarysth/);
  assert.match(fiche, /Déclarer l'expédition au client \(e-mail au client\)/);
  await silence(() => tachePlanifiee(env));
  assert.equal(emails.length, 1, "la tâche planifiée n'écrit pas non plus au client");
  assert.equal(art(1)["Dernier statut notifié"], "a_reexpedier");
  r = await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Colissimo", suivi: "6A999" });
  assert.match(bandeau(r), /expédiée \(Colissimo · 6A999\) ; client prévenu ✓/);
  assert.match(emails.at(-1).textContent, /Transporteur : Colissimo\nN° de suivi : 6A999/);
  assert.deepEqual(sheet.Journal.at(-1).slice(1), ["CF-2026-0010-A", "a_reexpedier", "expediee", "proprietaire"]);
  assert.equal(emails.length, 2);
});

test("Fabricant qui livre le client : « Déclarer l'expédition » part directement chez le client (e-mail aussitôt), sans étape à réexpédier", async () => {
  avecManuel();
  sheet.Fabricants[1][3] = "oui";
  await envoyer("/admin/valider", { fab_1: FAB, stl_1: "https://drive.google.com/file/d/sm/view", fab_2: "" });
  const html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.doesNotMatch(html, /Pièce expédiée à Evarysth/);
  assert.match(html, /Déclarer l'expédition au client \(e-mail au client\)/);
  const r = await envoyer("/admin/expedier", { cf: "CF-2026-0010-A", transporteur: "Colissimo", suivi: "6A777" });
  assert.match(bandeau(r), /expédiée \(Colissimo · 6A777\) ; client prévenu ✓/);
  assert.equal(art(1).Statut, "expediee");
  assert.equal(emails.length, 2);
});

test("Envoi manuel choisi dans le Sheet (envoyee_fabricant) : la tâche n'écrit pas au fabricant et ne relance pas", async () => {
  avecManuel();
  Object.assign(sheet["Commandes CF"][1], { [COL_CF.Statut]: "envoyee_fabricant", [COL_CF.Fabricant]: MANUEL, [COL_CF["Lien STL"]]: "https://drive.google.com/x", [COL_CF["Commande CF"]]: "CF-2026-0010-A" });
  const e = { ...env, ORDER_EMAIL: "proprio@example.com" };
  const b = await silence(() => tachePlanifiee(e));
  assert.deepEqual(b.notifiees, ["CF-2026-0010-A : envoyee_fabricant"]);
  assert.equal(emails.length, 0);
  const b2 = await silence(() => tachePlanifiee(e, Date.now() + 5 * 86400_000));
  assert.deepEqual([b2.relances, emails.length], [[], 0]);
  const html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /class="fiche"/);
  assert.doesNotMatch(html, /En attente d&#39;acceptation|En attente d'acceptation/);
  assert.match(bandeau(await envoyer("/admin/renvoyer", { cf: "CF-2026-0010-A" })), /envoi manuel, aucun e-mail/);
});

test("Refus sans colonne Notes : message de secours tiré du Journal", async () => {
  sheet["Commandes CF"][0][COL_CF.Notes] = "Ancienne colonne";
  sheet.Journal.push(["2026-11-08 12:00", "CF-2026-0010-A", "envoyee_fabricant", "refusee_fabricant", "fabricant"]);
  const html = await (await get("/admin?q=EV-2026-0010")).text();
  assert.match(html, /CF-2026-0010-A refusée par le fabricant le 8 nov\. 2026 : choisissez un autre fabricant/);
});

const envUmami = { ...env, UMAMI_API_KEY: "cle-umami" };
test("Statistiques : sans clé Umami, explication du secret à ajouter ; aucun appel à Umami", async () => {
  umamiAppels = [];
  const r = await vue("stats"), html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /aria-current="page">Statistiques/);
  assert.match(html, /UMAMI_API_KEY/);
  assert.equal(umamiAppels.length, 0);
});

test("Statistiques : totaux et écarts, produits (vues + ajouts au panier), sources, appareils, pays ; sans Google ni script", async () => {
  const sans = { ...envUmami, GOOGLE_SA_KEY: "" };
  const r = await vue("stats&p=7", sans), html = await r.text();
  assert.equal(r.status, 200);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /<div class="nombre">60<\/div><div class="muted">visiteurs<\/div><div style="margin-top:6px"><span class="badge t-ok">\+50 %/);
  assert.match(html, /<div class="nombre">7<\/div><div class="muted">ajouts au panier/);
  assert.match(html, /Pince à sac avec bec verseur<\/b><\/a><br><span class="muted">5 ajouts au panier · 14 %<\/span><\/span><span>35 vues/, "vues d'une fiche additionnées, ancre comprise");
  assert.match(html, /2 min 00 s/);
  assert.match(html, /Google<\/span><span>9/);
  assert.match(html, /<span>Catalogue<\/span><span>12/);
  assert.match(html, /Mobile<\/span><span>50/);
  assert.match(html, /France<\/span>/);
  assert.match(html, /En ce moment sur le site[\s\S]*2 visiteurs/);
  assert.match(html, /aria-current="page">7 jours/);
  assert.match(html, /<svg viewBox/);
  assert.ok(umamiAppels.some(a => a.includes("/event-data/values") && a.includes("propertyName=produit")));
});

test("Statistiques : clé refusée → message clair, page servie", async () => {
  const html = await (await vue("stats&p=90", { ...envUmami, UMAMI_API_KEY: "mauvaise" })).text();
  assert.match(html, /Statistiques indisponibles[\s\S]*clé refusée/);
});

test("Statistiques : période inconnue → 30 jours", async () => {
  const html = await (await vue("stats&p=12", envUmami)).text();
  assert.match(html, /aria-current="page">30 jours/);
});
