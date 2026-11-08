/* Page d'administration (« télécommande ») : ouverte sur le Worker d'administration (wrangler.toml [env.admin],
   derrière Cloudflare Access), qui relaie la requête à ce Worker ; le jeton Access est revérifié ici (acces.js).
   GET  /admin            commandes à valider (point de verrou), commandes bloquées, commandes en cours (lecture seule)
   POST /admin/valider    fabricant + lien STL par article → envoyee_fabricant, e-mail fabricant envoyé tout de suite
   POST /admin/bloquer    articles pas encore envoyés d'une commande → incident
   POST /admin/debloquer  articles bloqués jamais envoyés → retour à a_valider / lien_stl_a_indiquer
   POST : Origin = celle de la page, jeton anti-falsification (HMAC lié à l'e-mail Access, 12 h), relecture du Sheet
   avant toute écriture (double clic → « déjà validée »), puis redirection 303 (un rafraîchissement ne renvoie rien).
   Si l'e-mail fabricant échoue après l'écriture du statut, « Dernier statut notifié » n'est pas mis à jour : la tâche
   planifiée du Worker public le renvoie au passage suivant (10 min). Aucun script dans la page. */
import { verifierAcces } from "./acces.js";
import { googleConfigure } from "./google.js";
import { egal, jetonConfigure, signature } from "./jeton.js";
import { fichierStandardDispo } from "./fichier.js";
import { A_ENVOYER, envoyerSelonStatut, journaliserSiNouveau, lireEtat, numerosCF } from "./planifie.js";
import { A_VALIDER, majArticle, STL_A_INDIQUER } from "./sheet.js";

const ENVOYE = "envoyee_fabricant", INCIDENT = "incident";
const EN_COURS = [ENVOYE, "acceptee", "expediee"];
const LIBELLES = {
  lien_stl_a_indiquer: "Lien STL à indiquer", a_valider: "À valider", payee: "Payée (ancien circuit)",
  fichier_a_produire: "Fichier à produire (ancien circuit)", envoyee_fabricant: "Envoyée au fabricant", acceptee: "Acceptée",
  expediee: "Expédiée", livree: "Livrée", incident: "Bloquée", remboursee: "Remboursée", annulee: "Annulée"
};
const VALIDITE_CSRF_S = 12 * 3600;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nettoyer = s => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
const libelle = s => LIBELLES[s] || s || "—";

/* Lien STL saisi : URL https uniquement (sinon null) ; "" si vide */
export function lienValide(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.length > 500) return null;
  try { const u = new URL(s); return u.protocol === "https:" && u.hostname.includes(".") ? u.href : null; } catch { return null; }
}

/* « 75011 Paris » tiré de l'adresse (« ligne 1, ligne 2, CP ville, pays ») */
const ville = adresse => { const m = /(\d{4,5})\s+([^,]+)/.exec(adresse || ""); return m ? `${m[1]} ${m[2].trim()}` : ""; };

export async function jetonCsrf(env, email, maintenant = Date.now()) {
  const exp = Math.floor(maintenant / 1000) + VALIDITE_CSRF_S;
  return `${exp}.${await signature(env.HMAC_SECRET, `admin|${email}|${exp}`)}`;
}
async function csrfValide(env, email, jeton, maintenant = Date.now()) {
  const [exp, sig] = String(jeton || "").split(".");
  if (!/^\d+$/.test(exp || "") || !sig || Number(exp) * 1000 < maintenant) return false;
  return egal(await signature(env.HMAC_SECRET, `admin|${email}|${exp}`), sig);
}

const ENTETES = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
function page(titre, corps, statut = 200) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titre)} · Evarysth</title>
<style>
:root{--bg:#f4f1ea;--card:#fff;--line:#e4dfd4;--text:#151515;--muted:#66625a;--accent:#ff5a1f;--accent-hover:#ff7440;--err:#b3261e;--ok:#1d6b3a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}.marque{font:600 12px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{font-family:"Bricolage Grotesque",Inter,sans-serif;font-size:26px;letter-spacing:-.02em;line-height:1.1;margin:10px 0 16px}
h2{font-size:18px;margin:28px 0 10px}.carte{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 14px}
p{margin:0 0 8px}.muted{color:var(--muted);font-size:14px}.tete{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}
.art{border-top:1px solid var(--line);padding:12px 0 0;margin:12px 0 0}.piece{font:14px/1.5 ui-monospace,"JetBrains Mono",monospace;background:var(--bg);border-radius:8px;padding:8px 10px;margin:6px 0 10px;overflow-wrap:anywhere}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg);border:1px solid var(--line)}
label{display:block;font-weight:600;font-size:14px;margin:0 0 4px}input,select{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin:0 0 10px;background:#fff;color:var(--text)}
button{width:100%;font:600 16px/1 Inter,sans-serif;padding:14px;border:0;border-radius:999px;background:var(--accent);color:#151515;cursor:pointer;margin-top:4px}button:hover{background:var(--accent-hover)}
button.second{background:transparent;border:1px solid var(--line);color:var(--muted);font-size:14px;padding:10px}
.bandeau{border-radius:10px;padding:12px 14px;margin:0 0 16px;font-weight:600}.ok{background:#e6f2ea;color:var(--ok)}.err{background:#fbe9e7;color:var(--err)}
a{color:inherit}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}
</style></head><body><main><div class="marque">Evarysth · back-office</div>${corps}</main></body></html>`, { status: statut, headers: ENTETES });
}
const simple = (titre, texte, statut) => page(titre, `<h1>${esc(titre)}</h1><div class="carte"><p>${esc(texte)}</p></div>`, statut);

/* Rendu de la page. saisie = valeurs envoyées à garder après une erreur : { ev, fab: { n: nom }, stl: { n: lien } } */
async function rendre(env, email, etat, { message = "", type = "ok", saisie = null } = {}, statut = 200) {
  const { evs, lignes, parEV, fabs, journal } = etat;
  const csrf = await jetonCsrf(env, email);
  const noms = Object.keys(fabs);
  const cache = (ev, n, cle, defaut) => (saisie && saisie.ev === ev && saisie[cle][n] != null ? saisie[cle][n] : defaut);
  const entete = ev => {
    const [nom = "", , adresse = ""] = (ev.client || "").split("\n");
    return `<div class="tete"><b>${esc(ev.numero)}</b><span class="muted">${esc(ev.date)}${ev.type ? " · " + esc(ev.type) : ""}</span></div>
<p class="muted">${esc(nom.trim())}${ville(adresse) ? " · " + esc(ville(adresse)) : ""}${ev.cadeau ? " · Cadeau" + (ev.cadeau.includes("·") ? " : " + esc(ev.cadeau.split("·").slice(1).join("·").trim()) : "") : ""}</p>`;
  };

  /* 1. À valider : commandes avec au moins un article pas encore envoyé */
  const aValider = Object.keys(parEV).filter(ev => parEV[ev].some(l => A_ENVOYER.includes(l.statut))).sort().reverse();
  const cartes = [];
  for (const numero of aValider) {
    const ev = evs[numero] || { numero };
    const arts = [];
    for (const l of parEV[numero].filter(x => A_ENVOYER.includes(x.statut))) {
      const r2 = !l.stl.trim() && await fichierStandardDispo(env, l.article);
      const fab = cache(numero, l.n, "fab", l.fabricant.trim());
      arts.push(`<div class="art"><div class="tete"><span>Article ${esc(l.n)}</span><span class="badge">${esc(libelle(l.statut))}</span></div>
<div class="piece">${esc(l.article)}</div>
<label for="fab-${esc(numero)}-${esc(l.n)}">Fabricant</label><select id="fab-${esc(numero)}-${esc(l.n)}" name="fab_${esc(l.n)}">
<option value="">— plus tard —</option>${noms.map(f => `<option value="${esc(f)}"${f === fab ? " selected" : ""}>${esc(f)}</option>`).join("")}</select>
<label for="stl-${esc(numero)}-${esc(l.n)}">Lien STL${r2 ? " <span class=\"muted\">(fichier standard disponible, facultatif)</span>" : ""}</label>
<input id="stl-${esc(numero)}-${esc(l.n)}" name="stl_${esc(l.n)}" type="url" inputmode="url" autocomplete="off" placeholder="https://drive.google.com/…" value="${esc(cache(numero, l.n, "stl", l.stl.trim()))}"></div>`);
    }
    cartes.push(`<div class="carte">${entete(ev)}
<form method="post" action="/admin/valider"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="ev" value="${esc(numero)}">
${arts.join("")}<button type="submit">Valider et envoyer au fabricant</button></form>
<form method="post" action="/admin/bloquer"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="ev" value="${esc(numero)}">
<button class="second" type="submit">Bloquer cette commande</button></form></div>`);
  }

  /* 2. Bloquées (jamais envoyées) : bouton Débloquer */
  const bloquees = Object.keys(parEV).filter(ev => parEV[ev].some(l => debloquable(l, journal))).sort().reverse();
  const cartesB = bloquees.map(numero => `<div class="carte">${entete(evs[numero] || { numero })}
${parEV[numero].filter(l => debloquable(l, journal)).map(l => `<div class="piece">${esc(l.n)}. ${esc(l.article)}</div>`).join("")}
<form method="post" action="/admin/debloquer"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="ev" value="${esc(numero)}">
<button class="second" type="submit">Débloquer</button></form></div>`);

  /* 3. En cours (lecture seule), par commande fournisseur */
  const parCF = {};
  for (const l of lignes) if (l.cf && EN_COURS.includes(l.statut)) (parCF[l.cf] ||= []).push(l);
  const enCours = Object.keys(parCF).sort().reverse().slice(0, 30).map(cf => {
    const ls = parCF[cf], l = ls[0];
    const suivi = [l.transporteur, l.suivi].filter(x => x && x.trim()).join(" · ");
    return `<tr><td><b>${esc(cf)}</b><br><span class="muted">${esc(l.fabricant)}</span></td><td>${esc(libelle(l.statut))}${suivi ? `<br><span class="muted">${esc(suivi)}</span>` : ""}</td></tr>`;
  });

  return page("Back-office", `<h1>${aValider.length} commande${aValider.length > 1 ? "s" : ""} à valider</h1>
${message ? `<div class="bandeau ${type === "ok" ? "ok" : "err"}" role="status">${esc(message)}</div>` : ""}
<p class="muted"><a href="/admin">Actualiser</a> · connecté : ${esc(email)}</p>
${cartes.join("") || '<div class="carte"><p class="muted">Rien à valider.</p></div>'}
${cartesB.length ? `<h2>Bloquées</h2>${cartesB.join("")}` : ""}
<h2>En cours</h2>${enCours.length ? `<div class="carte"><table>${enCours.join("")}</table></div>` : '<div class="carte"><p class="muted">Aucune commande chez un fabricant.</p></div>'}`, statut);
}

/* Bloquée et jamais envoyée au fabricant (aucun envoyee_fabricant au Journal de sa CF) */
const debloquable = (l, journal) => l.statut === INCIDENT && !(l.cf && (journal[l.cf] || []).some(x => x.nouveau === ENVOYE));

const redirection = (message, type = "ok") => new Response(null, { status: 303, headers: {
  Location: `/admin?${new URLSearchParams({ m: message.slice(0, 300), t: type })}`, "Cache-Control": "no-store" } });

/* POST /admin/valider */
async function valider(env, email, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const toutes = etat.parEV[numero];
  if (!toutes) return redirection(`Commande ${numero} introuvable.`, "err");
  const enAttente = toutes.filter(l => A_ENVOYER.includes(l.statut));
  if (!enAttente.length) return redirection(`Commande ${numero} déjà validée.`);

  const saisie = { ev: numero, fab: {}, stl: {} };
  for (const l of enAttente) { saisie.fab[l.n] = nettoyer(f.get(`fab_${l.n}`)); saisie.stl[l.n] = String(f.get(`stl_${l.n}`) ?? "").trim().slice(0, 600); }
  const erreur = message => rendre(env, email, etat, { message, type: "err", saisie }, 400);

  /* Contrôles complets avant toute écriture */
  const choisis = [];
  for (const l of enAttente) {
    const fab = saisie.fab[l.n];
    if (!fab) continue;
    const ficheFab = etat.fabs[fab];
    if (!ficheFab) return erreur(`Article ${l.n} : fabricant « ${fab} » inconnu (onglet Fabricants).`);
    if (!/@/.test(ficheFab.email)) return erreur(`Article ${l.n} : le fabricant « ${fab} » n'a pas d'e-mail (onglet Fabricants).`);
    const lien = lienValide(saisie.stl[l.n]);
    if (lien === null) return erreur(`Article ${l.n} : le lien STL doit être une adresse https:// complète.`);
    if (!lien && !l.stl.trim() && !await fichierStandardDispo(env, l.article))
      return erreur(`Article ${l.n} : indiquez le lien du fichier STL (obligatoire).`);
    choisis.push({ l, fab, lien: lien || l.stl.trim() });
  }
  if (!choisis.length) return erreur("Choisissez le fabricant d'au moins un article.");

  /* N° CF (même règle que la tâche planifiée), puis écriture : fabricant, lien, n° CF, statut envoyee_fabricant */
  for (const c of choisis) c.l.fabricant = c.fab;
  const voulu = numerosCF(numero, toutes);
  for (const c of choisis) {
    c.ancien = c.l.notifie || c.l.statut;
    c.l.cf = voulu[toutes.indexOf(c.l)];
    await majArticle(env, numero, c.l.n, { Fabricant: c.fab, "Lien STL": c.lien, "Commande CF": c.l.cf, Statut: ENVOYE });
    c.l.stl = c.lien; c.l.statut = ENVOYE;
  }

  /* E-mail fabricant, un par CF, tout de suite */
  const groupes = new Map();
  for (const c of choisis) { if (!groupes.has(c.l.cf)) groupes.set(c.l.cf, []); groupes.get(c.l.cf).push(c); }
  const ok = [], attente = [];
  for (const [cf, cs] of groupes) {
    const g = { cf, numero: cf, ev: numero, statut: ENVOYE, lignes: cs.map(c => c.l) };
    try {
      const r = await envoyerSelonStatut(env, g, etat.evs[numero] || { numero, client: "", sid: "" }, toutes, etat.fabs);
      if (r !== true) { attente.push(`${cf} (${r})`); continue; }
      for (const c of cs) await majArticle(env, numero, c.l.n, { "Dernier statut notifié": ENVOYE });
      await journaliserSiNouveau(env, etat.journal, cf, cs[0].ancien, ENVOYE, "proprietaire");
      ok.push(`${cf} envoyée à ${cs[0].fab}`);
    } catch (e) {
      console.error("Admin : envoi", cf, e.message);
      attente.push(`${cf} (e-mail non parti)`);
    }
  }
  const reste = enAttente.length - choisis.length;
  const texte = [ok.length ? ok.join(" ; ") + " ✓" : "", attente.length ? `Validée, e-mail en attente (renvoi automatique sous 10 min) : ${attente.join(" ; ")}` : "",
    reste ? `${reste} article${reste > 1 ? "s" : ""} laissé${reste > 1 ? "s" : ""} pour plus tard.` : ""].filter(Boolean).join(" ");
  return redirection(texte, attente.length ? "err" : "ok");
}

/* POST /admin/bloquer : articles pas encore envoyés → incident */
async function bloquer(env, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const ls = (etat.parEV[numero] || []).filter(l => A_ENVOYER.includes(l.statut));
  if (!ls.length) return redirection(`Commande ${numero} : rien à bloquer.`, "err");
  for (const l of ls) {
    await majArticle(env, numero, l.n, { Statut: INCIDENT, "Dernier statut notifié": INCIDENT });
    await journaliserSiNouveau(env, etat.journal, l.cf || numero, l.statut, INCIDENT, "proprietaire");
  }
  return redirection(`Commande ${numero} bloquée (${ls.length} article${ls.length > 1 ? "s" : ""}).`);
}

/* POST /admin/debloquer : articles bloqués jamais envoyés → a_valider (fichier connu) ou lien_stl_a_indiquer */
async function debloquer(env, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const ls = (etat.parEV[numero] || []).filter(l => debloquable(l, etat.journal));
  if (!ls.length) return redirection(`Commande ${numero} : rien à débloquer.`, "err");
  for (const l of ls) {
    const s = l.stl.trim() || await fichierStandardDispo(env, l.article) ? A_VALIDER : STL_A_INDIQUER;
    await majArticle(env, numero, l.n, { Statut: s, "Dernier statut notifié": s });
    await journaliserSiNouveau(env, etat.journal, l.cf || numero, INCIDENT, s, "proprietaire");
  }
  return redirection(`Commande ${numero} débloquée : à valider.`);
}

/* POST venu de la page elle-même : Origin = celle de la page ; ou, si le navigateur envoie « null » / rien
   (certaines politiques de référent sous Safari), Sec-Fetch-Site = same-origin. Toute autre valeur est refusée. */
function memeOrigine(req, url) {
  const origine = req.headers.get("Origin"), site = req.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return false;
  if (origine === url.origin) return true;
  return (origine === null || origine === "null") && site === "same-origin";
}

export async function routeAdmin(req, env, url) {
  if (env.ADMIN_HOST && url.host !== env.ADMIN_HOST) return simple("Introuvable", "Page introuvable.", 404);
  if (url.pathname === "/" && req.method === "GET") return new Response(null, { status: 302, headers: { Location: "/admin" } });
  const route = `${req.method} ${url.pathname}`;
  const routes = ["GET /admin", "POST /admin/valider", "POST /admin/bloquer", "POST /admin/debloquer"];
  if (!routes.includes(route)) return simple("Introuvable", "Page introuvable.", 404);

  let email;
  try { email = await verifierAcces(req, env); } catch (e) { console.error("Access", e.message); return simple("Erreur temporaire", "Vérification d'accès impossible. Réessayez.", 503); }
  if (!email) return simple("Accès refusé", "Connectez-vous avec le compte autorisé.", 403);
  if (!googleConfigure(env) || !jetonConfigure(env)) return simple("Service indisponible", "Configuration incomplète (secrets Google ou HMAC_SECRET).", 503);

  try {
    if (req.method === "GET") {
      const t = url.searchParams.get("t");
      return await rendre(env, email, await lireEtat(env), { message: nettoyer(url.searchParams.get("m")).slice(0, 300), type: t === "err" ? "err" : "ok" });
    }
    /* POST : même origine (Origin obligatoire), jeton anti-falsification */
    if (!memeOrigine(req, url)) return simple("Requête refusée", "Origine de la requête non reconnue.", 403);
    const f = await req.formData().catch(() => null);
    if (!f || !await csrfValide(env, email, f.get("csrf"))) return redirection("Page expirée : action non faite. Recommencez.", "err");
    if (url.pathname === "/admin/valider") return await valider(env, email, f);
    if (url.pathname === "/admin/bloquer") return await bloquer(env, f);
    return await debloquer(env, f);
  } catch (e) {
    console.error("Admin", e.message);
    return simple("Erreur temporaire", "Le Sheet n'a pas répondu. Actualisez la page pour voir ce qui a été enregistré avant de recommencer.", 503);
  }
}
