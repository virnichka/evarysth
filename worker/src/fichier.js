/* Fichiers STL standards (bloc E) : objets du bucket R2 (binding `STL`), servis par GET /fichier/<jeton>.
   Jeton : fichier.<clé en base64url>.<expiration>.<signature>, HMAC-SHA256 (HMAC_SECRET) des 3 premiers champs,
   même mécanique que les liens fournisseur (jeton.js), rien à stocker. Le préfixe « fichier » empêche
   d'utiliser un lien fournisseur comme lien de fichier (et inversement : 4 champs au lieu de 5).
   Clés R2 : <produit>/<taille>.<stl|3mf|zip>, taille = libellé de la taille standard en minuscules sans accents
   (ex. boite-rugged/m.stl, support-velo/moyenne.stl, rampe/12.stl pour « Ø 12 »).
   Sans binding STL ou sans HMAC_SECRET : 503 propre, et la tâche planifiée ne propose aucun lien. */
import { b64Texte, egal, ErreurJeton, signature, texteB64, VALIDITE_JOURS } from "./jeton.js";

export const EXTENSIONS = ["stl", "3mf", "zip"];
const TYPES = { stl: "model/stl", "3mf": "model/3mf", zip: "application/zip" };
const RE_CLE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.(stl|3mf|zip)$/;

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
  let obj;
  try { obj = req.method === "HEAD" ? await env.STL.head(cle) : await env.STL.get(cle); }
  catch (e) { console.error("R2", e.message); return texte("Fichiers indisponibles pour le moment.", 503); }
  if (!obj) return texte("Fichier introuvable.", 404);
  const ext = cle.split(".").pop();
  const nom = cle.replace("/", "-");
  return new Response(req.method === "HEAD" ? null : obj.body, { status: 200, headers: {
    "Content-Type": TYPES[ext], "Content-Disposition": `attachment; filename="${nom}"`,
    ...(obj.size != null ? { "Content-Length": String(obj.size) } : {}),
    "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" } });
}

/* Clé R2 existante pour un produit et une taille standard (null si absente) */
export async function trouverCle(env, produit, taille) {
  const p = String(produit || "").trim(), t = segmentTaille(taille);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p) || !t) return null;
  for (const ext of EXTENSIONS) if (await env.STL.head(`${p}/${t}.${ext}`)) return `${p}/${t}.${ext}`;
  return null;
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
