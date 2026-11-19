/* Cloudflare Access (Zero Trust) devant le Worker d'administration. Access ajoute à chaque requête autorisée l'en-tête
   Cf-Access-Jwt-Assertion : un JWT RS256 signé par l'équipe Access. Le Worker le vérifie lui-même (défense en
   profondeur : une requête qui contournerait Access n'a pas de jeton valide) :
   signature (clés publiques de l'équipe, mises en cache 1 h), émetteur, audience (AUD de l'application), expiration,
   e-mail présent dans ADMIN_EMAILS.
   Configuration (variables, pas des secrets) : ACCESS_TEAM_DOMAIN (ex. evarysth.cloudflareaccess.com),
   ACCESS_AUD (tag AUD de l'application Access), ADMIN_EMAILS (séparés par des virgules). */
export const accesConfigure = env => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && env.ADMIN_EMAILS);

const emetteur = env => "https://" + String(env.ACCESS_TEAM_DOMAIN).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const json = s => JSON.parse(new TextDecoder().decode(deB64url(s)));

const cache = { url: "", cles: null, expire: 0 };
export const viderCacheAcces = () => { cache.url = ""; cache.cles = null; cache.expire = 0; };

async function clesPubliques(env, maintenant) {
  const url = `${emetteur(env)}/cdn-cgi/access/certs`;
  if (cache.url === url && cache.cles && maintenant < cache.expire) return cache.cles;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Access : clés publiques indisponibles (${r.status})`);
  const d = await r.json();
  cache.url = url; cache.cles = Array.isArray(d.keys) ? d.keys : []; cache.expire = maintenant + 3600_000;
  return cache.cles;
}

/* E-mail de l'administrateur si le jeton Access est valide, sinon null (jamais d'exception pour un jeton invalide) */
export async function verifierAcces(req, env, maintenant = Date.now()) {
  if (!accesConfigure(env)) return null;
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion") || "";
  const p = jwt.split(".");
  if (p.length !== 3 || jwt.length > 8000) return null;
  let entete, charge;
  try { entete = json(p[0]); charge = json(p[1]); } catch { return null; }
  if (entete.alg !== "RS256" || !entete.kid) return null;

  let cles = await clesPubliques(env, maintenant);
  let jwk = cles.find(k => k.kid === entete.kid);
  if (!jwk) { cache.expire = 0; cles = await clesPubliques(env, maintenant); jwk = cles.find(k => k.kid === entete.kid); }  /* rotation */
  if (!jwk) return null;
  try {
    const cle = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cle, deB64url(p[2]), new TextEncoder().encode(`${p[0]}.${p[1]}`));
    if (!ok) return null;
  } catch { return null; }

  const t = maintenant / 1000;
  const aud = [].concat(charge.aud || []);
  if (charge.iss !== emetteur(env) || !aud.includes(String(env.ACCESS_AUD).trim())) return null;
  if (typeof charge.exp !== "number" || t >= charge.exp) return null;
  if (typeof charge.nbf === "number" && t + 60 < charge.nbf) return null;
  const email = String(charge.email || "").trim().toLowerCase();
  const autorises = String(env.ADMIN_EMAILS).split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return email && autorises.includes(email) ? email : null;
}
