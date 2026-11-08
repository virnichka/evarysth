/* Page d'administration (« télécommande ») : ouverte sur le Worker d'administration (wrangler.toml [env.admin],
   derrière Cloudflare Access), qui relaie la requête à ce Worker ; le jeton Access est revérifié ici (acces.js).
   GET  /admin            onglet Commandes : à valider (point de verrou), bloquées, en cours (lecture seule)
   GET  /admin?vue=…      onglets tableau (compteurs, alertes), catalogue (data.js + STL dans R2), systeme (voyants), liens
   POST /admin/valider    fabricant + lien STL par article → envoyee_fabricant, e-mail fabricant envoyé tout de suite
   POST /admin/bloquer    articles pas encore envoyés d'une commande → incident
   POST /admin/debloquer  articles bloqués jamais envoyés → retour à a_valider / lien_stl_a_indiquer
   POST /admin/tache      lance tout de suite la tâche planifiée (même code que le cron des 10 minutes)
   POST : Origin = celle de la page, jeton anti-falsification (HMAC lié à l'e-mail Access, 12 h), relecture du Sheet
   avant toute écriture (double clic → « déjà validée »), puis redirection 303 (un rafraîchissement ne renvoie rien).
   Si l'e-mail fabricant échoue après l'écriture du statut, « Dernier statut notifié » n'est pas mis à jour : la tâche
   planifiée du Worker public le renvoie au passage suivant (10 min). Aucun script dans la page. */
import { verifierAcces } from "./acces.js";
import { googleConfigure } from "./google.js";
import { egal, jetonConfigure, signature } from "./jeton.js";
import { EXTENSIONS, fichierStandardDispo, segmentTaille } from "./fichier.js";
import { A_ENVOYER, DELAI_RELANCE_MS, envoyerSelonStatut, journaliserSiNouveau, lancerTache, lirePassage, lireEtat, numerosCF, parisVersMs, RELANCE } from "./planifie.js";
import { A_VALIDER, dateParis, majArticle, STL_A_INDIQUER } from "./sheet.js";
import { EVARYSTH } from "./catalogue.js";

const ENVOYE = "envoyee_fabricant", INCIDENT = "incident";
const EN_COURS = [ENVOYE, "acceptee", "expediee"];
const LIBELLES = {
  lien_stl_a_indiquer: "Lien STL à indiquer", a_valider: "À valider", payee: "Payée (ancien circuit)",
  fichier_a_produire: "Fichier à produire (ancien circuit)", envoyee_fabricant: "Envoyée au fabricant", acceptee: "Acceptée",
  expediee: "Expédiée", livree: "Livrée", incident: "Bloquée", remboursee: "Remboursée", annulee: "Annulée"
};
const VALIDITE_CSRF_S = 12 * 3600;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nettoyer = (s, max = 120) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
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
.badge{display:inline-block;white-space:nowrap;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg);border:1px solid var(--line)}
label{display:block;font-weight:600;font-size:14px;margin:0 0 4px}input,select{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin:0 0 10px;background:#fff;color:var(--text)}
button{width:100%;font:600 16px/1 Inter,sans-serif;padding:14px;border:0;border-radius:999px;background:var(--accent);color:#151515;cursor:pointer;margin-top:4px}button:hover{background:var(--accent-hover)}
button.second{background:transparent;border:1px solid var(--line);color:var(--muted);font-size:14px;padding:10px}
.bandeau{border-radius:10px;padding:12px 14px;margin:0 0 16px;font-weight:600}.ok{background:#e6f2ea;color:var(--ok)}.err{background:#fbe9e7;color:var(--err)}
a{color:inherit}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 4px}nav a{text-decoration:none;font-size:14px;font-weight:600;padding:7px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--muted)}
nav a[aria-current]{background:var(--text);border-color:var(--text);color:#fff}
.grille{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}.grille .carte{margin:0;text-decoration:none;display:block}.nombre{font:600 32px/1.1 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em}
.grille .alerte{border-color:var(--accent)}.ligne{display:flex;justify-content:space-between;gap:10px;align-items:baseline;border-top:1px solid var(--line);padding:9px 0}.ligne:first-child{border-top:0;padding-top:0}
.voyant{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:var(--muted)}.v-ok{background:var(--ok)}.v-err{background:var(--err)}.v-att{background:#c98a00}
.pastille{display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid var(--line);vertical-align:-2px;margin-right:4px}.manque{color:var(--err);border-color:#f0c7c2}.present{color:var(--ok);border-color:#bfdcc8}
</style></head><body><main><div class="marque">Evarysth · back-office</div>${corps}</main></body></html>`, { status: statut, headers: ENTETES });
}
const simple = (titre, texte, statut) => page(titre, `<h1>${esc(titre)}</h1><div class="carte"><p>${esc(texte)}</p></div>`, statut);

/* Onglets : ?vue=… (Commandes par défaut) */
const VUES = [["", "Commandes"], ["tableau", "Tableau de bord"], ["catalogue", "Catalogue"], ["systeme", "Système"], ["liens", "Liens"]];
const SITE = "https://www.evarysth.fr";
const lienVue = v => (v ? `/admin?vue=${v}` : "/admin");
function cadre(vue, email, { message = "", type = "ok" } = {}, corps) {
  return `<nav aria-label="Rubriques">${VUES.map(([v, nom]) => `<a href="${lienVue(v)}"${v === vue ? ' aria-current="page"' : ""}>${nom}</a>`).join("")}</nav>
${message ? `<div class="bandeau ${type === "ok" ? "ok" : "err"}" role="status">${esc(message)}</div>` : ""}${corps}
<p class="muted"><a href="${lienVue(vue)}">Actualiser</a> · connecté : ${esc(email)}</p>`;
}
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

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

  return page("Back-office", cadre("", email, { message, type }, `<h1>${aValider.length} commande${aValider.length > 1 ? "s" : ""} à valider</h1>
${cartes.join("") || '<div class="carte"><p class="muted">Rien à valider.</p></div>'}
${cartesB.length ? `<h2>Bloquées</h2>${cartesB.join("")}` : ""}
<h2>En cours</h2>${enCours.length ? `<div class="carte"><table>${enCours.join("")}</table></div>` : '<div class="carte"><p class="muted">Aucune commande chez un fabricant.</p></div>'}`), statut);
}

/* Tableau de bord : compteurs et alertes, calculés depuis le Sheet (aucune écriture) */
export function chiffres(etat, maintenant = Date.now()) {
  const { evs, lignes, parEV, journal } = etat;
  const mois = dateParis(new Date(maintenant)).slice(0, 7);
  const aValider = Object.keys(parEV).filter(ev => parEV[ev].some(l => A_ENVOYER.includes(l.statut))).sort();
  const bloquees = Object.keys(parEV).filter(ev => parEV[ev].some(l => l.statut === INCIDENT));
  const cfs = {};
  for (const l of lignes) if (l.cf) (cfs[l.cf] ||= l);
  const chez = Object.keys(cfs).filter(cf => [ENVOYE, "acceptee"].includes(cfs[cf].statut));
  const expediees = Object.keys(cfs).filter(cf => ["expediee", "livree"].includes(cfs[cf].statut)
    && (journal[cf] || []).some(j => j.nouveau === "expediee" && String(j.date).startsWith(mois)));
  const relances = Object.keys(cfs).filter(cf => cfs[cf].statut === ENVOYE).map(cf => {
    const j = journal[cf] || [], relance = j.find(x => x.nouveau === RELANCE);
    const envoi = [...j].reverse().find(x => x.nouveau === ENVOYE);
    const t = envoi ? parisVersMs(envoi.date) : NaN;
    return relance || maintenant - t >= DELAI_RELANCE_MS ? { cf, fabricant: cfs[cf].fabricant, depuis: envoi ? envoi.date : "", relance: relance ? relance.date : "" } : null;
  }).filter(Boolean).sort((a, b) => a.cf.localeCompare(b.cf));
  const sansFabricant = aValider.map(ev => ({ ev, date: (evs[ev] || {}).date || "" }))
    .filter(x => maintenant - parisVersMs(x.date) > 24 * 3600_000);
  return { aValider: aValider.length, chez: chez.length, expediees: expediees.length, bloquees: bloquees.length, relances, sansFabricant };
}

function vueTableau(email, etat, bandeau) {
  const c = chiffres(etat);
  const tuile = (n, texte, vue = "", alerte = false) => `<a class="carte${alerte && n ? " alerte" : ""}" href="${lienVue(vue)}"><div class="nombre">${n}</div><div class="muted">${texte}</div></a>`;
  const alertes = [
    ...c.relances.map(r => `<div class="ligne"><span><b>${esc(r.cf)}</b> · ${esc(r.fabricant)}<br><span class="muted">${r.relance ? `relance 48 h envoyée le ${esc(r.relance)}` : "plus de 48 h sans acceptation, relance au prochain passage"} · envoyée le ${esc(r.depuis)}</span></span><span class="badge">Relance</span></div>`),
    ...c.sansFabricant.map(x => `<div class="ligne"><span><a href="/admin"><b>${esc(x.ev)}</b></a><br><span class="muted">payée le ${esc(x.date)}, toujours sans fabricant</span></span><span class="badge">+ 24 h</span></div>`)
  ];
  return page("Tableau de bord", cadre("tableau", email, bandeau, `<h1>Tableau de bord</h1>
<div class="grille">${tuile(c.aValider, "à valider", "", true)}${tuile(c.chez, "chez le fabricant")}${tuile(c.expediees, "expédiées ce mois")}${tuile(c.bloquees, "bloquées", "", true)}</div>
<h2>Alertes</h2><div class="carte">${alertes.join("") || '<p class="muted">Aucune alerte.</p>'}</div>`));
}

/* Catalogue : produits de data.js ; pour chaque taille standard, fichier présent ou non dans R2 (une seule liste du bucket) */
async function clesR2(env) {
  if (!env.STL || typeof env.STL.list !== "function") return null;
  const cles = new Set();
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.STL.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const o of r.objects || []) cles.add(o.key);
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  return cles;
}
async function vueCatalogue(env, email, bandeau) {
  let cles = null, erreurR2 = "";
  try { cles = await clesR2(env); } catch (e) { console.error("R2", e.message); erreurR2 = "R2 n'a pas répondu : présence des STL inconnue."; }
  const prix = n => `${Number(n).toLocaleString("fr-FR")} €`;
  let manquants = 0, total = 0;
  const parUnivers = EVARYSTH.universes.map(u => {
    const produits = EVARYSTH.products.filter(p => p.universe === u.id).map(p => {
      const tailles = ((p.variants || {}).options || []).map(o => {
        let etatStl = "";
        if (cles) {
          const ok = EXTENSIONS.some(x => cles.has(`${p.id}/${segmentTaille(o.label)}.${x}`));
          total++; if (!ok) manquants++;
          etatStl = ok ? '<span class="badge present">STL présent</span>' : '<span class="badge manque">STL manquant</span>';
        }
        return `<div class="ligne"><span>${esc(o.label)} <span class="muted">${esc(o.hint || "")}</span></span>${etatStl}</div>`;
      });
      const sm = p.custom ? `Sur-mesure +${prix(p.custom.surcharge || 0)} : ${(p.custom.params || []).map(x => `${esc(x.label)} ${x.min}–${x.max} mm`).join(" ; ")}` : "";
      return `<div class="carte"><div class="tete"><b>${esc(p.name)}</b><b>${prix(p.price)}</b></div>
<p class="muted">${esc(p.id)} · <a href="${SITE}/produits/${encodeURIComponent(p.id)}/" target="_blank" rel="noopener noreferrer">fiche ↗</a></p>
<p class="muted">${(p.colors || []).map(c => `<span class="pastille" style="background:${/^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : "#ccc"}"></span>${esc(c.label)}`).join(" · ")}</p>
<p class="muted">${esc((p.variants || {}).label || "Tailles")}</p>${tailles.join("")}${sm ? `<p class="muted" style="margin-top:8px">${sm}</p>` : ""}</div>`;
    });
    return produits.length ? `<h2>${esc(u.name)}</h2>${produits.join("")}` : "";
  });
  const resume = erreurR2 || (cles ? `${pluriel(total - manquants, "fichier")} STL présent${total - manquants > 1 ? "s" : ""} sur ${total} tailles standard.` : "Binding R2 « STL » absent : présence des STL non vérifiable.");
  return page("Catalogue", cadre("catalogue", email, bandeau, `<h1>${pluriel(EVARYSTH.products.length, "produit")}</h1>
<div class="carte"><p class="muted">${esc(resume)}</p></div>${parUnivers.join("")}`));
}

/* Système : un voyant par brique (aucune valeur de secret affichée), dernier passage de la tâche, lancement manuel */
async function vueSysteme(env, email, bandeau) {
  const live = env.CHECKOUT_MODE === "live", k = env.STRIPE_SECRET_KEY || "";
  const cleOk = live ? /^(sk|rk)_live_/.test(k) : /^(sk|rk)_test_/.test(k);
  const passage = googleConfigure(env) ? await lirePassage(env) : null;
  const age = passage ? Date.now() - passage.t : Infinity;
  const v = (etat, nom, detail) => `<div class="ligne"><span><span class="voyant v-${etat}"></span>${nom}</span><span class="muted">${esc(detail)}</span></div>`;
  const briques = [
    v(googleConfigure(env) ? "ok" : "err", "Google Sheet", googleConfigure(env) ? "secrets présents" : "GOOGLE_SA_EMAIL, GOOGLE_SA_KEY ou SHEET_ID manquant"),
    v(env.BREVO_API_KEY && env.ORDER_EMAIL ? "ok" : "err", "Brevo (e-mails)", env.BREVO_API_KEY && env.ORDER_EMAIL ? "secrets présents" : "BREVO_API_KEY ou ORDER_EMAIL manquant"),
    v(jetonConfigure(env) ? "ok" : "err", "HMAC (liens signés)", jetonConfigure(env) ? "secret présent" : "HMAC_SECRET manquant"),
    v(env.STL && typeof env.STL.head === "function" ? "ok" : "att", "R2 (STL standards)", env.STL && typeof env.STL.head === "function" ? "binding STL branché" : "binding STL absent"),
    v(cleOk ? (live ? "ok" : "att") : "err", `Paiement : mode ${live ? "live" : "test"}`, cleOk ? (live ? "ventes ouvertes" : "clé de test conforme") : "clé Stripe absente ou d'un autre mode")
  ];
  const tache = v(passage ? (age < 30 * 60_000 && passage.ok ? "ok" : "att") : "err", "Tâche planifiée",
    passage ? `${dateParis(new Date(passage.t))}${passage.ok ? "" : " (avec erreurs)"}` : "aucun passage noté");
  const csrf = await jetonCsrf(env, email);
  return page("Système", cadre("systeme", email, bandeau, `<h1>Système</h1>
<div class="carte">${briques.join("")}</div>
<h2>Tâche planifiée</h2><div class="carte">${tache}<p class="muted" style="margin-top:8px">Toutes les 10 min : e-mails d'expédition, relances 48 h, renvois en échec, Journal.</p>
<form method="post" action="/admin/tache"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">Lancer la tâche maintenant</button></form></div>`));
}

/* POST /admin/tache : même code que le cron, bilan en bandeau sur l'onglet Système */
async function tacheMaintenant(env) {
  const b = await lancerTache(env);
  if (b.inactive) return redirection("Secrets Google absents : rien à vérifier.", "err", "systeme");
  if (b.erreur) return redirection(`Sheet indisponible : ${b.erreur}`, "err", "systeme");
  const n = x => (Array.isArray(x) ? x.length : 0);
  const texte = `Tâche faite : ${n(b.attribuees)} n° CF, ${n(b.notifiees)} statut(s) traité(s), ${n(b.commandes)} statut(s) EV recalculé(s), ${n(b.relances)} relance(s), ${n(b.attente)} en attente, ${n(b.erreurs)} erreur(s).`
    + (n(b.erreurs) ? " " + b.erreurs.slice(0, 3).join(" ; ") : "");
  return redirection(texte, n(b.erreurs) ? "err" : "ok", "systeme");
}

/* Liens rapides : aucun identifiant dans le code ; l'adresse du Sheet vient du secret SHEET_ID */
function vueLiens(env, email, bandeau) {
  const test = env.CHECKOUT_MODE !== "live";
  const liens = [
    env.SHEET_ID ? ["Google Sheet", "commandes, Journal, fabricants", `https://docs.google.com/spreadsheets/d/${encodeURIComponent(env.SHEET_ID)}/edit`] : null,
    ["Stripe", test ? "paiements (mode test)" : "paiements", `https://dashboard.stripe.com/${test ? "test/" : ""}payments`],
    ["Brevo", "e-mails transactionnels", "https://app.brevo.com/"],
    ["Cloudflare", "Workers, R2, Access", "https://dash.cloudflare.com/"],
    ["Umami", "statistiques du site", "https://cloud.umami.is/"],
    ["Site en mode test", "commande avec carte de test", `${SITE}/?checkout=test`]
  ].filter(Boolean);
  return page("Liens", cadre("liens", email, bandeau, `<h1>Liens</h1>
<div class="carte">${liens.map(([nom, detail, href]) => `<div class="ligne"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer"><b>${esc(nom)} ↗</b></a><span class="muted">${esc(detail)}</span></div>`).join("")}</div>
${env.SHEET_ID ? "" : '<p class="muted">Google Sheet : secret SHEET_ID absent.</p>'}`));
}

/* Bloquée et jamais envoyée au fabricant (aucun envoyee_fabricant au Journal de sa CF) */
const debloquable = (l, journal) => l.statut === INCIDENT && !(l.cf && (journal[l.cf] || []).some(x => x.nouveau === ENVOYE));

const redirection = (message, type = "ok", vue = "") => new Response(null, { status: 303, headers: {
  Location: `/admin?${new URLSearchParams({ ...(vue ? { vue } : {}), m: message.slice(0, 300), t: type })}`, "Cache-Control": "no-store" } });

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
  const routes = ["GET /admin", "POST /admin/valider", "POST /admin/bloquer", "POST /admin/debloquer", "POST /admin/tache"];
  if (!routes.includes(route)) return simple("Introuvable", "Page introuvable.", 404);

  let email;
  try { email = await verifierAcces(req, env); } catch (e) { console.error("Access", e.message); return simple("Erreur temporaire", "Vérification d'accès impossible. Réessayez.", 503); }
  if (!email) return simple("Accès refusé", "Connectez-vous avec le compte autorisé.", 403);
  const vue = req.method === "GET" ? VUES.map(x => x[0]).find(v => v && v === url.searchParams.get("vue")) || "" : "";
  /* Catalogue, Système et Liens restent visibles sans secrets Google (diagnostic) ; HMAC_SECRET toujours requis (jeton CSRF) */
  const sansSheet = ["catalogue", "systeme", "liens"].includes(vue);
  if ((!sansSheet && !googleConfigure(env)) || !jetonConfigure(env)) return simple("Service indisponible", "Configuration incomplète (secrets Google ou HMAC_SECRET).", 503);

  try {
    if (req.method === "GET") {
      const t = url.searchParams.get("t");
      const bandeau = { message: nettoyer(url.searchParams.get("m"), 300), type: t === "err" ? "err" : "ok" };
      if (vue === "tableau") return vueTableau(email, await lireEtat(env), bandeau);
      if (vue === "catalogue") return await vueCatalogue(env, email, bandeau);
      if (vue === "systeme") return await vueSysteme(env, email, bandeau);
      if (vue === "liens") return vueLiens(env, email, bandeau);
      return await rendre(env, email, await lireEtat(env), bandeau);
    }
    /* POST : même origine (Origin obligatoire), jeton anti-falsification */
    if (!memeOrigine(req, url)) return simple("Requête refusée", "Origine de la requête non reconnue.", 403);
    const f = await req.formData().catch(() => null);
    if (!f || !await csrfValide(env, email, f.get("csrf"))) return redirection("Page expirée : action non faite. Recommencez.", "err");
    if (url.pathname === "/admin/valider") return await valider(env, email, f);
    if (url.pathname === "/admin/bloquer") return await bloquer(env, f);
    if (url.pathname === "/admin/tache") return await tacheMaintenant(env);
    return await debloquer(env, f);
  } catch (e) {
    console.error("Admin", e.message);
    return simple("Erreur temporaire", "Le Sheet n'a pas répondu. Actualisez la page pour voir ce qui a été enregistré avant de recommencer.", 503);
  }
}
