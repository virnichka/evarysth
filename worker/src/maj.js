/* Vérification manuelle : GET /maj?cle=<ADMIN_KEY> lance tout de suite la tâche planifiée (même code que le cron
   des 10 minutes) et affiche un bilan. Sans secret ADMIN_KEY : 503 ; clé absente ou fausse : 403. */
import { lancerTache } from "./planifie.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function egales(a, b) {
  const h = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function page(titre, lignes, statut = 200) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titre)} · Evarysth</title>
<style>body{margin:0;background:#f4f1ea;color:#151515;font:16px/1.5 Inter,system-ui,-apple-system,sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 16px}h1{font-size:26px;margin:0 0 16px}
.carte{background:#fff;border:1px solid #e4dfd4;border-radius:14px;padding:20px}p{margin:0 0 10px}</style></head>
<body><main><h1>${esc(titre)}</h1><div class="carte">${lignes.map(l => `<p>${esc(l)}</p>`).join("")}</div></main></body></html>`;
  return new Response(html, { status: statut, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
  } });
}

export async function routeMaj(url, env, tache = lancerTache) {
  if (!env.ADMIN_KEY) return page("Indisponible", ["Secret ADMIN_KEY non défini sur le Worker."], 503);
  if (!(await egales(url.searchParams.get("cle") || "", env.ADMIN_KEY))) return page("Refusé", ["Clé absente ou incorrecte."], 403);
  const b = await tache(env);
  if (b.inactive) return page("Inactif", ["Secrets Google absents : rien à vérifier."], 503);
  if (b.erreur) return page("Sheet indisponible", [b.erreur], 502);
  const n = v => (Array.isArray(v) ? v.length : 0);
  return page("Vérification faite", [
    `E-mails de statut envoyés : ${n(b.notifiees)}`,
    `Relances 48 h : ${n(b.relances)}`,
    `En attente (info manquante) : ${n(b.attente)}`,
    `Erreurs : ${n(b.erreurs)}`,
    ...[...(b.notifiees || []), ...(b.attente || []), ...(b.erreurs || [])].map(x => `• ${x}`)
  ]);
}
