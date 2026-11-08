/* Accès Google Sheets par compte de service, sans bibliothèque.
   JWT RS256 signé en WebCrypto → jeton d'accès OAuth (mis en cache 1 h) → API Sheets v4.
   Secrets Cloudflare : GOOGLE_SA_EMAIL (client_email), GOOGLE_SA_KEY (private_key, PEM PKCS#8), SHEET_ID.
   Lecture/écriture par nom de colonne (ligne 1), jamais par position figée. */

const PORTEE = "https://www.googleapis.com/auth/spreadsheets";
const URL_JETON = "https://oauth2.googleapis.com/token";
const URL_SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/";

export class ErreurGoogle extends Error {
  constructor(message, statut) { super(message); this.statut = statut; }
}

/* Les trois secrets sont présents : sinon toute la partie Sheet reste inactive */
export const googleConfigure = env => Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_KEY && env.SHEET_ID);

const b64url = octets => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlTexte = s => b64url(new TextEncoder().encode(s));

/* PEM PKCS#8 → clé de signature ; accepte les « \n » littéraux copiés depuis le JSON */
async function cleSignature(pem) {
  const corps = String(pem).replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(corps), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/* JWT d'assertion (RFC 7523) signé RS256, valable 1 h */
export async function jwtCompteService(email, pem, maintenant = Date.now()) {
  const iat = Math.floor(maintenant / 1000);
  const entete = b64urlTexte(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = b64urlTexte(JSON.stringify({ iss: email, scope: PORTEE, aud: URL_JETON, iat, exp: iat + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await cleSignature(pem), new TextEncoder().encode(`${entete}.${charge}`));
  return `${entete}.${charge}.${b64url(sig)}`;
}

/* Cache du jeton (par isolat du Worker), renouvelé 1 min avant expiration et au plus tard après 1 h */
let cache = null;
export const viderCacheJeton = () => { cache = null; };

export async function jetonAcces(env, maintenant = Date.now()) {
  if (cache && cache.email === env.GOOGLE_SA_EMAIL && cache.expire > maintenant) return cache.jeton;
  const r = await fetch(URL_JETON, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await jwtCompteService(env.GOOGLE_SA_EMAIL, env.GOOGLE_SA_KEY, maintenant)
    }).toString()
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new ErreurGoogle(`Jeton Google refusé (${r.status}) : ${d.error_description || d.error || ""}`, r.status);
  const duree = Math.min(Number(d.expires_in) || 3600, 3600);
  cache = { email: env.GOOGLE_SA_EMAIL, jeton: d.access_token, expire: maintenant + (duree - 60) * 1000 };
  return d.access_token;
}

/* Appel de l'API Sheets ; chemin relatif au classeur (ex. « values/Commandes!A:A », ou « :batchUpdate ») */
export async function appelSheets(env, methode, chemin, params = {}, corps) {
  const url = new URL(URL_SHEETS + encodeURIComponent(env.SHEET_ID) + (chemin.startsWith(":") ? "" : "/") + chemin);
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) url.searchParams.append(k, x);
  const r = await fetch(url.toString(), {
    method: methode,
    headers: { Authorization: `Bearer ${await jetonAcces(env)}`, ...(corps ? { "Content-Type": "application/json" } : {}) },
    ...(corps ? { body: JSON.stringify(corps) } : {})
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurGoogle(`Sheets ${r.status} : ${(d.error && d.error.message) || ""}`.slice(0, 300), r.status);
  return d;
}

/* 0 → A, 25 → Z, 26 → AA */
export function lettreColonne(i) {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

const plage = (onglet, a1) => `'${onglet.replace(/'/g, "''")}'!${a1}`;
const valeurs = a1 => "values/" + encodeURIComponent(a1);

/* En-têtes (ligne 1) → { nom: index } */
export async function entetes(env, onglet) {
  const d = await appelSheets(env, "GET", valeurs(plage(onglet, "1:1")));
  const noms = (d.values && d.values[0]) || [];
  return Object.fromEntries(noms.map((n, i) => [String(n).trim(), i]).filter(([n]) => n));
}

function index(cols, nom) {
  if (!(nom in cols)) throw new ErreurGoogle(`Colonne « ${nom} » introuvable dans le Sheet.`);
  return cols[nom];
}

/* Colonnes entières par nom → { nom: [ligne 2, ligne 3, …] } (cellules vides = "") */
export async function lireColonnes(env, onglet, cols, noms) {
  const d = await appelSheets(env, "GET", "values:batchGet", {
    ranges: noms.map(n => { const l = lettreColonne(index(cols, n)); return plage(onglet, `${l}:${l}`); }),
    majorDimension: "COLUMNS"
  });
  return Object.fromEntries(noms.map((n, i) => {
    const v = (d.valueRanges && d.valueRanges[i] && d.valueRanges[i].values && d.valueRanges[i].values[0]) || [];
    return [n, v.slice(1).map(x => (x == null ? "" : String(x)))];
  }));
}

/* Ligne de valeurs dans l'ordre des colonnes ; null = cellule laissée telle quelle (formules, saisies du propriétaire) */
export function ligneParNom(cols, valeursParNom) {
  for (const n of Object.keys(valeursParNom)) index(cols, n);
  const ligne = new Array(Math.max(...Object.values(cols)) + 1).fill(null);
  for (const [n, v] of Object.entries(valeursParNom)) ligne[cols[n]] = v;
  return ligne;
}

/* Écrit une ligne entière (n° de ligne du Sheet, à partir de 2) avec values.update en RAW */
export async function ecrireLigne(env, onglet, cols, numLigne, valeursParNom) {
  const ligne = ligneParNom(cols, valeursParNom);
  const a1 = plage(onglet, `A${numLigne}:${lettreColonne(ligne.length - 1)}${numLigne}`);
  return appelSheets(env, "PUT", valeurs(a1), { valueInputOption: "RAW" }, { range: a1, majorDimension: "ROWS", values: [ligne] });
}

export async function ecrireCellule(env, onglet, cols, numLigne, nom, valeur) {
  const a1 = plage(onglet, `${lettreColonne(index(cols, nom))}${numLigne}`);
  return appelSheets(env, "PUT", valeurs(a1), { valueInputOption: "RAW" }, { range: a1, majorDimension: "ROWS", values: [[valeur]] });
}

/* Ajout en fin d'onglet (réservé aux onglets sans formule, ex. Journal) */
export async function ajouterLigne(env, onglet, cols, valeursParNom) {
  const ligne = ligneParNom(cols, valeursParNom).map(v => (v == null ? "" : v));
  const a1 = plage(onglet, "A1");
  return appelSheets(env, "POST", valeurs(a1) + ":append", { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" }, { majorDimension: "ROWS", values: [ligne] });
}
