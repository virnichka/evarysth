/* Vérification manuelle : GET /maj affiche un formulaire ; POST /maj (champ « cle » = ADMIN_KEY) lance tout de suite
   la tâche planifiée (même code que le cron des 10 minutes) et affiche un bilan. La clé ne passe jamais dans
   l'adresse (historique du navigateur, journaux) : l'ancien GET /maj?cle=… ne lance plus rien.
   Sans secret ADMIN_KEY : 503 ; clé absente ou fausse : 403. */
import { lancerTache } from "./planifie.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function egales(a, b) {
  const h = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function page(titre, lignes, statut = 200, extra = "") {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(titre)} · Evarysth</title>
<style>body{margin:0;background:#f4f1ea;color:#151515;font:16px/1.5 Inter,system-ui,-apple-system,sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 16px}input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #c9c3b6;width:100%;box-sizing:border-box;margin:6px 0}
button{background:#151515;color:#fff;border:0;cursor:pointer}h1{font-size:26px;margin:0 0 16px}
.carte{background:#fff;border:1px solid #e4dfd4;border-radius:14px;padding:20px}p{margin:0 0 10px}</style></head>
<body><main><h1>${esc(titre)}</h1><div class="carte">${lignes.map(l => `<p>${esc(l)}</p>`).join("")}${extra}</div></main></body></html>`;
  return new Response(html, { status: statut, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}

const FORMULAIRE = `<form method="post" action="/maj"><label for="cle">Clé d'administration</label>
<input id="cle" name="cle" type="password" required autocomplete="current-password"><button type="submit">Lancer la vérification</button></form>`;
const formulaire = (titre, lignes, statut) => page(titre, lignes, statut, FORMULAIRE);

async function lireCle(req) {
  const type = req.headers.get("Content-Type") || "";
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/.test(type)) return "";
  const f = await req.formData().catch(() => null);
  const c = f && f.get("cle");
  return typeof c === "string" ? c.slice(0, 500) : "";
}

export async function routeMaj(req, env, tache = lancerTache) {
  if (!env.ADMIN_KEY) return page("Indisponible", ["Secret ADMIN_KEY non défini sur le Worker."], 503);
  if (req.method === "GET") {
    const ancienLien = new URL(req.url).searchParams.has("cle");
    return formulaire("Vérification du Sheet", ancienLien
      ? ["La clé ne se met plus dans l'adresse : saisissez-la ci-dessous (et retirez ce lien de vos favoris)."]
      : ["Lance tout de suite la vérification faite toutes les 10 minutes."], ancienLien ? 400 : 200);
  }
  if (req.method !== "POST") return page("Méthode non autorisée", ["Utilisez le formulaire."], 405);
  if (!(await egales(await lireCle(req), env.ADMIN_KEY))) return formulaire("Refusé", ["Clé absente ou incorrecte."], 403);
  const b = await tache(env);
  if (b.inactive) return page("Inactif", ["Secrets Google absents : rien à vérifier."], 503);
  if (b.erreur) return page("Sheet indisponible", [b.erreur], 502);
  const n = v => (Array.isArray(v) ? v.length : 0);
  return page("Vérification faite", [
    `N° CF attribués ou modifiés : ${n(b.attribuees)}`,
    `Statuts traités (e-mail envoyé si prévu) : ${n(b.notifiees)}`,
    `Statuts de commande EV recalculés : ${n(b.commandes)}`,
    `Relances 48 h : ${n(b.relances)}`,
    `En attente (info manquante) : ${n(b.attente)}`,
    `Erreurs : ${n(b.erreurs)}`,
    ...[...(b.attribuees || []), ...(b.notifiees || []), ...(b.commandes || []), ...(b.attente || []), ...(b.erreurs || [])].map(x => `• ${x}`)
  ]);
}
