/* Accès minimal à l'API Stripe, sans dépendance (fetch + WebCrypto) */

export class ErreurStripe extends Error {
  constructor(message, statut, code) { super(message); this.statut = statut; this.code = code; }
}

/* Encodage « form » de Stripe : objets et tableaux en a[b][0][c]=… */
export function encoder(obj, prefixe = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const cle = prefixe ? `${prefixe}[${k}]` : k;
    if (typeof v === "object") encoder(v, cle, out);
    else out.push(`${encodeURIComponent(cle)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

export async function appelStripe(env, methode, chemin, params) {
  const get = methode === "GET";
  const corps = params ? encoder(params) : "";
  const r = await fetch(`https://api.stripe.com/v1/${chemin}${get && corps ? "?" + corps : ""}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(get ? {} : { "Content-Type": "application/x-www-form-urlencoded" })
    },
    body: get ? undefined : corps
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurStripe((j.error && j.error.message) || `Erreur Stripe ${r.status}`, r.status, j.error && j.error.code);
  return j;
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

function egal(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function signer(secret, charge) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(charge)));
}

/* En-tête Stripe-Signature : t=<horodatage>,v1=<hmac>[,v1=…] ; tolérance 5 min (rejeu) */
export async function verifierSignature(corps, entete, secret, maintenant = Date.now() / 1000, tolerance = 300) {
  if (!entete || !secret) return false;
  let t = null; const v1 = [];
  for (const part of entete.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = Number(v); else if (k === "v1" && v) v1.push(v);
  }
  if (!Number.isFinite(t) || !v1.length || Math.abs(maintenant - t) > tolerance) return false;
  const attendu = await signer(secret, `${t}.${corps}`);
  return v1.some(s => egal(s, attendu));
}
