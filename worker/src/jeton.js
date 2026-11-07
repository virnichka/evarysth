/* Jetons des liens fournisseur : commande.action.fabricant.expiration.signature (rien à stocker).
   - fabricant : nom encodé en base64url (il peut contenir des points ou des accents) ;
   - expiration : secondes Unix ; signature : HMAC-SHA256 (secret HMAC_SECRET) des 4 premiers champs, en base64url. */
export const ACTIONS = ["accepter", "expedier"];
export const VALIDITE_JOURS = 14;
const RE_COMMANDE = /^CF-\d{4}-\d{4,}-[A-Z]{1,2}$/;           /* n° de commande fournisseur : seul n° que voit le fabricant */

export class ErreurJeton extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export const jetonConfigure = env => Boolean(env.HMAC_SECRET);

const enc = new TextEncoder();
export const b64url = octets => btoa(String.fromCharCode(...new Uint8Array(octets))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function deB64url(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
export const texteB64 = t => b64url(enc.encode(t));
export const b64Texte = s => new TextDecoder("utf-8", { fatal: true }).decode(deB64url(s));

export async function signature(secret, message) {
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", cle, enc.encode(message)));
}

/* Comparaison en temps constant (évite de deviner la signature octet par octet) */
export function egal(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* Création (utilisée par les e-mails fabricant, bloc D) */
export async function creerJeton(env, { commande, action, fabricant, maintenant = Date.now(), validiteJours = VALIDITE_JOURS }) {
  if (!jetonConfigure(env)) throw new ErreurJeton("HMAC_SECRET absent.", "config");
  if (!RE_COMMANDE.test(commande || "")) throw new ErreurJeton("N° de commande invalide.", "format");
  if (!ACTIONS.includes(action)) throw new ErreurJeton("Action inconnue.", "format");
  if (!String(fabricant || "").trim()) throw new ErreurJeton("Fabricant manquant.", "format");
  const exp = Math.floor(maintenant / 1000) + Math.round(validiteJours * 86400);
  const corps = `${commande}.${action}.${texteB64(String(fabricant || ""))}.${exp}`;
  return `${corps}.${await signature(env.HMAC_SECRET, corps)}`;
}

/* Vérification : signature d'abord, puis expiration. Lève ErreurJeton (code "invalide" ou "expire"). */
export async function verifierJeton(env, jeton, maintenant = Date.now()) {
  if (!jetonConfigure(env)) throw new ErreurJeton("HMAC_SECRET absent.", "config");
  const p = String(jeton || "").split(".");
  if (p.length !== 5 || p.some(x => !x) || jeton.length > 600) throw new ErreurJeton("Lien invalide.", "invalide");
  const [commande, action, fab, exp, sig] = p;
  if (!egal(await signature(env.HMAC_SECRET, p.slice(0, 4).join(".")), sig)) throw new ErreurJeton("Lien invalide.", "invalide");
  let fabricant;
  try { fabricant = b64Texte(fab); } catch { throw new ErreurJeton("Lien invalide.", "invalide"); }
  if (!RE_COMMANDE.test(commande) || !ACTIONS.includes(action) || !/^\d+$/.test(exp)) throw new ErreurJeton("Lien invalide.", "invalide");
  const expiration = Number(exp) * 1000;
  if (maintenant > expiration) throw new ErreurJeton("Lien expiré.", "expire");
  return { commande, action, fabricant, expiration };
}
