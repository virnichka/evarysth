/* Fichiers STL standards (bloc E) : objets du bucket R2 (binding `STL`), servis par GET /fichier/<jeton>.
   Jeton : fichier.<clé en base64url>.<expiration>.<signature>, HMAC-SHA256 (HMAC_SECRET) des 3 premiers champs,
   même mécanique que les liens fournisseur (jeton.js), rien à stocker. Le préfixe « fichier » empêche
   d'utiliser un lien fournisseur comme lien de fichier (et inversement : 4 champs au lieu de 5).
   Clés R2 : <produit>/<taille>.<stl|3mf|zip>, taille = libellé de la taille standard en minuscules sans accents
   (ex. boite-rugged/m.stl, support-velo/moyenne.stl, rampe/12.stl pour « Ø 12 »).
   Sans binding STL ou sans HMAC_SECRET : 503 propre, et la tâche planifiée ne propose aucun lien.
   Fichiers générés à la commande (Fabrication · phase 3) : commandes/<n° d'article>/<SHA court>/<fichier>, fichier =
   STL, 3MF (non tranché ou .gcode.3mf) ou fiche.html (affichée dans le navigateur, sans script : CSP « sandbox »).
   Clés virtuelles stl.zip et 3mf.zip : archive des STL (ou des 3MF non tranchés) du dossier, faite à la demande. */
import { b64Texte, egal, ErreurJeton, signature, texteB64, VALIDITE_JOURS } from "./jeton.js";
import { zipStocke } from "./zip.js";

export const EXTENSIONS = ["stl", "3mf", "zip"];
const TYPES = { stl: "model/stl", "3mf": "model/3mf", zip: "application/zip", html: "text/html; charset=utf-8" };
const RE_STANDARD = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.(stl|3mf|zip)$/;
export const RE_GENERE = /^commandes\/CF-\d{4}-\d{4,}-\d{1,3}\/[0-9a-f]{12}\/[a-z0-9][a-z0-9._-]{0,80}\.(stl|3mf|zip|html)$/;
const RE_CLE = { test: c => RE_STANDARD.test(c) || (RE_GENERE.test(c) && !c.includes("..")) };
const VIRTUELS = { "stl.zip": f => f.endsWith(".stl"), "3mf.zip": f => f.endsWith(".3mf") && !f.endsWith(".gcode.3mf") };
const ZIP_MAX = 90 * 1024 * 1024;      /* archive faite en mémoire : au-delà, fichiers à télécharger un par un */

export const fichiersConfigures = env => Boolean(env.STL && typeof env.STL.get === "function" && env.HMAC_SECRET);

/* Libellé de taille → segment de clé : « M » → m, « Moyenne » → moyenne, « Ø 12 » → 12 */
export const segmentTaille = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function creerJetonFichier(env, { cle, maintenant = Date.now(), validiteJours = VALIDITE_JOURS }) {
  if (!env.HMAC_SECRET) throw new ErreurJeton("HMAC_SECRET absent.", "config");
  if (!RE_CLE.test(cle || "")) throw new ErreurJeton("Clé de fichier invalide.", "format");
  const corps = `fichier.${texteB64(cle)}.${Math.floor(maintenant / 1000) + Math.round(validiteJours * 86400)}`;
  return `${corps}.${await signature(env.HMAC_SECRET, corps)}`;
}

/* Signature d'abord, puis format, puis expiration. Lève ErreurJeton (« invalide » ou « expire »). */
export async function verifierJetonFichier(env, jeton, maintenant = Date.now()) {
  if (!env.HMAC_SECRET) throw new ErreurJeton("HMAC_SECRET absent.", "config");
  const p = String(jeton || "").split(".");
  if (p.length !== 4 || p.some(x => !x) || p[0] !== "fichier" || jeton.length > 400) throw new ErreurJeton("Lien invalide.", "invalide");
  if (!egal(await signature(env.HMAC_SECRET, p.slice(0, 3).join(".")), p[3])) throw new ErreurJeton("Lien invalide.", "invalide");
  let cle;
  try { cle = b64Texte(p[1]); } catch { throw new ErreurJeton("Lien invalide.", "invalide"); }
  if (!RE_CLE.test(cle) || !/^\d+$/.test(p[2])) throw new ErreurJeton("Lien invalide.", "invalide");
  if (maintenant > Number(p[2]) * 1000) throw new ErreurJeton("Lien expiré.", "expire");
  return { cle, expiration: Number(p[2]) * 1000 };
}

const texte = (msg, status) => new Response(msg + "\n", { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });

/* GET (ou HEAD) /fichier/<jeton> */
export async function routeFichier(req, env, jeton) {
  if (req.method !== "GET" && req.method !== "HEAD") return texte("Méthode non autorisée.", 405);
  if (!fichiersConfigures(env)) return texte("Fichiers indisponibles pour le moment (configuration).", 503);
  let cle;
  try { ({ cle } = await verifierJetonFichier(env, decodeURIComponent(jeton))); }
  catch (e) {
    if (e.code === "expire") return texte("Ce lien a expiré. Demandez-nous un nouveau lien en répondant à l'e-mail de commande.", 410);
    return texte("Lien invalide.", 403);
  }
  return reponseFichier(req, env, cle);
}

/* STL standard servi à la page /admin (accès déjà vérifié par Cloudflare Access) : clé standard seulement */
export const cleStandard = c => RE_STANDARD.test(String(c || ""));

/* Réponse de téléchargement d'un objet R2 (clé déjà validée) */
export async function reponseFichier(req, env, cle) {
  let obj;
  try { obj = await lireObjet(env, cle, req.method === "HEAD"); }
  catch (e) { console.error("R2", e.message); return texte(e.code === "volume" ? e.message : "Fichiers indisponibles pour le moment.", e.code === "volume" ? 413 : 503); }
  if (!obj) return texte("Fichier introuvable.", 404);
  const ext = cle.split(".").pop();
  const generee = cle.startsWith("commandes/");
  /* Nom proposé : « CF-2026-0004-1-plateau-1.gcode.3mf » (n° d'article + fichier), « passe-cable-m.stl » (standard) */
  const nom = generee ? `${cle.split("/")[1]}-${cle.split("/").pop()}` : cle.replace("/", "-");
  const html = ext === "html";
  return new Response(req.method === "HEAD" ? null : obj.body, { status: 200, headers: {
    "Content-Type": TYPES[ext], "Content-Disposition": `${html ? "inline" : "attachment"}; filename="${nom}"`,
    ...(obj.size != null ? { "Content-Length": String(obj.size) } : {}),
    /* fiche.html : affichée, mais isolée (aucun script, aucune requête, origine opaque) */
    ...(html ? { "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" } : {}),
    "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" } });
}

/* Objet R2 (ou archive virtuelle stl.zip / 3mf.zip d'un dossier généré) : { body, size } ; null si absent */
async function lireObjet(env, cle, tete) {
  const dossier = cle.slice(0, cle.lastIndexOf("/") + 1), virtuel = VIRTUELS[cle.slice(dossier.length)];
  if (!cle.startsWith("commandes/") || !virtuel) return tete ? env.STL.head(cle) : env.STL.get(cle);
  const liste = await env.STL.list({ prefix: dossier, limit: 1000 });
  const objets = (liste.objects || []).filter(o => virtuel(o.key.slice(dossier.length))).sort((a, b) => a.key.localeCompare(b.key));
  if (!objets.length) return null;
  const total = objets.reduce((s, o) => s + (o.size || 0), 0);
  if (total > ZIP_MAX) throw Object.assign(new Error("Archive trop volumineuse : téléchargez les fichiers un par un depuis /admin."), { code: "volume" });
  if (tete) return { body: null, size: null };
  const fichiers = [];
  for (const o of objets) {
    const r = await env.STL.get(o.key);
    if (!r) return null;
    fichiers.push({ nom: o.key.slice(dossier.length), octets: new Uint8Array(await r.arrayBuffer()) });
  }
  const zip = zipStocke(fichiers);
  return { body: zip, size: zip.length };
}

/* Clé R2 existante pour un produit et une taille standard (null si absente) */
export async function trouverCle(env, produit, taille) {
  const p = String(produit || "").trim(), t = segmentTaille(taille);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p) || !t) return null;
  for (const ext of EXTENSIONS) if (await env.STL.head(`${p}/${t}.${ext}`)) return `${p}/${t}.${ext}`;
  return null;
}

/* Article standard (« produit · taille · … ») dont le fichier est dans R2 : true ; sinon (sur-mesure, R2 absent ou
   en panne) false. Ne demande pas HMAC_SECRET : sert seulement à choisir le statut de départ. */
export async function fichierStandardDispo(env, article) {
  if (!env.STL || typeof env.STL.head !== "function") return false;
  const [produit, taille] = String(article || "").split(" · ").map(x => (x || "").trim());
  if (!produit || !taille || taille === "—" || taille.includes("=")) return false;
  try { return Boolean(await trouverCle(env, produit, taille)); } catch (e) { console.warn("R2", e.message); return false; }
}

/* Colonne Pièce (« produit · taille · coloris · ×qté » par ligne) → texte des liens STL des lignes standard.
   Une ligne sur-mesure (cotes « a=… ») ou sans fichier dans R2 est ignorée ; "" si aucun lien (ou rien de configuré). */
export async function liensStandards(env, piece, base) {
  if (!fichiersConfigures(env)) return "";
  const liens = [], vus = new Set();
  for (const ligne of String(piece || "").split("\n")) {
    const [produit, taille] = ligne.split(" · ").map(s => (s || "").trim());
    if (!produit || !taille || taille === "—" || taille.includes("=")) continue;
    const cle = await trouverCle(env, produit, taille);
    if (!cle || vus.has(cle)) continue;
    vus.add(cle);
    liens.push(`${produit} ${taille} : ${base}/fichier/${await creerJetonFichier(env, { cle })}`);
  }
  return liens.length === 1 ? liens[0].replace(/^.* : /, "") : liens.join("\n");
}
