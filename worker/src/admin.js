/* Page d'administration (« télécommande ») : ouverte sur le Worker d'administration (wrangler.toml [env.admin],
   derrière Cloudflare Access), qui relaie la requête à ce Worker ; le jeton Access est revérifié ici (acces.js).
   GET  /admin?f=…        onglet Commandes : liste des commandes client (n° EV), filtres À traiter (défaut), Chez le
                          fabricant, Expédiées, Bloquées, Toutes ; une ligne ouvre la fiche (?q=n°)
   GET  /admin?vue=…      onglets tableau (compteurs, alertes), catalogue (data.js + STL dans R2), fabricants, systeme (voyants), liens
   GET  /admin?q=…        recherche (n° EV, n° CF ou nom du client) → fiche de la commande avec son Journal, lien vers le
                          paiement Stripe et actions (annuler / remboursée, renvoyer un e-mail)
   GET  /admin/<icône>    icônes et manifeste (ICONES, intégrées au code : aucun appel extérieur)
   Bandeau après une action : ?m=…&t=…&ts=…&s=… signé (HMAC_SECRET), ignoré après 2 min, affiché une seule fois
   (cookie admin_flash = signature déjà affichée).
   POST /admin/valider    fabricant + lien STL par article → envoyee_fabricant, e-mail fabricant envoyé tout de suite
   POST /admin/bloquer    articles pas encore envoyés d'une commande → incident
   POST /admin/debloquer  articles bloqués jamais envoyés → retour à a_valider / lien_stl_a_indiquer
   POST /admin/cloturer   articles cochés de la commande → annulee (pas encore expédiés) ou remboursee (après remboursement fait
                          dans Stripe) ; case « Je confirme » obligatoire, aucun e-mail, liens fabricant devenus sans effet
   POST /admin/retirer    CF envoyée ou acceptée → articles de nouveau à valider sans fabricant ni n° CF (rendreCF), e-mail
                          au fabricant ; case « Je confirme » obligatoire. Le fabricant peut aussi refuser lui-même (/f/ refuser).
   POST /admin/accepter   CF envoyée → acceptee (le fabricant a répondu autrement que par son lien)
   POST /admin/expedier   CF envoyée ou acceptée → expediee (transporteur de la liste, suivi facultatif), e-mail client aussitôt
   POST /admin/reference  « Référence externe » (n° chez le fournisseur) sur les lignes de la CF (colonne facultative)
   Fabricant « manuel » (colonne Envoi de l'onglet Fabricants) : validé directement en acceptee, sans e-mail ;
   la fiche à transmettre (pièces, STL, délai, adresse s'il livre le client) est affichée sur le pli de la CF.
   POST /admin/renvoyer   renvoie l'e-mail dû pour une CF (fabricant si envoyée/acceptée, client si expédiée), sans changer de statut
   POST /admin/tache      lance tout de suite la tâche planifiée (même code que le cron des 10 minutes)
   POST /admin/generation fichiers d'un article pas encore envoyé (Fabrication · phase 3) : mode=relancer (même SHA,
                          génération en échec ou bloquée) ou mode=actuel (SHA actuel du site, case « Je confirme »,
                          ligne d'Historique) ; « Valider et envoyer » attend des fichiers « prets » (sauf lien STL saisi).
   Fabricant « atelier » (colonne Envoi) : comme « manuel », proposé seulement pour une matière tranchée à l'atelier.
   POST : Origin = celle de la page, jeton anti-falsification (HMAC lié à l'e-mail Access, 12 h), relecture du Sheet
   avant toute écriture (double clic → « déjà validée »), puis redirection 303 (un rafraîchissement ne renvoie rien).
   Si l'e-mail fabricant échoue après l'écriture du statut, « Dernier statut notifié » n'est pas mis à jour : la tâche
   planifiée du Worker public le renvoie au passage suivant (10 min). Aucun script dans la page. */
import { verifierAcces } from "./acces.js";
import { ErreurGoogle, googleConfigure } from "./google.js";
import { egal, jetonConfigure, signature } from "./jeton.js";
import { atelierPossible, dossierR2, etatGitHub, fabricationConfiguree, GEN, liensGeneres, matiereArticle, MATIERES_ATELIER, NON_CONFIGUREE, refArticle, relancerArticle } from "./fabrication.js";
import { EXTENSIONS, fichierStandardDispo, segmentTaille } from "./fichier.js";
import { A_ENVOYER, STATUTS, statutEV, baseWorker, cfsRendues, DELAI_RELANCE_MS, envoyerSelonStatut, estTest, journaliserSiNouveau, lancerTache, liensGroupe, lirePassage, lireEtat, numerosCF, parisVersMs, RELANCE } from "./planifie.js";
import { A_REEXPEDIER, A_VALIDER, ajouterNote, dateParis, journaliser, majArticle, majLignesCF, noterCouts, passeParAtelier, REF_EXTERNE, REFUSEE, rendreCF, RETIRABLES, STL_A_INDIQUER } from "./sheet.js";
import { euros, margeCommande } from "./finances.js";
import { lireTransporteurs } from "./fournisseur.js";
import { contenuRetrait, envoyerEmail } from "./email.js";
import { EVARYSTH } from "./catalogue.js";
import { ICONES } from "./icones.js";
import { CLES, derniereSauvegardeZip, entretien, lireEtatR2, lirePause, MESSAGE_PAUSE, r2Disponible, reglerPause, sauvegarderSheet } from "./systeme.js";

const ENVOYE = "envoyee_fabricant", ACCEPTEE = "acceptee", INCIDENT = "incident";
const EN_COURS = [ENVOYE, "acceptee", "expediee"];
const LIBELLES = {
  lien_stl_a_indiquer: "Lien STL à indiquer", a_valider: "À valider", payee: "Payée (ancien circuit)",
  fichier_a_produire: "Fichier à produire (ancien circuit)", envoyee_fabricant: "Envoyée au fabricant", acceptee: "Acceptée", [A_REEXPEDIER]: "À réexpédier au client",
  expediee: "Expédiée", livree: "Livrée", incident: "Bloquée", remboursee: "Remboursée", annulee: "Annulée",
  [REFUSEE]: "Rendue par le fabricant",
  [NON_CONFIGUREE]: "Fichiers non générés (fabrication pas encore réglée)",
  [GEN.attente]: "Fichiers : lancement en attente", [GEN.cours]: "Fichiers : génération en cours", [GEN.prete]: "Fichiers prêts",
  [GEN.echec]: "Fichiers : génération en échec", generation_relancee: "Génération relancée (même SHA)",
  regeneree_sha_actuel: "Régénération au SHA actuel du site"
};
/* Génération des fichiers d'un article (colonne Génération) : libellé court et teinte */
const LIB_GEN = { [GEN.attente]: "Lancement en attente", [GEN.cours]: "Génération en cours", [GEN.prete]: "Fichiers prêts", [GEN.echec]: "Génération en échec" };
const TON_GEN = { [GEN.attente]: "t-wait", [GEN.cours]: "t-wait", [GEN.prete]: "t-ok", [GEN.echec]: "t-err" };
const badgeGen = g => `<span class="badge ${TON_GEN[g.statut] || "t-clos"}">${esc(LIB_GEN[g.statut] || "Fichiers non générés")}</span>`;
const MAT = m => String(m || "?").toUpperCase();
/* Refus (auteur fabricant) ou retrait (propriétaire) d'une CF, au Journal */
const libelleRendu = j => (j.auteur === "fabricant" ? "Refusée par le fabricant" : "Retirée au fabricant");
const LIBELLES_EV = { payee: "Payée", en_fabrication: "En fabrication", partiellement_expediee: "Partiellement expédiée", expediee: "Expédiée",
  livree: "Livrée", incident: "Bloquée", remboursee: "Remboursée", annulee: "Annulée" };
const ATTENTE_EV = "attente_fabricant";
LIBELLES_EV[ATTENTE_EV] = "En attente fabricant";
const libelleEV = s => LIBELLES_EV[s] || libelle(s);
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
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
/* Icônes de l'onglet et de l'écran d'accueil (iPhone / iPad), manifeste web : servis par ce Worker sous /admin/ */
const MANIFESTE = JSON.stringify({ name: "Evarysth admin", short_name: "Evarysth admin", start_url: "/admin", scope: "/admin", display: "standalone",
  background_color: "#f4f1ea", theme_color: "#f4f1ea", icons: [{ src: "/admin/favicon-192.png", sizes: "192x192", type: "image/png" }] });
const TETE_ICONES = `<link rel="icon" href="/admin/favicon.svg" type="image/svg+xml"><link rel="icon" href="/admin/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/admin/apple-touch-icon.png"><link rel="manifest" href="/admin/manifest.webmanifest" crossorigin="use-credentials">
<meta name="apple-mobile-web-app-title" content="Evarysth admin"><meta name="theme-color" content="#f4f1ea">`;
function ressource(nom) {
  const entetes = { "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" };
  if (nom === "manifest.webmanifest") return new Response(MANIFESTE, { headers: { ...entetes, "Content-Type": "application/manifest+json" } });
  const i = Object.hasOwn(ICONES, nom) ? ICONES[nom] : null;
  if (!i) return null;
  return new Response(Uint8Array.from(atob(i.b64), c => c.charCodeAt(0)), { headers: { ...entetes, "Content-Type": i.type } });
}
function page(titre, corps, statut = 200) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titre)} · Evarysth</title>
${TETE_ICONES}
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
button.danger{background:transparent;border:1px solid #f0c7c2;color:var(--err);font-size:14px;padding:10px}button.danger:hover{background:#fbe9e7}
.badge.t-att{background:#fff1ea;border-color:#ffc9b3;color:#a33a0f}.badge.t-fab{background:#eaf1fb;border-color:#c3d6f0;color:#1f4f8f}
.badge.t-ok{background:#e6f2ea;border-color:#bfdcc8;color:var(--ok)}.badge.t-err{background:#fbe9e7;border-color:#f0c7c2;color:var(--err)}.badge.t-clos{color:var(--muted)}
.badge.t-wait{background:#fff7dc;border-color:#ecd38a;color:#7a5600}.bord.t-wait{border-left-color:#e0a800}
.attend{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#7a5600;margin-top:4px;white-space:normal}
.attend::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:#e0a800}.attend.retard{color:#a33a0f}.attend.retard::before{background:var(--accent)}
.bord{border-left-width:4px}.bord.t-att{border-left-color:var(--accent)}.bord.t-fab{border-left-color:#3b74c4}.bord.t-ok{border-left-color:var(--ok)}.bord.t-err{border-left-color:var(--err)}
.cmds{display:grid;gap:8px;margin:0 0 14px}.cmd{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.cmd:hover{border-color:var(--muted)}.cmd .muted{display:block;margin-top:2px}.a-faire{display:block;font-size:14px;font-weight:600;color:#a33a0f;margin-top:2px}
nav.filtres{margin:0 -16px 10px}nav.filtres a{font-size:13px;padding:5px 10px}.compte{display:inline-block;min-width:20px;padding:0 6px;border-radius:999px;background:var(--bg);border:1px solid var(--line);font-size:12px;font-weight:600;text-align:center;color:var(--muted)}
nav a[aria-current] .compte{background:#fff;color:var(--text);border-color:#fff}h2 .compte{vertical-align:2px}
details.pli,details.pli:first-child{border-top:1px solid var(--line);padding:0 16px}details.bord,details.bord:first-child{border-left-width:4px}
details.pli>summary{padding:14px 0}details.pli[open]>summary{border-bottom:1px solid var(--line)}details.pli .detail{padding:4px 0 14px}details.pli summary .nom{white-space:normal}details.pli>summary{flex-wrap:wrap}details.pli>summary::after{order:1}
details.pli>summary>.attend{order:2;flex-basis:100%;margin:-4px 0 0}label.confirme span{flex:1}label.confirme.sep{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}
.zone>summary .nom{color:var(--err)}.zone form+form{border-top:1px solid var(--line);margin-top:14px;padding-top:14px}.retour{margin:0 0 -6px;font-size:14px}.valider .art:first-of-type{border-top:0;margin-top:0;padding-top:0}summary .nom .muted{font-weight:400}
.fich{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 10px;font-size:15px}.fich+button.second{margin:0 0 10px}.sous-titre{margin:12px 0 0}details.pli .detail>.art:first-child{border-top:0;margin-top:0}
details.options,details.options:first-child{border-top:0;margin:2px 0 4px}details.options>summary{padding:6px 0;color:var(--muted);font-size:15px}details.options>summary .nom{font-weight:500}details.options .detail{padding:0 0 6px}
details.actions{border-top:1px solid var(--line);margin-top:12px;padding-top:4px}details.actions .detail>form:first-child,details.actions .detail>form.agir:first-of-type{border-top:0;margin-top:4px;padding-top:0}
label.confirme{display:flex;gap:8px;align-items:center;font-weight:400;margin:4px 0 8px}label.confirme input{width:auto;margin:0}
.bandeau{border-radius:10px;padding:12px 14px;margin:0 0 16px;font-weight:600}.ok{background:#e6f2ea;color:var(--ok)}.err{background:#fbe9e7;color:var(--err)}
a{color:inherit}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-top:1px solid var(--line);vertical-align:top}
nav{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;gap:6px;margin:12px -16px 4px;padding:0 16px}nav::-webkit-scrollbar{display:none}
nav a{flex:none;white-space:nowrap;text-decoration:none;font-size:13px;font-weight:600;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--muted)}
nav a[aria-current]{background:var(--text);border-color:var(--text);color:#fff}
.grille{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}.grille .carte{margin:0;text-decoration:none;display:block}.nombre{font:600 32px/1.1 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em}
.grille .alerte{border-color:var(--accent)}.ligne{display:flex;justify-content:space-between;gap:10px;align-items:baseline;border-top:1px solid var(--line);padding:9px 0}.ligne:first-child{border-top:0;padding-top:0}
.voyant{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:var(--muted)}.v-ok{background:var(--ok)}.v-err{background:var(--err)}.v-att{background:#c98a00}
details.aide>summary.ligne{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:9px 0}
details.aide:first-child>summary.ligne{padding-top:0}
details.aide>summary.ligne>span:first-child{white-space:nowrap;flex:none}
details.aide>summary::after{display:none}
.q{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:6px;border-radius:50%;border:1px solid var(--line);font-size:11px;font-weight:700;color:var(--muted);vertical-align:1px}
details.aide[open] .q{background:var(--text);border-color:var(--text);color:#fff}
.aide-texte{margin:0 0 10px;padding:10px 12px;border-radius:8px;background:var(--bg);font-size:14px;line-height:1.45}
.note{white-space:pre-line;font-size:13px;color:#7a5600;background:#fff7dc;border-radius:8px;padding:6px 10px;margin:-4px 0 10px}
form.retirer,form.agir,details.agir{border-top:1px solid var(--line);margin-top:12px;padding-top:12px}details.agir>summary{padding:0 0 4px}details.agir form.agir:first-of-type{border-top:0;margin-top:4px;padding-top:0}
textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin:0 0 10px;background:#fff;color:var(--text)}textarea.fiche{font:13px/1.45 ui-monospace,"JetBrains Mono",monospace;background:var(--bg);resize:vertical}
.ligne-champ{display:flex;gap:8px}.ligne-champ input{flex:1;min-width:0;margin:0}.ligne-champ button{width:auto;margin:0;padding:0 14px}form.ref{padding-bottom:2px}.recherche{display:flex;margin:8px 0 10px}.recherche input{flex:1;min-width:0;margin:0;border-radius:8px 0 0 8px}.recherche button{flex:none;width:44px;margin:0;padding:0;border-radius:0 8px 8px 0;border:1px solid var(--line);border-left:0;background:var(--card);color:var(--muted);display:grid;place-items:center}.recherche button:hover{background:var(--bg)}
.vh{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}.journal{font-size:14px}
details{border-top:1px solid var(--line)}details:first-child{border-top:0}summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:11px 0}
summary::-webkit-details-marker{display:none}summary::after{content:"";flex:none;width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);margin:0 4px 0 2px;transition:transform .15s}
details[open]>summary::after{transform:rotate(45deg)}summary .nom{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}summary .resume{color:var(--muted);font-size:14px;white-space:nowrap}
.detail{padding:0 0 14px}.ligne>span:last-child{text-align:right}.liste{padding-top:6px;padding-bottom:6px}
.pastille{display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid var(--line);vertical-align:-2px;margin-right:4px}.manque{color:var(--err);border-color:#f0c7c2}.present{color:var(--ok);border-color:#bfdcc8}
</style></head><body><main><div class="marque">Evarysth · back-office</div>${corps}</main></body></html>`, { status: statut, headers: ENTETES });
}
const simple = (titre, texte, statut) => page(titre, `<h1>${esc(titre)}</h1><div class="carte"><p>${esc(texte)}</p></div>`, statut);

/* Onglets : ?vue=… (Commandes par défaut) */
const VUES = [["", "Commandes"], ["tableau", "Tableau de bord"], ["catalogue", "Catalogue"], ["fabricants", "Fabricants"], ["systeme", "Système"], ["liens", "Liens"]];
const SITE = "https://www.evarysth.fr";
const lienVue = v => (v ? `/admin?vue=${v}` : "/admin");
function cadre(vue, email, { message = "", type = "ok" } = {}, corps, ici = lienVue(vue)) {
  return `<nav aria-label="Rubriques">${VUES.map(([v, nom]) => `<a href="${lienVue(v)}"${v === vue ? ' aria-current="page"' : ""}>${nom}</a>`).join("")}</nav>
${message ? `<div class="bandeau ${type === "ok" ? "ok" : "err"}" role="status">${esc(message)}</div>` : ""}${corps}
<p class="muted"><a href="${ici}">Actualiser</a> · connecté : ${esc(email)}</p>`;
}
const RECHERCHE = (q = "") => `<form method="get" action="/admin" role="search" class="recherche"><label for="q" class="vh">Rechercher une commande</label>
<input id="q" name="q" type="search" autocomplete="off" placeholder="EV-2026-0012, CF-… ou nom" value="${esc(q)}"><button type="submit" aria-label="Rechercher"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button></form>`;
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/* Client affiché sans l'adresse complète : nom · ville */
function nomVille(ev) {
  const [nom = "", , adresse = ""] = String(ev.client || "").split("\n");
  return [nom.trim(), ville(adresse)].filter(Boolean).join(" · ");
}
const sansAccents = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* Recherche : n° EV ou CF (exact, ou fragment de n°), sinon nom du client (sans accents ni casse) → n° EV trouvés */
export function chercher(etat, q) {
  const t = sansAccents(q).trim();
  if (!t) return [];
  const { evs, lignes, parEV } = etat;
  const tous = [...new Set([...Object.keys(evs), ...Object.keys(parEV)])];
  const cf = lignes.find(l => l.cf && l.cf.toLowerCase() === t);
  if (cf) return [cf.ev];
  const rendue = Object.keys(etat.journal || {}).find(k => k.startsWith("CF-") && k.toLowerCase() === t);
  if (rendue) return [evDeCF(rendue)];
  const exact = tous.find(n => n.toLowerCase() === t);
  if (exact) return [exact];
  const parNumero = new Set([...tous.filter(n => n.toLowerCase().includes(t)), ...lignes.filter(l => l.cf && l.cf.toLowerCase().includes(t)).map(l => l.ev)]);
  const parNom = tous.filter(n => t.length >= 2 && sansAccents(String((evs[n] || {}).client || "").split("\n")[0]).includes(t));
  return [...new Set([...parNumero, ...parNom])].sort().reverse().slice(0, 30);
}

const evDeCF = cf => cf.replace(/^CF-/, "EV-").replace(/-[A-Z]+$/, "");
/* CF de cette commande refusées ou retirées (Journal) : [{ cf, auteur, date }] */
const rendues = (etat, numero) => Object.entries(etat.journal).filter(([k]) => k.startsWith("CF-") && evDeCF(k) === numero)
  .flatMap(([cf, js]) => js.filter(x => x.nouveau === REFUSEE).slice(-1).map(x => ({ cf, auteur: x.auteur, date: x.date })));

/* Actions de la fiche : clôture (annulée / remboursée) et renvoi d'e-mail */
const CLOS = ["annulee", "remboursee"], PARTIS = ["expediee", "livree"], RENVOYABLES = [ENVOYE, "acceptee", "expediee"];
const annulables = ls => ls.filter(l => !CLOS.includes(l.statut) && !PARTIS.includes(l.statut));
const remboursables = ls => ls.filter(l => !CLOS.includes(l.statut));
const lienStripe = sid => /^cs_[A-Za-z0-9_]+$/.test(sid || "")
  ? `https://dashboard.stripe.com/${sid.startsWith("cs_test_") ? "test/" : ""}search?query=${encodeURIComponent(sid)}` : "";
/* CF dont un e-mail peut être renvoyé : statut commun envoyee_fabricant / acceptee (fabricant) ou expediee (client) */
function cfsRenvoyables(arts) {
  const parCF = {};
  for (const l of arts) if (l.cf && !CLOS.includes(l.statut)) (parCF[l.cf] ||= []).push(l);
  return Object.entries(parCF).filter(([, ls]) => RENVOYABLES.includes(ls[0].statut) && ls.every(l => l.statut === ls[0].statut))
    .map(([cf, ls]) => ({ cf, lignes: ls, statut: ls[0].statut === "acceptee" ? ENVOYE : ls[0].statut }));
}

/* Couleur d'un statut (badge et trait) : à traiter, chez le fabricant, parti, bloqué, clos */
const TON = s => (s === ATTENTE_EV ? "t-wait" : A_ENVOYER.includes(s) || s === "payee" || s === A_REEXPEDIER ? "t-att" : [ENVOYE, "acceptee", "en_fabrication", "partiellement_expediee"].includes(s) ? "t-fab"
  : ["expediee", "livree"].includes(s) ? "t-ok" : s === INCIDENT ? "t-err" : "t-clos");
const badge = (s, lib = libelle) => `<span class="badge ${TON(s)}">${esc(lib(s))}</span>`;
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = d => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d || ""); return m ? `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}` : ""; };
const versFiche = n => `/admin?${new URLSearchParams({ q: n })}`;

/* CF envoyée, pas encore acceptée : jours depuis l'envoi (Journal), sans réponse après 48 h, relance faite */
function attente(etat, cf, maintenant = Date.now()) {
  const j = etat.journal[cf] || [], envoi = [...j].reverse().find(x => x.nouveau === ENVOYE);
  const ms = envoi ? maintenant - parisVersMs(envoi.date) : NaN;
  return { cf, jours: ms >= 0 ? Math.floor(ms / 86400_000) : null, retard: ms >= DELAI_RELANCE_MS, relance: j.some(x => x.nouveau === RELANCE) };
}
const depuis = a => (a.jours == null ? "" : a.jours < 1 ? "depuis aujourd'hui" : `depuis ${a.jours} j`);
const texteAttente = a => (a.retard ? `Sans réponse ${depuis(a)}${a.relance ? " · relance envoyée" : ""}` : `En attente d'acceptation ${depuis(a)}`).trim();

/* Résumé d'une commande client (n° EV) : statut calculé comme la formule du Sheet (statutEV), à défaut celui du Sheet */
function resumeEV(etat, numero) {
  const ev = etat.evs[numero] || { numero }, arts = etat.parEV[numero] || [];
  const calcule = statutEV(arts.map(l => l.statut)) || ev.statut || "";
  /* Affichage seul (le statut du Sheet reste en_fabrication) : rien d'accepté chez le fabricant → « En attente fabricant » */
  const statut = calcule === "en_fabrication" && !arts.some(l => ["acceptee", A_REEXPEDIER, "expediee", "livree"].includes(l.statut)) ? ATTENTE_EV : calcule;
  return { numero, ev, arts, statut,
    aValider: arts.filter(l => A_ENVOYER.includes(l.statut)).length, bloques: arts.filter(l => l.statut === INCIDENT).length,
    aReexpedier: arts.filter(l => l.statut === A_REEXPEDIER).length,
    attentes: [...new Set(arts.filter(l => l.cf && l.statut === ENVOYE).map(l => l.cf))].map(cf => attente(etat, cf)),
    rendues: rendues(etat, numero) };
}

/* Liste des commandes client : filtres ?f=… (« À traiter » par défaut), ou résultats d'une recherche */
const FILTRES = [["traiter", "À traiter"], ["fabricant", "Chez le fabricant"], ["expediees", "Expédiées"], ["bloquees", "Bloquées"], ["toutes", "Toutes"]];
const DANS = {
  traiter: r => r.aValider > 0 || r.bloques > 0 || r.aReexpedier > 0,
  fabricant: r => r.arts.some(l => [ENVOYE, "acceptee"].includes(l.statut)),
  expediees: r => ["expediee", "livree"].includes(r.statut),
  bloquees: r => r.bloques > 0,
  toutes: () => true
};
const MAX_LISTE = 50;
function ligneCommande(r) {
  const info = [nomVille(r.ev) || "Client inconnu", dateCourte(r.ev.date), pluriel(r.arts.length, "article")].filter(Boolean).join(" · ");
  /* Badge : ce qui attend le propriétaire d'abord (« À valider »), sinon le statut client ; le détail seulement s'il apporte */
  const tous = r.aValider === r.arts.length;
  const alerte = [r.aValider && (!tous || r.rendues.length) ? `${tous ? "" : `${r.aValider} sur ${r.arts.length} à valider`}${r.rendues.length ? `${tous ? "" : " · "}fabricant à changer` : ""}` : "", r.bloques ? pluriel(r.bloques, "bloqué") : "", r.aReexpedier ? `${r.aReexpedier} à réexpédier au client` : ""].filter(Boolean).join(" · ");
  const retard = r.attentes.filter(a => a.retard), att = r.attentes.length;
  const signal = att ? `<span class="attend${retard.length ? " retard" : ""}">${esc(retard.length
    ? `${pluriel(retard.length, "envoi")} sans réponse ${depuis(retard.reduce((m, a) => (a.jours > m.jours ? a : m)))}`
    : `${att} en attente d'acceptation`)}</span>` : "";
  const trait = r.aValider || r.bloques || r.aReexpedier || !att ? TON(r.aReexpedier && !r.aValider && !r.bloques ? A_REEXPEDIER : r.statut) : retard.length ? "t-att" : "t-wait";
  return `<a class="cmd bord ${trait}" href="${versFiche(r.numero)}"><span class="tete"><b>${esc(r.numero)}</b>${r.aValider ? badge("a_valider") : r.aReexpedier ? badge(A_REEXPEDIER) : badge(r.statut, libelleEV)}</span>
<span class="muted">${esc(info)}</span>${alerte ? `<span class="a-faire">${esc(alerte)}</span>` : ""}${signal}</a>`;
}
function vueCommandes(email, etat, filtre, bandeau, q = "", trouves = null) {
  const numeros = trouves || [...new Set([...Object.keys(etat.evs), ...Object.keys(etat.parEV)])];
  const resumes = numeros.map(n => resumeEV(etat, n)).sort((a, b) => b.numero.localeCompare(a.numero));
  const choisies = trouves ? resumes : resumes.filter(DANS[filtre]);
  const liste = choisies.slice(0, MAX_LISTE);
  const filtres = trouves ? "" : `<nav class="filtres" aria-label="Filtres">${FILTRES.map(([f, nom]) =>
    `<a href="/admin${f === "traiter" ? "" : "?f=" + f}"${f === filtre ? ' aria-current="page"' : ""}>${nom} <span class="compte">${resumes.filter(DANS[f]).length}</span></a>`).join("")}</nav>`;
  const titre = trouves ? `<h1>${liste.length ? `${pluriel(liste.length, "commande")} trouvée${liste.length > 1 ? "s" : ""}` : "Aucune commande"}</h1>` : "";
  const vide = trouves ? `Rien ne correspond à « ${esc(q)} ».` : filtre === "traiter" ? "Rien à traiter : tout est validé." : "Aucune commande.";
  return page("Commandes", cadre("", email, bandeau, `${RECHERCHE(q)}${filtres}${titre}
${liste.length ? `<div class="cmds">${liste.map(ligneCommande).join("")}</div>` : `<div class="carte"><p class="muted">${vide}</p></div>`}
${choisies.length > MAX_LISTE ? `<p class="muted">${MAX_LISTE} plus récentes affichées sur ${choisies.length} : utilisez la recherche.</p>` : ""}`,
  trouves ? versFiche(q) : `/admin${filtre === "traiter" ? "" : "?f=" + filtre}`));
}

async function vueRecherche(env, email, etat, q, bandeau) {
  const trouves = chercher(etat, q);
  return trouves.length === 1 ? vueFiche(env, email, etat, trouves[0], bandeau) : vueCommandes(email, etat, null, bandeau, q, trouves);
}

/* Fiche à transmettre (fabricant « manuel ») : même contenu que l'e-mail fabricant, en texte à copier */
async function ficheATransmettre(env, ev, cf, ls, fab) {
  const stl = await liensGroupe(env, ls, baseWorker(env), { gcode: Boolean(fab.atelier) });
  const [nom = "", , adresse = ""] = String(ev.client || "").split("\n");
  return [`Commande ${cf}`, `Pièces (produit · taille ou cotes en mm · coloris · quantité) :\n${ls.map(l => l.article).join("\n")}`,
    `${stl.generes ? "Fichiers (liens valables 14 jours) :\n" : "Fichier STL : "}${stl.texte || "à indiquer"}${stl.manquants.length ? ` (manque : ${stl.manquants.join(", ")})` : ""}`,
    ...(fab.delai ? [`Délai convenu : ${fab.delai} jours`] : []),
    ...(fab.livre ? [`À expédier directement au client :\n${[nom.trim(), adresse.trim()].filter(Boolean).join("\n")}`] : [])].join("\n\n");
}
/* Actions à la place du fabricant : accepter (si envoyée), déclarer l'expédition.
   entrant : le fabricant ne livre pas le client, la pièce vient chez Evarysth (a_reexpedier, aucun e-mail au client) ;
   sinon (ou pièce déjà chez Evarysth) : colis au client, e-mail avec le suivi. */
const formsAgir = (champs, cf, ls, transporteurs, entrant = false) => `${ls.some(l => l.statut === ENVOYE) ? `<form class="agir" method="post" action="/admin/accepter">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<button class="second" type="submit">Marquer acceptée</button></form>` : ""}
<form class="agir" method="post" action="/admin/expedier">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<label for="tr-${esc(cf)}">Transporteur${entrant ? ' <span class="muted">(facultatif)</span>' : ""}</label><select id="tr-${esc(cf)}" name="transporteur"${entrant ? "" : " required"}><option value="">Choisir…</option>${transporteurs.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
<label for="suivi-${esc(cf)}">N° de suivi <span class="muted">(facultatif)</span></label><input id="suivi-${esc(cf)}" name="suivi" maxlength="80" autocomplete="off">
<button type="submit">${entrant ? "Pièce expédiée à Evarysth (pas d'e-mail au client)" : "Déclarer l'expédition au client (e-mail au client)"}</button></form>`;
const formReference = (champs, cf, ref) => `<form class="agir ref" method="post" action="/admin/reference">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<label for="ref-${esc(cf)}">Référence externe <span class="muted">(n° chez le fournisseur, facultatif)</span></label>
<span class="ligne-champ"><input id="ref-${esc(cf)}" name="ref" maxlength="80" autocomplete="off" value="${esc(ref)}"><button class="second" type="submit">Enregistrer</button></span></form>`;

/* Fichiers d'impression d'un article, en une ligne sous l'article : état, liens (STL, 3MF, fichier tranché pour l'atelier,
   fiche) et masse · temps · plateaux ; en échec : motif et « Relancer la génération » (même SHA). `options` (article pas
   encore envoyé, à ranger dans « Autres options ») : dossier, SHA, matière et « Régénérer au SHA actuel » (case de
   confirmation). Liens signés valables 2 jours. Les boutons visent des formulaires rendus à part (`formes`, attribut
   form=) : la ligne peut vivre dans le formulaire « Valider et envoyer » sans formulaire imbriqué. */
async function blocGeneration(env, champs, numero, l, modifiable) {
  const g = l.gen, ref = refArticle(numero, l.n), id = `gen-${numero}-${l.n}`;
  const f = g.statut === GEN.prete ? await liensGeneres(env, ref, g.sha, baseWorker(env), { validiteJours: 2 }).catch(() => null) : null;
  const mat = matiereArticle(l.article);
  const chiffres = [g.masse ? `${g.masse} g` : "", g.temps ? `${g.temps} min` : "", g.plateaux ? `${g.plateaux} plateau${Number(g.plateaux) > 1 ? "x" : ""}` : ""].filter(Boolean).join(" · ");
  const lien = (url, texte) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(texte)} ↗</a>`;
  const liens = f ? [lien(f.stl, f.nbStl > 1 ? `STL (${f.nbStl} fichiers, zip)` : "STL"), f.troismf ? lien(f.troismf, "3MF") : "",
    ...f.gcode.map(x => lien(x.url, `Tranché P2S ${x.nom.replace(/\.gcode\.3mf$/, "")}`)), f.fiche ? lien(f.fiche, "Fiche") : ""].filter(Boolean).join(" · ") : "";
  const regenerable = modifiable && fabricationConfiguree(env);
  const relancable = regenerable && g.statut !== GEN.prete;
  const forme = mode => `<form id="${esc(id)}-${mode}" method="post" action="/admin/generation">${champs}<input type="hidden" name="n" value="${esc(l.n)}"><input type="hidden" name="mode" value="${mode}"></form>`;
  const formes = (relancable ? forme("relancer") : "") + (regenerable ? forme("actuel") : "");
  const etatTexte = g.statut === GEN.prete ? (liens ? liens : `<span class="a-faire">Fichiers introuvables : régénérez ou saisissez un lien STL.</span>`)
    : g.statut === GEN.echec ? `<span class="a-faire">${esc(g.motif || "motif inconnu")}</span>`
    : g.statut === GEN.cours ? '<span class="muted">environ 1 minute : actualisez la page</span>'
    : g.statut === GEN.attente ? '<span class="muted">nouvel essai automatique toutes les 10 minutes</span>'
    : !g.statut ? '<span class="muted">pas de fichiers générés pour cet article</span>' : "";
  const ligne = `<div class="fich">${g.statut ? badgeGen(g) : ""}<span>${etatTexte}</span>${chiffres ? `<span class="muted">${esc(chiffres)}</span>` : ""}</div>${relancable ? `<button class="second" type="submit" form="${esc(id)}-relancer">Relancer la génération</button>` : ""}`;
  const tech = [`dossier ${ref}`, g.sha ? `SHA ${g.sha.slice(0, 12)}` : "", mat ? `${MAT(mat)}${MATIERES_ATELIER.includes(mat) ? " (atelier possible)" : " (fabricant externe)"}` : ""].filter(Boolean).join(" · ");
  const options = modifiable ? `<p class="muted">${esc(tech)}</p>${g.statut === GEN.prete && !liens ? `<p class="muted">Dossier attendu : ${esc(dossierR2(ref, g.sha))}</p>` : ""}${regenerable ? `<label class="confirme"><input form="${esc(id)}-actuel" type="checkbox" name="confirmer" value="oui" required> <span>Je confirme : refaire les fichiers avec la version actuelle du site (forme ou réglages peut-être différents de ceux du paiement)</span></label>
<button class="second" type="submit" form="${esc(id)}-actuel">Régénérer au SHA actuel</button>` : ""}` : "";
  return { ligne, options, formes };
}
const autresOptions = contenu => (contenu ? `<details class="options"><summary><span class="nom">Autres options</span></summary><div class="detail">${contenu}</div></details>` : "");

/* Pli « Actions » d'un envoi fabricant (replié) : renvoyer l'e-mail, réponse du fabricant par un autre canal (accepter,
   expédier), référence externe, retirer au fabricant. Fabricant « manuel » : accepter / expédier restent visibles hors du pli. */
function actionsEnvoi({ champs, cf, ls, ref, manuel, active, entrant = false, g, transporteurs, refExterne }) {
  const parts = [];
  if (g) parts.push(`<form method="post" action="/admin/renvoyer">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<button class="second" type="submit">Renvoyer l'e-mail ${g.statut === ENVOYE ? "au fabricant" : "d'expédition au client"}</button></form>`);
  if (active && !manuel) parts.push(`<p class="muted sous-titre">Il a répondu autrement (téléphone, e-mail…) :</p>${formsAgir(champs, cf, ls, transporteurs, entrant)}`);
  if (refExterne && active) parts.push(formReference(champs, cf, ref));
  if (ls.some(l => RETIRABLES.includes(l.statut))) parts.push(`<form class="retirer" method="post" action="/admin/retirer">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<label for="motif-${esc(cf)}">Retirer au fabricant <span class="muted">(${manuel ? "changer d'atelier ou de fournisseur" : "refus par e-mail, pas de réponse…"})</span></label>
<input id="motif-${esc(cf)}" name="motif" maxlength="200" autocomplete="off" placeholder="${manuel ? "Motif (facultatif, gardé dans Notes)" : "Motif pour le fabricant (facultatif)"}">
<label class="confirme"><input type="checkbox" name="confirmer" value="oui" required> <span>${manuel ? "Je confirme : les articles reviennent « à valider »" : "Je confirme : il est prévenu par e-mail, ses liens ne fonctionnent plus, les articles reviennent « à valider »"}</span></label>
<button class="danger" type="submit">Retirer au fabricant</button></form>`);
  return parts.length ? `<details class="options actions"><summary><span class="nom">Actions</span></summary><div class="detail">${parts.join("\n")}</div></details>` : "";
}

/* Coûts par CF (colonnes facultatives du Sheet) : somme des lignes de la CF non closes */
function cfsAvecCouts(etat, arts) {
  const parCF = {};
  for (const l of arts.filter(x => !CLOS.includes(x.statut) && x.cf)) {
    const c = (parCF[l.cf] ||= { cf: l.cf, atelier: Boolean((etat.fabs[l.fabricant.trim()] || {}).atelier), cout: null, envoi: null });
    if (l.cout != null) c.cout = (c.cout || 0) + l.cout;
    if (l.envoi != null) c.envoi = (c.envoi || 0) + l.envoi;
  }
  return Object.values(parCF);
}
/* Montants de la commande et marge TTC (si le Sheet a les colonnes) : pli « Montants » de la fiche */
function blocMontants(etat, ev, arts) {
  const m = ev.montants;
  if (!etat.finances || !etat.finances.montants || !m || m.total == null) return "";
  const vivants = arts.filter(l => !CLOS.includes(l.statut));
  const g = etat.finances.couts ? margeCommande({ total: m.total, frais: m.frais, cfs: cfsAvecCouts(etat, arts), nonConfies: vivants.filter(l => !l.cf).length }) : null;
  const ligne = (nom, v) => `<div class="ligne"><span>${nom}</span><span>${v}</span></div>`;
  const resume = g ? (g.marge == null ? "marge à calculer" : `marge ${euros(g.marge)}`) : euros(m.total);
  return `<details class="options"><summary><span class="nom">Montants</span><span class="resume">${esc(resume)}</span></summary><div class="detail">
${ligne("Total payé (TTC)", esc(euros(m.total)))}${m.livraison ? ligne("dont livraison (point relais, au poids)", esc(euros(m.livraison))) : ""}${m.remise ? ligne("Remise appliquée", esc(euros(m.remise))) : ""}
${ligne("Frais Stripe", esc(euros(m.frais)))}${g ? `${ligne("Coûts fabricants", esc(euros(g.couts)))}${ligne("Frais d'envoi", esc(euros(g.envois)))}
${ligne("<b>Marge (TTC)</b>", g.marge == null ? `<span class="muted">${esc(g.manque)}</span>` : `<b>${esc(euros(g.marge))}</b>`)}` : '<p class="muted">Colonnes de coûts absentes du Sheet : marge non calculée.</p>'}</div></details>`;
}
const virgule = n => (n == null ? "" : String(n).replace(".", ","));
/* Saisie des coûts d'une CF (facture ou devis du fabricant, port payé par Evarysth), TTC */
const formCouts = (champs, cf, ls) => {
  const somme = k => { const v = ls.map(l => l[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  return `<details class="options"><summary><span class="nom">Coûts</span><span class="resume">${somme("cout") == null ? "à saisir" : esc(euros(somme("cout")))}</span></summary><div class="detail">
<form class="agir" method="post" action="/admin/couts">${champs}<input type="hidden" name="cf" value="${esc(cf)}">
<label for="cout-${esc(cf)}">Coût du fabricant (€) <span class="muted">(devis ou facture, TTC)</span></label><input id="cout-${esc(cf)}" name="cout" inputmode="decimal" autocomplete="off" maxlength="9" value="${virgule(somme("cout"))}">
<label for="envoi-${esc(cf)}">Frais d'envoi payés par Evarysth (€) <span class="muted">(facultatif)</span></label><input id="envoi-${esc(cf)}" name="envoi" inputmode="decimal" autocomplete="off" maxlength="9" value="${virgule(somme("envoi"))}">
<button class="second" type="submit">Enregistrer les coûts</button></form></div></details>`;
};

/* Fiche d'une commande client : en-tête, articles à valider (formulaire), bloqués, envois fabricant (un pli par CF),
   historique et actions définitives repliés. saisie = valeurs à garder après une erreur : { ev, fab: { n: nom }, stl: { n: lien } } */
async function vueFiche(env, email, etat, numero, { message = "", type = "ok", saisie = null } = {}, statut = 200) {
  const r = resumeEV(etat, numero), { ev, arts } = r;
  const csrf = await jetonCsrf(env, email);
  const champs = `<input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="ev" value="${esc(numero)}">`;
  const cache = (n, cle, defaut) => (saisie && saisie.ev === numero && saisie[cle][n] != null ? saisie[cle][n] : defaut);
  const noms = Object.keys(etat.fabs);
  const blocs = [];

  /* En-tête */
  const [, , adresse = ""] = String(ev.client || "").split("\n");
  const cadeau = ev.cadeau ? " · Cadeau" + (ev.cadeau.includes("·") ? " : " + ev.cadeau.split("·").slice(1).join("·").trim() : "") : "";
  const stripe = lienStripe(ev.sid);
  blocs.push(`<div class="carte bord ${TON(r.statut)}"><div class="tete"><b>${esc(String(ev.client || "").split("\n")[0].trim() || "Client inconnu")}</b>${badge(r.statut, libelleEV)}</div>
<p class="muted">${esc([ville(adresse), dateCourte(ev.date) + (ev.date ? ` à ${String(ev.date).slice(11, 16)}` : ""), ev.type, pluriel(arts.length, "article")].filter(Boolean).join(" · "))}${esc(cadeau)}</p>
${stripe ? `<p class="muted"><a href="${esc(stripe)}" target="_blank" rel="noopener noreferrer">Paiement dans Stripe ↗</a></p>` : ""}${blocMontants(etat, ev, arts)}</div>`);

  /* 1. À valider */
  const aValider = arts.filter(l => A_ENVOYER.includes(l.statut));
  if (aValider.length) {
    const lignes = [], formes = [];
    for (const l of aValider) {
      const r2 = !l.stl.trim() && !l.gen.statut && await fichierStandardDispo(env, l.article);
      const fab = cache(l.n, "fab", l.fabricant.trim()), id = `${numero}-${l.n}`;
      const gen = etat.generation ? await blocGeneration(env, champs, numero, l, true) : null;
      if (gen) formes.push(gen.formes);
      /* Lien STL saisi à la main : visible seulement s'il est nécessaire (pas de fichiers prêts) ou déjà rempli */
      const stl = cache(l.n, "stl", l.stl.trim()), facultatif = l.gen.statut === GEN.prete || r2;
      const stlVisible = !facultatif || Boolean(stl);
      const champStl = `<label for="stl-${esc(id)}">Lien STL${facultatif ? ` <span class="muted">(${l.gen.statut === GEN.prete ? "remplace les fichiers générés" : "remplace le fichier standard"}, facultatif)</span>` : ""}</label>
<input id="stl-${esc(id)}" name="stl_${esc(l.n)}" type="url" inputmode="url" autocomplete="off" placeholder="https://drive.google.com/…" value="${esc(stl)}">`;
      lignes.push(`<div class="art"><div class="tete"><span>Article ${esc(l.n)}</span>${badge(l.statut)}</div>
<div class="piece">${esc(l.article)}</div>${l.notes.trim() ? `<p class="note">${esc(l.notes.trim())}</p>` : ""}
${gen ? gen.ligne : r2 ? '<div class="fich"><span class="muted">Fichier standard disponible</span></div>' : ""}
<label for="fab-${esc(id)}">Fabricant</label><select id="fab-${esc(id)}" name="fab_${esc(l.n)}">
<option value="">— plus tard —</option>${noms.filter(f => !etat.fabs[f].atelier || atelierPossible(l.article)).map(f => `<option value="${esc(f)}"${f === fab ? " selected" : ""}>${esc(f)}${etat.fabs[f].atelier ? " (atelier)" : etat.fabs[f].manuel ? " (envoi manuel)" : ""}</option>`).join("")}</select>
${champStl && stlVisible ? champStl : ""}${autresOptions((stlVisible ? "" : champStl) + (gen ? gen.options : ""))}</div>`);
    }
    /* Refus / retrait : la note de l'article (fabricant, motif) suffit ; message du Journal seulement si aucune note n'en parle */
    const rendus = r.rendues.filter(x => !aValider.some(l => l.notes.includes(x.cf))).map(x => `<p class="a-faire">${esc(x.cf)} ${x.auteur === "fabricant" ? "refusée par le fabricant" : "retirée au fabricant"}${x.date ? " le " + esc(dateCourte(x.date)) : ""} : choisissez un autre fabricant.</p>`).join("");
    blocs.push(`<h2>À valider <span class="compte">${aValider.length}</span></h2><div class="carte bord t-att">${rendus}
<form class="valider" method="post" action="/admin/valider">${champs}${lignes.join("")}<button type="submit">Valider et envoyer au fabricant</button></form>${formes.join("")}</div>`);
  }

  /* 2. Bloqués (jamais envoyés) */
  const bloques = arts.filter(l => debloquable(l, etat.journal));
  if (bloques.length) blocs.push(`<h2>Bloqués <span class="compte">${bloques.length}</span></h2><div class="carte bord t-err">
${(await Promise.all(bloques.map(async l => {
    const gen = etat.generation ? await blocGeneration(env, champs, numero, l, true) : null;
    return `<div class="piece">${esc(l.n)}. ${esc(l.article)}</div>${gen ? gen.ligne + autresOptions(gen.options) + gen.formes : ""}`;
  }))).join("")}
<form method="post" action="/admin/debloquer">${champs}<button class="second" type="submit">Débloquer</button></form></div>`);

  /* 3. Envois fabricant : un pli par n° CF (ouvert s'il est seul) */
  const parCF = {};
  for (const l of arts) if (l.cf) (parCF[l.cf] ||= []).push(l);
  const renvoyables = Object.fromEntries(cfsRenvoyables(arts).map(g => [g.cf, g]));
  const cfs = Object.keys(parCF).sort();
  /* CF encore chez le fabricant : actions à sa place ; fabricant « manuel » : fiche à transmettre */
  const fabDe = cf => etat.fabs[parCF[cf][0].fabricant.trim()] || {};
  const actives = cfs.filter(cf => parCF[cf].some(l => RETIRABLES.includes(l.statut)));
  const aReexpedier = cfs.filter(cf => parCF[cf].some(l => l.statut === A_REEXPEDIER));
  const transporteurs = actives.length || aReexpedier.length ? await lireTransporteurs(env) : [];
  const fiches = {};
  for (const cf of actives) if (fabDe(cf).manuel) fiches[cf] = await ficheATransmettre(env, ev, cf, parCF[cf].filter(l => RETIRABLES.includes(l.statut)), fabDe(cf));
  const plis = {};
  if (etat.generation) for (const l of arts) if (l.cf && l.gen.statut && !CLOS.includes(l.statut) && !lienValide(l.stl)) plis[l.n] = (await blocGeneration(env, champs, numero, l, false)).ligne;
  if (cfs.length) blocs.push(`<h2>Envois fabricant <span class="compte">${cfs.length}</span></h2>${cfs.map(cf => {
    const ls = parCF[cf], memes = ls.every(l => l.statut === ls[0].statut);
    const s = memes ? ls[0].statut : ls.map(l => l.statut).filter(x => !CLOS.includes(x)).sort((a, b) => STATUTS.indexOf(a) - STATUTS.indexOf(b))[0] || ls[0].statut;
    const suivi = [ls[0].transporteur, ls[0].suivi].map(x => String(x || "").trim()).filter(Boolean).join(" · ");
    const manuel = Boolean(fabDe(cf).manuel), active = actives.includes(cf), entrant = active && passeParAtelier(fabDe(cf)), reexp = aReexpedier.includes(cf);
    const g = renvoyables[cf] && !(manuel && renvoyables[cf].statut === ENVOYE) ? renvoyables[cf] : null;
    const a = s === ENVOYE && !manuel ? attente(etat, cf) : null, ton = a ? (a.retard ? "t-att" : "t-wait") : TON(s);
    const ref = String(ls[0].ref || "").trim();
    const infos = [ls[0].fabricant.trim() || "—", manuel ? "envoi manuel" : "", pluriel(ls.length, "article"), ref ? `réf. ${ref}` : ""].filter(Boolean).join(" · ");
    return `<details class="carte pli bord ${ton}"${cfs.length === 1 ? " open" : ""}><summary><span class="nom">${esc(cf)}<br><span class="muted">${esc(infos)}</span></span><span class="resume"><span class="badge ${ton}">${esc(libelle(s))}</span></span>${a ? `<span class="attend${a.retard ? " retard" : ""}">${esc(texteAttente(a))}</span>` : ""}</summary>
<div class="detail">${suivi ? `<p class="muted">Suivi : ${esc(suivi)}</p>` : ""}${ls.map(l => {
      const lien = lienValide(l.stl);
      return `<div class="art"><div class="tete"><span>Article ${esc(l.n)}</span>${memes ? "" : badge(l.statut)}</div><div class="piece">${esc(l.article)}</div>
${plis[l.n] || `<p class="muted">${lien ? `Lien STL : <a href="${esc(lien)}" target="_blank" rel="noopener noreferrer">ouvrir ↗</a>` : `Lien STL : ${esc(l.stl.trim() || "—")}`}</p>`}</div>`;
    }).join("")}${fiches[cf] ? `<details class="options"><summary><span class="nom">Fiche à transmettre (texte à copier)</span></summary><div class="detail"><label class="vh" for="fiche-${esc(cf)}">Fiche à transmettre</label><textarea id="fiche-${esc(cf)}" class="fiche" readonly rows="${Math.min(22, fiches[cf].split("\n").reduce((n, x) => n + Math.max(1, Math.ceil(x.length / 34)), 1))}">${esc(fiches[cf])}</textarea></div></details>` : ""}
${reexp ? `<div class="carte bord t-att"><p><b>Pièce à réexpédier au client.</b> Le fabricant l'a envoyée à l'atelier Evarysth : contrôlez-la, puis déclarez l'envoi au client (le client est prévenu à ce moment-là).</p>${ls.map(l => l.notes.trim()).find(Boolean) ? `<p class="note">${esc(ls.map(l => l.notes.trim()).find(Boolean))}</p>` : ""}${formsAgir(champs, cf, ls, transporteurs)}</div>` : ""}
${entrant && manuel ? `<p class="muted">Ce fabricant ne livre pas le client : la pièce vous est renvoyée, le client n'est prévenu qu'à la réexpédition.</p>` : ""}${manuel && active ? formsAgir(champs, cf, ls, transporteurs, entrant) : ""}${etat.finances && etat.finances.couts ? formCouts(champs, cf, ls) : ""}${actionsEnvoi({ champs, cf, ls, ref, manuel, active, entrant, g, transporteurs, refExterne: etat.refExterne })}</div></details>`;
  }).join("")}`);

  /* 4. Articles sans envoi ni action (ex. annulés avant l'envoi) */
  const autres = arts.filter(l => !l.cf && !aValider.includes(l) && !bloques.includes(l));
  if (autres.length) blocs.push(`<h2>Autres articles <span class="compte">${autres.length}</span></h2><div class="carte">${autres.map(l =>
    `<div class="tete"><span>Article ${esc(l.n)}</span>${badge(l.statut)}</div><div class="piece">${esc(l.article)}</div>`).join("")}</div>`);
  if (!arts.length) blocs.push('<div class="carte"><p class="muted">Aucun article dans Commandes CF.</p></div>');

  /* 5. Historique et actions définitives, repliés */
  const histo = [...new Set([numero, ...cfs, ...r.rendues.map(x => x.cf), ...arts.map(l => refArticle(numero, l.n))])].flatMap(n => (etat.journal[n] || []).map(j => ({ ...j, n }))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lib = n => (n.startsWith("EV") ? libelleEV : libelle);
  blocs.push(`<details class="carte pli journal"><summary><span class="nom">Historique</span><span class="resume">${pluriel(histo.length, "ligne")}</span></summary><div class="detail">
${histo.map(j => `<div class="ligne"><span><b>${esc(j.n)}</b> · ${esc(j.ancien ? `${lib(j.n)(j.ancien)} → ` : "")}${esc(j.nouveau === REFUSEE ? libelleRendu(j) : lib(j.n)(j.nouveau))}<br><span class="muted">${esc(j.date)}${j.auteur ? " · " + esc(j.auteur) : ""}</span></span></div>`).join("") || '<p class="muted">Rien au Journal.</p>'}</div></details>`);
  const a = annulables(arts).length, rb = remboursables(arts).length;
  if (aValider.length || a || rb) blocs.push(`<details class="carte pli zone"><summary><span class="nom">Bloquer, annuler ou rembourser</span></summary><div class="detail">
${aValider.length ? `<form method="post" action="/admin/bloquer">${champs}<p class="muted">Met de côté les articles à valider (réversible).</p><button class="second" type="submit">Bloquer cette commande</button></form>` : ""}
${a || rb ? `<form method="post" action="/admin/cloturer">${champs}<p class="muted">Articles concernés :</p>
${remboursables(arts).map(l => `<label class="confirme"><input type="checkbox" name="art" value="${esc(l.n)}"> <span>Article ${esc(l.n)} · ${esc(String(l.article).split("·")[0].trim())} ${badge(l.statut)}</span></label>`).join("")}
<label class="confirme sep"><input type="checkbox" name="confirmer" value="oui" required> Je confirme (définitif, aucun e-mail envoyé)</label>
${a ? `<button class="danger" type="submit" name="statut" value="annulee">Annuler les articles cochés</button>` : ""}
${rb ? `<button class="danger" type="submit" name="statut" value="remboursee">Marquer remboursés (après remboursement dans Stripe)</button>` : ""}
<p class="muted">Geste commercial sans retour de l'article : remboursement partiel dans Stripe seulement, rien à cocher ici.</p></form>` : ""}</div></details>`);

  return page(numero, cadre("", email, { message, type }, `<p class="retour"><a href="/admin">← Commandes</a></p><h1>${esc(numero)}</h1>${blocs.join("\n")}`, versFiche(numero)), statut);
}

/* Fabricants : onglet du Sheet, e-mail masqué ; CF en cours (envoyée ou acceptée) et en retard (envoyée depuis plus que
   le délai du fabricant, date de l'envoi lue au Journal) */
export const masquerEmail = e => { const [u = "", d = ""] = String(e || "").trim().split("@"); return u && d ? `${u[0]}•••@${d}` : "—"; };
/* Début du travail d'une CF : envoi au fabricant, ou acceptation directe (atelier, envoi manuel : jamais « envoyée ») ; ms ou NaN */
export function debutCF(journal, cf) {
  const t = (journal[cf] || []).filter(j => j.nouveau === ENVOYE || j.nouveau === ACCEPTEE).map(j => parisVersMs(j.date)).filter(Number.isFinite);
  return t.length ? Math.min(...t) : NaN;
}
/* Échéance légale de livraison (CGV : 30 jours après la commande, L216-1) : alerte à partir du 21e jour */
export const DELAI_LEGAL_J = 30, ALERTE_LEGALE_J = 21;
export function chargeFabricants(etat, maintenant = Date.now()) {
  const { lignes, fabs, journal } = etat;
  const cfs = {};
  for (const l of lignes) if (l.cf && [ENVOYE, "acceptee"].includes(l.statut)) (cfs[l.cf] ||= l);
  return Object.entries(fabs).map(([nom, f]) => {
    const enCours = Object.keys(cfs).filter(cf => cfs[cf].fabricant.trim() === nom);
    const delai = Number(String(f.delai).replace(",", "."));
    const retard = Number.isFinite(delai) && String(f.delai).trim() !== "" ? enCours.filter(cf => {
      const debut = debutCF(journal, cf);
      return Number.isFinite(debut) && maintenant - debut > delai * 86400_000;
    }) : [];
    return { nom, email: f.atelier ? `Atelier (envoi manuel ; ${MATIERES_ATELIER.map(MAT).join(", ")} seulement)` : f.manuel ? "Envoi manuel (sans e-mail)" : masquerEmail(f.email), delai: String(f.delai || "").trim(), livre: f.livre, enCours: enCours.sort(), retard: retard.sort() };
  });
}
function vueFabricants(email, etat, bandeau) {
  const liste = chargeFabricants(etat);
  const cartes = liste.map(f => `<details><summary><span class="nom">${esc(f.nom)}</span>${f.retard.length ? `<span class="badge manque">${f.retard.length} en retard</span>` : `<span class="resume">${f.enCours.length} en cours</span>`}</summary><div class="detail">
<p class="muted">${esc(f.email)}</p>
<div class="ligne"><span>Délai</span><span>${f.delai ? `${esc(f.delai)} j` : "—"}</span></div>
<div class="ligne"><span>Livre le client</span><span>${f.livre ? "oui" : "non"}</span></div>
<div class="ligne"><span>En cours</span><span>${f.enCours.length}</span></div>
<div class="ligne"><span>En retard</span><span>${f.retard.length}${f.retard.length ? `<br><span class="muted">${f.retard.map(esc).join(", ")}</span>` : ""}</span></div></div></details>`);
  return page("Fabricants", cadre("fabricants", email, bandeau, `<h1>${pluriel(liste.length, "fabricant")}</h1>
<div class="carte liste">${cartes.join("") || '<p class="muted">Onglet Fabricants vide.</p>'}</div>`));
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
  const attente = chez.filter(cf => cfs[cf].statut === ENVOYE).length;
  /* Fichiers en échec d'un article encore à envoyer (au-delà, le fichier a été fourni autrement) */
  const echecsGen = lignes.filter(l => l.gen && l.gen.statut === GEN.echec && (A_ENVOYER.includes(l.statut) || l.statut === INCIDENT))
    .map(l => ({ ev: l.ev, ref: refArticle(l.ev, l.n), motif: l.gen.motif })).sort((a, b) => a.ref.localeCompare(b.ref));
  /* Pièces chez Evarysth à réexpédier (le fabricant ne livre pas le client) */
  const aReexpedier = Object.keys(cfs).filter(cf => lignes.some(l => l.cf === cf && l.statut === A_REEXPEDIER)).map(cf => {
    const j = (journal[cf] || []).filter(x => x.nouveau === A_REEXPEDIER).pop();
    return { cf, ev: evDeCF(cf), depuis: j ? j.date : "" };
  }).sort((a, b) => a.cf.localeCompare(b.cf));
  /* Acceptées (ou confiées à l'atelier / en envoi manuel) mais pas expédiées au-delà du délai du fabricant : les envois
     pas encore acceptés sont déjà dans « relances » */
  const horsDelai = Object.keys(cfs).map(cf => {
    const l = lignes.find(x => x.cf === cf && x.statut === ACCEPTEE);
    if (!l) return null;
    const f = etat.fabs[l.fabricant.trim()] || {}, delai = Number(String(f.delai ?? "").replace(",", ".")), debut = debutCF(journal, cf);
    if (!Number.isFinite(delai) || String(f.delai ?? "").trim() === "" || !Number.isFinite(debut) || !(maintenant - debut > delai * 86400_000)) return null;
    return { cf, ev: evDeCF(cf), fabricant: l.fabricant.trim(), jours: Math.floor((maintenant - debut) / 86400_000), delai, atelier: Boolean(f.atelier) };
  }).filter(Boolean).sort((a, b) => b.jours - a.jours);
  /* Échéance légale : au moins un article pas encore parti, 21 jours (alerte) puis 30 jours (dépassée) après la commande */
  const echeance = Object.keys(parEV).map(ev => {
    const restants = parEV[ev].filter(l => !CLOS.includes(l.statut) && !PARTIS.includes(l.statut));
    const t = parisVersMs((evs[ev] || {}).date);
    if (!restants.length || !Number.isFinite(t)) return null;
    const jours = Math.floor((maintenant - t) / 86400_000);
    return jours >= ALERTE_LEGALE_J ? { ev, jours, restants: restants.length, depassee: jours >= DELAI_LEGAL_J } : null;
  }).filter(Boolean).sort((a, b) => b.jours - a.jours);
  /* CF expédiées (hors atelier) dont le coût du fabricant n'est pas saisi : marge impossible à calculer */
  const coutsManquants = !(etat.finances && etat.finances.couts) ? [] : Object.keys(cfs).filter(cf => {
    const ls = lignes.filter(l => l.cf === cf), actives = ls.filter(l => !CLOS.includes(l.statut));
    return actives.length && actives.every(l => PARTIS.includes(l.statut)) && !(etat.fabs[ls[0].fabricant.trim()] || {}).atelier && ls.every(l => l.cout == null);
  }).map(cf => ({ cf, ev: evDeCF(cf) })).sort((a, b) => a.cf.localeCompare(b.cf));
  return { aValider: aValider.length, chez: chez.length, attente, expediees: expediees.length, bloquees: bloquees.length, relances, sansFabricant, echecsGen,
    aReexpedier, horsDelai, echeance, coutsManquants };
}

/* Alertes de fonctionnement lues dans R2 (aucun e-mail) : ventes en pause, clé Brevo, sauvegarde du Sheet. Rien tant qu'aucun passage n'a eu lieu. */
async function alertesSysteme(env) {
  const out = [], age = t => (Date.now() - t) / 86400_000;
  const pause = await lirePause(env);
  if (pause.active) out.push({ titre: "Ventes en pause", detail: `depuis le ${pause.depuis} · « ${pause.message} »`, badge: "Ventes" });
  if (env.BREVO_API_KEY && r2Disponible(env)) {
    const sb = await lireEtatR2(env, CLES.brevo);
    if (sb && !sb.ok) out.push({ titre: "Brevo refuse les appels", detail: `${sb.detail || "appel de maintien en échec"} : aucun e-mail ne partirait`, badge: "Brevo", tonErr: true });
  }
  if (googleConfigure(env) && r2Disponible(env)) {
    const ss = await lireEtatR2(env, CLES.sauvegarde);
    if (ss && !ss.ok) out.push({ titre: "Sauvegarde du Sheet en échec", detail: ss.detail || "dernière tentative en échec", badge: "Sauvegarde", tonErr: true });
    else if (ss && ss.tOk && age(ss.tOk) > 8) out.push({ titre: "Sauvegarde du Sheet en retard", detail: `dernière réussie le ${dateParis(new Date(ss.tOk))}`, badge: "Sauvegarde" });
  }
  return out;
}

async function vueTableau(env, email, etat, bandeau) {
  const c = chiffres(etat);
  const sys = await alertesSysteme(env);
  const tuile = (n, texte, href = "/admin", alerte = false, plus = "") => `<a class="carte${alerte && n ? " alerte" : ""}" href="${href}"><div class="nombre">${n}</div><div class="muted">${texte}</div>${plus}</a>`;
  const retard = c.relances.length;
  const plus = c.attente ? `<span class="attend${retard ? " retard" : ""}">${esc(retard ? `dont ${c.attente} en attente, ${retard} sans réponse` : `dont ${c.attente} en attente d'acceptation`)}</span>` : "";
  const ligne = (lien, titre, detail, badge, ton = "") => `<div class="ligne"><span><a href="${lien}"><b>${esc(titre)}</b></a><br><span class="muted">${esc(detail)}</span></span><span class="badge${ton ? " " + ton : ""}">${esc(badge)}</span></div>`;
  const alertes = [
    ...c.echeance.map(x => ligne(versFiche(x.ev), x.ev, `${x.depassee ? `échéance légale dépassée de ${x.jours - DELAI_LEGAL_J} j` : `échéance légale (30 j) dans ${DELAI_LEGAL_J - x.jours} j`} · ${pluriel(x.restants, "article")} pas encore parti${x.restants > 1 ? "s" : ""} · payée il y a ${x.jours} j`, x.depassee ? "Légal : dépassé" : "Légal", x.depassee ? "t-err" : "t-att")),
    ...c.horsDelai.map(x => ligne(versFiche(x.cf), x.cf, `${x.fabricant}${x.atelier ? " (atelier)" : ""} : ${x.jours} j depuis l'envoi, délai convenu ${x.delai} j`, "Hors délai", "t-att")),
    ...c.aReexpedier.map(x => ligne(versFiche(x.ev), x.cf, `pièce chez Evarysth, à contrôler puis réexpédier au client${x.depuis ? ` · depuis le ${dateCourte(x.depuis)}` : ""}`, "À réexpédier", "t-att")),
    ...c.relances.map(r => `<div class="ligne"><span><a href="${versFiche(r.cf)}"><b>${esc(r.cf)}</b></a> · ${esc(r.fabricant)}<br><span class="muted">${r.relance ? `relance 48 h envoyée le ${esc(r.relance)}` : "plus de 48 h sans acceptation, relance au prochain passage"} · envoyée le ${esc(r.depuis)}</span></span><span class="badge">Relance</span></div>`),
    ...c.echecsGen.map(x => `<div class="ligne"><span><a href="${versFiche(x.ev)}"><b>${esc(x.ref)}</b></a><br><span class="muted">génération des fichiers en échec${x.motif ? ` : ${esc(x.motif)}` : ""}</span></span><span class="badge t-err">Fichiers</span></div>`),
    ...c.sansFabricant.map(x => `<div class="ligne"><span><a href="${versFiche(x.ev)}"><b>${esc(x.ev)}</b></a><br><span class="muted">payée le ${esc(x.date)}, toujours sans fabricant</span></span><span class="badge">+ 24 h</span></div>`),
    ...c.coutsManquants.map(x => ligne(versFiche(x.ev), x.cf, "expédiée, coût du fabricant à saisir (marge non calculée)", "Coût")),
    ...sys.map(x => ligne("/admin?vue=systeme", x.titre, x.detail, x.badge, x.tonErr ? "t-err" : "t-att"))
  ];
  return page("Tableau de bord", cadre("tableau", email, bandeau, `<h1>Tableau de bord</h1>
<div class="grille">${tuile(c.aValider, "à valider", "/admin", true)}${tuile(c.aReexpedier.length, "à réexpédier", "/admin", true)}${tuile(c.chez, "chez le fabricant", "/admin?f=fabricant", retard > 0, plus)}${tuile(c.horsDelai.length, "hors délai", "/admin?f=fabricant", true)}${tuile(c.expediees, "expédiées ce mois", "/admin?f=expediees")}${tuile(c.bloquees, "bloquées", "/admin?f=bloquees", true)}</div>
<h2>Alertes</h2><div class="carte">${alertes.join("") || '<p class="muted">Aucune alerte.</p>'}</div>`));
}

/* Décomposition du prix d'une pièce (EVARYSTH.prixDetail, docs/prix.md) : une ligne discrète sous chaque taille */
const DETAIL = [["mat", "Mat"], ["mach", "Mach"], ["vm", "Vm"], ["mo", "MO"], ["emballage", "emballage"], ["fixes", "fixes"],
  ["lancement", "lancement"], ["prelevements", "prélèvements"]];
function decomposition(p, values) {
  const d = EVARYSTH.prixDetail(p, values);
  if (!d) return "";
  const e = n => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `<p class="muted" style="margin:0 0 6px">${Math.round(d.masse_g)} g, ${e(d.heures)} h · ${DETAIL.map(([k, l]) => `${l} ${e(d[k])}`).join(" + ")}`
    + ` = ${e(d.V + d.lancement + d.prelevements)} € → ${d.prix} €${d.filiere === "externe" ? " · provisoire (devis à venir)" : ""}</p>`;
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
      let presents = 0;
      const tailles = ((p.variants || {}).options || []).map(o => {
        let etatStl = "";
        if (cles) {
          const ok = EXTENSIONS.some(x => cles.has(`${p.id}/${segmentTaille(o.label)}.${x}`));
          total++; if (!ok) manquants++; else presents++;
          etatStl = ok ? '<span class="badge present">STL présent</span>' : '<span class="badge manque">STL manquant</span>';
        }
        return `<div class="ligne"><span>${esc(o.label)} <span class="muted">${esc(o.hint || "")}</span> · ${prix(EVARYSTH.priceFor(p, "standard", o.values))}</span>${etatStl}</div>`
          + decomposition(p, o.values);
      });
      const externe = EVARYSTH.matierePrix(p).filiere === "externe" ? " · provisoire (devis à venir)" : "";
      const sm = p.custom ? `Sur-mesure, même calcul que les tailles${externe} : ${(p.custom.params || []).map(x => `${esc(x.label)} ${x.min}–${x.max} mm`).join(" ; ")}` : "";
      const stl = cles ? `<span class="badge ${presents === tailles.length ? "present" : "manque"}">STL ${presents}/${tailles.length}</span>` : "";
      return `<details><summary><span class="nom">${esc(p.name)}</span>${stl}<span class="resume">dès ${prix(EVARYSTH.prixDes(p))}</span></summary><div class="detail">
<p class="muted">${esc(p.id)} · <a href="${SITE}/produits/${encodeURIComponent(p.id)}/" target="_blank" rel="noopener noreferrer">fiche ↗</a></p>
<p class="muted">${(p.colors || []).map(c => `<span class="pastille" style="background:${/^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : "#ccc"}"></span>${esc(c.label)}`).join(" · ")}</p>
<p class="muted">${esc((p.variants || {}).label || "Tailles")}</p>${tailles.join("")}${sm ? `<p class="muted" style="margin-top:8px">${sm}</p>` : ""}</div></details>`;
    });
    return produits.length ? `<h2>${esc(u.name)}</h2><div class="carte liste">${produits.join("")}</div>` : "";
  });
  const resume = erreurR2 || (cles ? `${pluriel(total - manquants, "fichier")} STL présent${total - manquants > 1 ? "s" : ""} sur ${total} tailles standard.` : "Binding R2 « STL » absent : présence des STL non vérifiable.");
  return page("Catalogue", cadre("catalogue", email, bandeau, `<h1>${pluriel(EVARYSTH.products.length, "produit")}</h1>
<div class="carte"><p class="muted">${esc(resume)}</p></div>${parUnivers.join("")}`));
}

/* Aide des voyants de Système : texte affiché en touchant le « ? » (élément details, sans script) */
const AIDE = {
  "Google Sheet": "Le tableau Google où sont enregistrées toutes les commandes. Vert : le site le lit et l'écrit. Rouge : plus aucune commande n'est enregistrée ni affichée ici ; réglage des secrets Google à refaire dans Cloudflare.",
  "Brevo (e-mails)": "Le service qui envoie les e-mails (client, fabricant, relances). Rouge : aucun e-mail ne part ; ils seront renvoyés automatiquement une fois réparé. La clé Brevo expire après 90 jours sans aucun envoi.",
  "HMAC (liens signés)": "La clé secrète qui protège les liens des e-mails (boutons du fabricant, téléchargement des fichiers) : personne ne peut fabriquer un faux lien. Rouge : ces liens ne fonctionnent plus.",
  "R2 (fichiers)": "Le stockage Cloudflare des fichiers d'impression (STL des tailles standard et fichiers fabriqués pour chaque commande). Vert : lisible. Rouge : les liens de fichiers ne répondent pas ; réessayer un peu plus tard.",
  "Paiement": "Mode du paiement Stripe. Orange en mode test : normal tant que les ventes sont fermées (aucun vrai paiement). Vert : ventes ouvertes, vrais paiements. Rouge : clé Stripe absente ou du mauvais mode.",
  "Tâche planifiée": "Le programme automatique qui passe toutes les 10 minutes : e-mails d'expédition, relances 48 h, renvoi des e-mails ratés, nouvel essai des fichiers. Vert : passé il y a moins de 30 min. Orange : en retard ou avec erreurs ; « Lancer la tâche maintenant » ci-dessous.",
  "Fabrication automatique": "La fabrication des fichiers d'impression à chaque commande payée (GitHub les prépare en 1 minute environ, rangés dans R2). Vert : réglages présents. Orange : éteinte, les commandes arrivent sans fichiers et il faut coller un lien STL.",
  "Jeton GitHub": "La clé qui permet au site de demander la fabrication des fichiers à GitHub. Elle a une date d'expiration : orange 30 jours avant, il faut alors en créer une nouvelle et la coller dans Cloudflare (secret GH_ACTIONS_TOKEN, guide des réglages de fabrication, étape 6). Rouge : expirée ou refusée, plus aucun fichier n'est fabriqué.",
  "Clé Brevo": "Un appel de maintien est fait chaque jour (sans envoyer d'e-mail) pour que la clé Brevo n'expire pas : elle expire après 90 jours sans aucun appel. Vert : appel réussi dans les 36 dernières heures. Rouge : Brevo refuse l'appel, lire son message. HTTP 401 : clé inconnue ou expirée, créer une nouvelle clé API et la coller dans Cloudflare (secret BREVO_API_KEY). HTTP 403 : clé reconnue mais sans le droit de lire le compte (clé « Restreint ») : dans Brevo, SMTP et API, Clés API, donner à la clé la lecture du « Compte » en plus de l'envoi d'e-mails.",
  "Sauvegarde du Sheet": "Une copie de tous les onglets du Sheet (fichiers CSV lisibles dans Excel ou Sheets) est rangée chaque semaine dans R2, 12 semaines gardées. Vert : copie de moins de 8 jours. Orange : en retard ou jamais faite. Rouge : la dernière tentative a échoué ; « Sauvegarder maintenant » pour réessayer.",
  "Ventes": "Interrupteur des ventes. En pause, le bouton Commander du site affiche votre message au lieu d'ouvrir le paiement ; un paiement déjà commencé est tout de même enregistré. Utile en vacances ou si un fabricant est indisponible.",
  "Dernière fabrication": "La fabrication de fichiers la plus récente, toutes commandes confondues (son n° d'article est affiché). Vert : elle a réussi. Rouge : elle a échoué ; ouvrir la commande concernée dans /admin (motif, « Relancer la génération ») ou le run sur GitHub. Les autres commandes ont leur propre état dans leur fiche."
};

/* Système : un voyant par brique (aucune valeur de secret affichée), dernier passage de la tâche, lancement manuel */
async function vueSysteme(env, email, bandeau) {
  const live = env.CHECKOUT_MODE === "live", k = env.STRIPE_SECRET_KEY || "";
  const cleOk = live ? /^(sk|rk)_live_/.test(k) : /^(sk|rk)_test_/.test(k);
  const passage = googleConfigure(env) ? await lirePassage(env) : null;
  const age = passage ? Date.now() - passage.t : Infinity;
  /* Voyant : ligne entière à toucher pour afficher l'aide (« ? ») ; sans aide, ligne simple */
  const v = (etat, nom, detail) => {
    const aide = AIDE[nom.split(" :")[0]];
    const ligne = `<span><span class="voyant v-${etat}"></span>${nom}${aide ? '<span class="q" aria-hidden="true">?</span>' : ""}</span><span class="muted">${esc(detail)}</span>`;
    return aide ? `<details class="aide"><summary class="ligne" title="À quoi sert cet indicateur ?">${ligne}</summary><p class="aide-texte">${esc(aide)}</p></details>`
      : `<div class="ligne">${ligne}</div>`;
  };
  /* R2 : une vraie lecture (liste d'une clé du dossier des commandes), pas seulement la présence du binding */
  let r2 = { etat: "att", detail: "binding STL absent" };
  if (env.STL && typeof env.STL.list === "function") {
    try { await env.STL.list({ prefix: "commandes/", limit: 1 }); r2 = { etat: "ok", detail: "bucket lisible" }; }
    catch (e) { console.error("R2", e.message); r2 = { etat: "err", detail: "R2 ne répond pas" }; }
  }
  const briques = [
    v(googleConfigure(env) ? "ok" : "err", "Google Sheet", googleConfigure(env) ? "secrets présents" : "GOOGLE_SA_EMAIL, GOOGLE_SA_KEY ou SHEET_ID manquant"),
    v(env.BREVO_API_KEY && env.ORDER_EMAIL ? "ok" : "err", "Brevo (e-mails)", env.BREVO_API_KEY && env.ORDER_EMAIL ? "secrets présents" : "BREVO_API_KEY ou ORDER_EMAIL manquant"),
    v(jetonConfigure(env) ? "ok" : "err", "HMAC (liens signés)", jetonConfigure(env) ? "secret présent" : "HMAC_SECRET manquant"),
    v(r2.etat, "R2 (fichiers)", r2.detail),
    v(cleOk ? (live ? "ok" : "att") : "err", `Paiement : mode ${live ? "live" : "test"}`, cleOk ? (live ? "ventes ouvertes" : "clé de test conforme") : "clé Stripe absente ou d'un autre mode")
  ];
  const tache = v(passage ? (age < 30 * 60_000 && passage.ok ? "ok" : "att") : "err", "Tâche planifiée",
    passage ? `${dateParis(new Date(passage.t))}${passage.ok ? "" : " (avec erreurs)"}` : "aucun passage noté");
  const csrf = await jetonCsrf(env, email);
  /* Entretien : maintien de la clé Brevo, sauvegarde du Sheet (R2), pause des ventes (systeme.js) */
  const sb = await lireEtatR2(env, CLES.brevo), ss = await lireEtatR2(env, CLES.sauvegarde), pause = await lirePause(env);
  const ageH = t => (Date.now() - t) / 3600_000;
  const brevo = !env.BREVO_API_KEY ? v("err", "Clé Brevo", "BREVO_API_KEY manquant")
    : !r2Disponible(env) ? v("att", "Clé Brevo", "maintien inactif (R2 absent)")
    : !sb ? v("att", "Clé Brevo", "pas encore d'appel de maintien (premier passage sous 10 min)")
    : !sb.ok ? v("err", "Clé Brevo", `appel du ${dateParis(new Date(sb.t))} en échec : ${sb.detail || "?"}`)
    : v(ageH(sb.t) < 36 ? "ok" : "att", "Clé Brevo", `maintenue le ${dateParis(new Date(sb.t))}`);
  const sauve = !googleConfigure(env) || !r2Disponible(env) ? v("att", "Sauvegarde du Sheet", "inactive (secrets Google ou R2 absents)")
    : !ss ? v("att", "Sauvegarde du Sheet", "pas encore de sauvegarde (première sous 10 min)")
    : !ss.ok ? v("err", "Sauvegarde du Sheet", `tentative du ${dateParis(new Date(ss.t))} en échec : ${ss.detail || "?"}`)
    : v(ageH(ss.tOk || ss.t) < 8 * 24 ? "ok" : "att", "Sauvegarde du Sheet", `${dateParis(new Date(ss.tOk || ss.t))} · ${pluriel(ss.onglets || 0, "onglet")}, ${ss.lignes || 0} lignes`);
  const ventes = v(pause.active ? "att" : (live ? "ok" : "att"), "Ventes", pause.active ? `en pause depuis le ${pause.depuis}` : live ? "ouvertes" : "mode test (fermées au public)");
  const champCsrf = `<input type="hidden" name="csrf" value="${esc(csrf)}">`;
  const blocVentes = pause.active
    ? `<p class="muted">Message affiché dans le panier : « ${esc(pause.message)} »</p><form method="post" action="/admin/pause">${champCsrf}<input type="hidden" name="etat" value="ouvrir"><button type="submit">Rouvrir les ventes</button></form>`
    : `<form method="post" action="/admin/pause">${champCsrf}<input type="hidden" name="etat" value="pause"><label for="msg-pause">Message affiché dans le panier <span class="muted">(facultatif)</span></label>
<input id="msg-pause" name="message" maxlength="240" autocomplete="off" placeholder="${esc(MESSAGE_PAUSE)}"><button class="danger" type="submit">Mettre les ventes en pause</button></form>`;
  /* Chaîne de fabrication : configuration, jeton GitHub (expiration lue dans l'en-tête de réponse, alerte à J-30), dernier run */
  const fab = [];
  if (!fabricationConfiguree(env)) fab.push(v("att", "Fabrication automatique", "éteinte : GH_ACTIONS_TOKEN ou FABRICATION_HMAC manquant"));
  else {
    const gh = await etatGitHub(env);
    const jours = gh.expiration ? Math.floor((gh.expiration.getTime() - Date.now()) / 86400_000) : null;
    fab.push(v("ok", "Fabrication automatique", "secrets présents"));
    fab.push(gh.erreur ? v("err", "Jeton GitHub", gh.erreur)
      : v(jours == null ? (gh.expiration === null ? "att" : "ok") : jours < 0 ? "err" : jours <= 30 ? "att" : "ok", "Jeton GitHub",
        jours == null ? (gh.expiration === null ? "date d'expiration illisible" : "sans date d'expiration") : jours < 0 ? `expiré le ${dateCourte(gh.expiration.toISOString())}`
          : `expire le ${dateCourte(gh.expiration.toISOString())} (dans ${pluriel(jours, "jour")}${jours <= 30 ? " : à renouveler" : ""})`));
    if (!gh.erreur) {
      const x = gh.run, ok = x && x.conclusion === "success", cours = x && x.statut !== "completed";
      fab.push(v(!x ? "att" : ok ? "ok" : cours ? "att" : "err", "Dernière fabrication",
        x ? `${x.titre} · ${dateCourte(x.date)} à ${x.date.slice(11, 16)} UTC · ${cours ? "en cours" : ok ? "réussie" : `échec (${x.conclusion || "?"})`}` : "aucun run"));
      if (x && x.url) fab.push(`<p class="muted"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Voir le run sur GitHub ↗</a></p>`);
    }
  }
  return page("Système", cadre("systeme", email, bandeau, `<h1>Système</h1>
<div class="carte">${briques.join("")}</div>
<h2>Fabrication</h2><div class="carte">${fab.join("")}</div>
<h2>Entretien</h2><div class="carte">${brevo}${sauve}<form method="post" action="/admin/sauvegarde" style="margin-top:8px">${champCsrf}<button class="second" type="submit">Sauvegarder maintenant</button></form>
${ss && ss.ok ? '<p class="muted" style="margin-top:8px"><a href="/admin/sauvegarde.zip">Télécharger la dernière sauvegarde (zip de fichiers CSV)</a></p>' : ""}</div>
<h2>Ventes</h2><div class="carte">${ventes}${blocVentes}</div>
<h2>Tâche planifiée</h2><div class="carte">${tache}<p class="muted" style="margin-top:8px">Toutes les 10 min : e-mails d'expédition, relances 48 h, renvois en échec, Journal.</p>
<form method="post" action="/admin/tache"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">Lancer la tâche maintenant</button></form></div>`));
}

/* POST /admin/tache : même code que le cron, bilan en bandeau sur l'onglet Système */
async function tacheMaintenant(env) {
  await entretien(env, Date.now(), { forcerBrevo: true });  /* clé Brevo revérifiée tout de suite, sauvegarde si due (ne lève jamais) */
  const b = await lancerTache(env);
  if (b.inactive) return redirection(env, "Secrets Google absents : rien à vérifier.", "err", "systeme");
  if (b.erreur) return redirection(env, `Sheet indisponible : ${b.erreur}`, "err", "systeme");
  const n = x => (Array.isArray(x) ? x.length : 0);
  const texte = `Tâche faite : ${n(b.attribuees)} n° CF, ${n(b.notifiees)} statut(s) traité(s), ${n(b.commandes)} statut(s) EV recalculé(s), ${n(b.relances)} relance(s), ${n(b.attente)} en attente, ${n(b.erreurs)} erreur(s).`
    + (n(b.erreurs) ? " " + b.erreurs.slice(0, 3).join(" ; ") : "");
  return redirection(env, texte, n(b.erreurs) ? "err" : "ok", "systeme");
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

/* Bandeau après une action : message daté et signé, valable 2 min, affiché une seule fois */
const FLASH_S = 120, COOKIE_FLASH = "admin_flash";
const signerFlash = (env, { vue, q = "", m, t, ts }) => signature(env.HMAC_SECRET, `flash|${vue}|${q ? q + "|" : ""}${t}|${ts}|${m}`);
async function redirection(env, message, type = "ok", vue = "", q = "") {
  const f = { vue, q, m: message.slice(0, 300), t: type === "err" ? "err" : "ok", ts: String(Math.floor(Date.now() / 1000)) };
  const params = new URLSearchParams({ ...(vue ? { vue } : {}), ...(q ? { q } : {}), m: f.m, t: f.t, ts: f.ts, s: await signerFlash(env, f) });
  return new Response(null, { status: 303, headers: { Location: `/admin?${params}`, "Cache-Control": "no-store" } });
}
/* → { bandeau, cookie } : bandeau vide si absent, faux, périmé ou déjà affiché (cookie = sa signature) */
export async function lireFlash(env, url, req, vue, maintenant = Date.now()) {
  const p = url.searchParams, s = p.get("s") || "", ts = p.get("ts") || "";
  const f = { vue, q: nettoyer(p.get("q"), 80), m: String(p.get("m") || "").slice(0, 300), t: p.get("t") === "err" ? "err" : "ok", ts };
  const vide = { bandeau: {}, cookie: null };
  if (!s || !/^\d{1,12}$/.test(ts) || !f.m) return vide;
  const age = maintenant / 1000 - Number(ts);
  if (age < -30 || age > FLASH_S) return vide;
  if (!egal(await signerFlash(env, f), s)) return vide;
  const vu = (req.headers.get("Cookie") || "").split(/;\s*/).find(c => c.startsWith(COOKIE_FLASH + "="));
  if (vu && vu.slice(COOKIE_FLASH.length + 1) === s) return vide;
  return { bandeau: { message: nettoyer(f.m, 300), type: f.t },
    cookie: `${COOKIE_FLASH}=${s}; Path=/admin; Max-Age=${FLASH_S}; HttpOnly; Secure; SameSite=Strict` };
}

/* POST /admin/valider */
async function valider(env, email, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const toutes = etat.parEV[numero];
  if (!toutes) return redirection(env, `Commande ${numero} introuvable.`, "err");
  const enAttente = toutes.filter(l => A_ENVOYER.includes(l.statut));
  if (!enAttente.length) return redirection(env, `Commande ${numero} déjà validée.`, "ok", "", numero);

  const saisie = { ev: numero, fab: {}, stl: {} };
  for (const l of enAttente) { saisie.fab[l.n] = nettoyer(f.get(`fab_${l.n}`)); saisie.stl[l.n] = String(f.get(`stl_${l.n}`) ?? "").trim().slice(0, 600); }
  const erreur = message => vueFiche(env, email, etat, numero, { message, type: "err", saisie }, 400);

  /* Contrôles complets avant toute écriture */
  const choisis = [];
  for (const l of enAttente) {
    const fab = saisie.fab[l.n];
    if (!fab) continue;
    const ficheFab = etat.fabs[fab];
    if (!ficheFab) return erreur(`Article ${l.n} : fabricant « ${fab} » inconnu (onglet Fabricants).`);
    if (!ficheFab.manuel && !/@/.test(ficheFab.email)) return erreur(`Article ${l.n} : le fabricant « ${fab} » n'a pas d'e-mail (onglet Fabricants ; ou « manuel » dans sa colonne Envoi).`);
    if (ficheFab.atelier && !atelierPossible(l.article))
      return erreur(`Article ${l.n} : l'atelier n'imprime que ${MATIERES_ATELIER.map(MAT).join(" et ")} (matière ${MAT(matiereArticle(l.article))}) : choisissez un fabricant externe.`);
    const lien = lienValide(saisie.stl[l.n]);
    if (lien === null) return erreur(`Article ${l.n} : le lien STL doit être une adresse https:// complète.`);
    /* Fichiers générés à la commande : « prete » obligatoire, sauf lien STL saisi à la main */
    if (!lien && !l.stl.trim() && etat.generation && l.gen.statut && l.gen.statut !== GEN.prete)
      return erreur(`Article ${l.n} : fichiers pas encore prêts (${(LIB_GEN[l.gen.statut] || l.gen.statut).toLowerCase()}${l.gen.motif ? ` : ${l.gen.motif}` : ""}). Attendez, relancez la génération ou saisissez un lien STL.`);
    if (!lien && !l.stl.trim() && l.gen.statut !== GEN.prete && !await fichierStandardDispo(env, l.article))
      return erreur(`Article ${l.n} : indiquez le lien du fichier STL (obligatoire).`);
    choisis.push({ l, fab, lien: lien || l.stl.trim() });
  }
  if (!choisis.length) return erreur("Choisissez le fabricant d'au moins un article.");

  /* N° CF (même règle que la tâche planifiée), puis écriture : fabricant, lien, n° CF, statut envoyee_fabricant
     (fabricant « manuel » : directement acceptee, rien à notifier, le propriétaire transmet la fiche lui-même) */
  for (const c of choisis) c.l.fabricant = c.fab;
  const voulu = numerosCF(numero, toutes, cfsRendues(etat.journal));
  for (const c of choisis) {
    c.ancien = c.l.notifie || c.l.statut;
    c.l.cf = voulu[toutes.indexOf(c.l)];
    c.manuel = etat.fabs[c.fab].manuel;
    const s = c.manuel ? ACCEPTEE : ENVOYE;
    await majArticle(env, numero, c.l.n, { Fabricant: c.fab, "Lien STL": c.lien, "Commande CF": c.l.cf, Statut: s, ...(c.manuel ? { "Dernier statut notifié": s } : {}) });
    c.l.stl = c.lien; c.l.statut = s;
  }

  /* E-mail fabricant, un par CF, tout de suite */
  const groupes = new Map();
  for (const c of choisis) { if (!groupes.has(c.l.cf)) groupes.set(c.l.cf, []); groupes.get(c.l.cf).push(c); }
  const ok = [], attente = [];
  for (const [cf, cs] of groupes) {
    if (cs[0].manuel) {
      await journaliserSiNouveau(env, etat.journal, cf, cs[0].ancien, ACCEPTEE, "proprietaire");
      ok.push(`${cf} confiée à ${cs[0].fab} (envoi manuel : fiche à transmettre sur la commande)`);
      continue;
    }
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
  return redirection(env, texte, attente.length ? "err" : "ok", "", numero);
}

/* POST /admin/generation : relance des fichiers d'un article pas encore envoyé (même SHA, ou SHA actuel avec confirmation) */
async function generation(env, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev")), n = nettoyer(f.get("n"), 4), actuel = f.get("mode") === "actuel";
  const l = (etat.parEV[numero] || []).find(x => x.n === n);
  if (!l) return redirection(env, `Article ${n} de ${numero} introuvable.`, "err", "", numero);
  if (!A_ENVOYER.includes(l.statut) && !debloquable(l, etat.journal)) return redirection(env, `Article ${n} : déjà envoyé ou clos, fichiers inchangés.`, "err", "", numero);
  if (actuel && f.get("confirmer") !== "oui") return redirection(env, "Cochez « Je confirme » pour régénérer au SHA actuel.", "err", "", numero);
  if (!actuel && l.gen.statut === GEN.prete) return redirection(env, `Article ${n} : fichiers déjà prêts.`, "ok", "", numero);
  let r;
  try { r = await relancerArticle(env, { numero, n, ligne: l.ligne, sid: (etat.evs[numero] || {}).sid, shaLigne: l.gen.sha }, { actuel }); }
  catch (e) { console.error("Admin : relance", numero, n, e.message); return redirection(env, `Article ${n} : relance impossible (${e.message}).`, "err", "", numero); }
  await journaliser(env, { numero: refArticle(numero, n), ancien: actuel ? `SHA ${String(l.gen.sha || "?").slice(0, 12)}` : l.gen.statut,
    nouveau: actuel ? "regeneree_sha_actuel" : "generation_relancee", auteur: "proprietaire" });
  const quoi = actuel ? `régénération au SHA ${r.sha.slice(0, 12)}` : "génération relancée";
  return redirection(env, r.ok ? `Article ${n} : ${quoi}, fichiers dans 1 minute environ (actualisez).`
    : `Article ${n} : ${quoi}, mais GitHub a refusé le lancement (${r.motif}). Nouvel essai automatique sous 10 min.`, r.ok ? "ok" : "err", "", numero);
}

/* POST /admin/bloquer : articles pas encore envoyés → incident */
async function bloquer(env, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const ls = (etat.parEV[numero] || []).filter(l => A_ENVOYER.includes(l.statut));
  if (!ls.length) return redirection(env, `Commande ${numero} : rien à bloquer.`, "err", "", numero);
  for (const l of ls) {
    await majArticle(env, numero, l.n, { Statut: INCIDENT, "Dernier statut notifié": INCIDENT });
    await journaliserSiNouveau(env, etat.journal, l.cf || numero, l.statut, INCIDENT, "proprietaire");
  }
  return redirection(env, `Commande ${numero} bloquée (${ls.length} article${ls.length > 1 ? "s" : ""}).`, "ok", "", numero);
}

/* POST /admin/debloquer : articles bloqués jamais envoyés → a_valider (fichier connu) ou lien_stl_a_indiquer */
async function debloquer(env, f) {
  const etat = await lireEtat(env);
  const numero = nettoyer(f.get("ev"));
  const ls = (etat.parEV[numero] || []).filter(l => debloquable(l, etat.journal));
  if (!ls.length) return redirection(env, `Commande ${numero} : rien à débloquer.`, "err", "", numero);
  for (const l of ls) {
    const s = l.stl.trim() || await fichierStandardDispo(env, l.article) ? A_VALIDER : STL_A_INDIQUER;
    await majArticle(env, numero, l.n, { Statut: s, "Dernier statut notifié": s });
    await journaliserSiNouveau(env, etat.journal, l.cf || numero, INCIDENT, s, "proprietaire");
  }
  return redirection(env, `Commande ${numero} débloquée : à valider.`, "ok", "", numero);
}

/* POST /admin/cloturer : annulee (articles pas encore expédiés) ou remboursee (tous ceux pas encore clos) ; aucun e-mail */
async function cloturer(env, f) {
  const numero = nettoyer(f.get("ev")), statut = f.get("statut");
  const retour = (m, t = "ok") => redirection(env, m, t, "", numero);
  if (!CLOS.includes(statut)) return retour("Action inconnue.", "err");
  const coches = new Set(f.getAll("art").map(x => nettoyer(x, 10)));
  if (!coches.size) return retour("Cochez au moins un article : rien n'a été modifié.", "err");
  if (f.get("confirmer") !== "oui") return retour("Cochez « Je confirme » : rien n'a été modifié.", "err");
  const etat = await lireEtat(env);
  const cibles = (etat.parEV[numero] || []).filter(l => coches.has(l.n));
  const ls = (statut === "annulee" ? annulables : remboursables)(cibles);
  const exclus = cibles.filter(l => !ls.includes(l));
  if (!cibles.length || exclus.length) return retour(!cibles.length ? `Commande ${numero} : rien à modifier.`
    : `Article ${exclus.map(l => l.n).join(", ")} : ${statut === "annulee" && exclus.every(l => PARTIS.includes(l.statut))
      ? "déjà expédié, il ne peut plus être annulé (seulement marqué remboursé)" : "déjà clos"}. Rien n'a été modifié.`, "err");
  for (const l of ls) {
    await majArticle(env, numero, l.n, { Statut: statut, "Dernier statut notifié": statut });
    await journaliserSiNouveau(env, etat.journal, l.cf || numero, l.statut, statut, "proprietaire");
  }
  const chez = [...new Set(ls.filter(l => l.cf && [ENVOYE, "acceptee"].includes(l.statut)).map(l => `${l.cf} (${l.fabricant.trim() || "fabricant"})`))];
  return retour(`Commande ${numero} : ${pluriel(ls.length, "article")} ${statut === "annulee" ? "annulé" : "marqué remboursé"}${ls.length > 1 ? "s" : ""} (${ls.map(l => l.n).join(", ")}).`
    + (chez.length ? ` Prévenez le fabricant : ${chez.join(", ")} (ses liens Accepter / Expédier n'ont plus d'effet).` : "")
    + (statut === "annulee" ? " Remboursement éventuel : à faire dans Stripe." : ""));
}

/* POST /admin/renvoyer : renvoie l'e-mail dû pour une CF (même contenu que l'envoi d'origine), statut inchangé */
async function renvoyer(env, f) {
  const numero = nettoyer(f.get("ev")), cf = nettoyer(f.get("cf"));
  const etat = await lireEtat(env);
  const toutes = etat.parEV[numero] || [];
  const g = cfsRenvoyables(toutes).find(x => x.cf === cf);
  if (!g) return redirection(env, `${cf || "Commande"} : aucun e-mail à renvoyer pour ce statut.`, "err", "", numero);
  if (g.statut === ENVOYE && (etat.fabs[g.lignes[0].fabricant.trim()] || {}).manuel) return redirection(env, `${cf} : fabricant en envoi manuel, aucun e-mail à lui envoyer.`, "err", "", numero);
  const r = await envoyerSelonStatut(env, { ...g, numero: cf, ev: numero }, etat.evs[numero] || { numero, client: "", sid: "" }, toutes, etat.fabs)
    .catch(e => { console.error("Admin : renvoi", cf, e.message); return "e-mail non parti, réessayez"; });
  if (r !== true) return redirection(env, `${cf} : e-mail non renvoyé (${r}).`, "err", "", numero);
  return redirection(env, `${cf} : e-mail ${g.statut === ENVOYE ? "renvoyé au fabricant" : "d'expédition renvoyé au client"} ✓`, "ok", "", numero);
}

/* n° CF d'une commande client (formulaire) : null si mal formé ou d'une autre commande */
const cfDe = (f, numero) => { const cf = nettoyer(f.get("cf")); return /^CF-\d{4}-\d+-[A-Z]+$/.test(cf) && evDeCF(cf) === numero ? cf : null; };

/* POST /admin/accepter : le fabricant a accepté autrement que par son lien */
async function accepterAdmin(env, f) {
  const numero = nettoyer(f.get("ev")), cf = cfDe(f, numero);
  if (!cf) return redirection(env, "Commande fournisseur inconnue.", "err", "", numero);
  const ls = await majLignesCF(env, cf, [ENVOYE], { Statut: ACCEPTEE });
  if (!ls.length) return redirection(env, `${cf} : rien à accepter (déjà acceptée, expédiée ou retirée).`, "err", "", numero);
  await journaliser(env, { numero: cf, ancien: ENVOYE, nouveau: ACCEPTEE, auteur: "proprietaire" });
  return redirection(env, `${cf} marquée acceptée ✓`, "ok", "", numero);
}

/* POST /admin/expedier : expédition déclarée à la place du fabricant (ou par l'atelier). Trois cas, décidés ici d'après le
   statut de la CF et la fiche du fabricant (jamais d'après le formulaire) :
   - fabricant qui ne livre pas le client, pièce pas encore chez Evarysth : pièce « expédiée à Evarysth » → a_reexpedier,
     transporteur et suivi facultatifs (gardés dans Notes), aucun e-mail au client ;
   - pièce à réexpédier (a_reexpedier), ou fabricant qui livre le client (ou atelier) : colis au client → expediee, transporteur
     obligatoire, e-mail client tout de suite, sinon la tâche planifiée le renvoie (Dernier statut notifié en retard). */
async function expedierAdmin(env, f) {
  const numero = nettoyer(f.get("ev")), cf = cfDe(f, numero);
  if (!cf) return redirection(env, "Commande fournisseur inconnue.", "err", "", numero);
  const transporteur = nettoyer(f.get("transporteur")), suivi = nettoyer(f.get("suivi"), 80);
  const transporteurs = transporteur ? await lireTransporteurs(env) : [];
  if (transporteur && !transporteurs.includes(transporteur)) return redirection(env, `${cf} : choisissez un transporteur dans la liste.`, "err", "", numero);
  const avant = await lireEtat(env);
  const lignesCF = (avant.parEV[numero] || []).filter(l => l.cf === cf);
  const fab = avant.fabs[(lignesCF[0] || { fabricant: "" }).fabricant.trim()];
  const entrant = !lignesCF.some(l => l.statut === A_REEXPEDIER) && passeParAtelier(fab) && lignesCF.some(l => RETIRABLES.includes(l.statut));

  if (entrant) {
    const ls = await majLignesCF(env, cf, RETIRABLES, { Statut: A_REEXPEDIER });
    if (!ls.length) return redirection(env, `${cf} : rien à expédier (déjà expédiée, retirée ou annulée).`, "err", "", numero);
    await journaliser(env, { numero: cf, ancien: ls.some(l => l.statut === ENVOYE) ? ENVOYE : ACCEPTEE, nouveau: A_REEXPEDIER, auteur: "proprietaire" });
    const colis = [transporteur, suivi].filter(Boolean).join(" · ");
    await ajouterNote(env, cf, `${cf} expédiée par ${fab ? lignesCF[0].fabricant.trim() : "le fabricant"} à l'atelier Evarysth${colis ? ` (${colis})` : ""} : à contrôler puis réexpédier au client`)
      .catch(e => console.warn("Notes : envoi à l'atelier non noté", e.message));
    return redirection(env, `${cf} : pièce en route vers l'atelier. Aucun e-mail au client ; il sera prévenu quand vous la réexpédierez (« à réexpédier » dans la commande).`, "ok", "", numero);
  }

  if (!transporteur) return redirection(env, `${cf} : choisissez un transporteur dans la liste.`, "err", "", numero);
  const ls = await majLignesCF(env, cf, [...RETIRABLES, A_REEXPEDIER], { Transporteur: transporteur, "N° de suivi": suivi, Statut: "expediee" });
  if (!ls.length) return redirection(env, `${cf} : rien à expédier (déjà expédiée, retirée ou annulée).`, "err", "", numero);
  const ancien = ls.some(l => l.statut === A_REEXPEDIER) ? A_REEXPEDIER : ls.some(l => l.statut === ENVOYE) ? ENVOYE : ACCEPTEE;
  await journaliser(env, { numero: cf, ancien, nouveau: "expediee", auteur: "proprietaire" });
  /* E-mail client : même groupe que la tâche planifiée (lignes de la CF, avec le suivi) */
  const etat = await lireEtat(env);
  const lignes = (etat.parEV[numero] || []).filter(l => l.cf === cf && l.statut === "expediee");
  let envoi;
  try { envoi = lignes.length ? await envoyerSelonStatut(env, { cf, numero: cf, ev: numero, statut: "expediee", lignes }, etat.evs[numero] || { numero, client: "", sid: "" }, etat.parEV[numero], etat.fabs) : "lignes relues introuvables"; }
  catch (e) { console.error("Admin : expédition", cf, e.message); envoi = "e-mail non parti"; }
  if (envoi === true) {
    for (const l of lignes) await majArticle(env, numero, l.n, { "Dernier statut notifié": "expediee" });
    return redirection(env, `${cf} expédiée (${transporteur}${suivi ? " · " + suivi : ""}) ; client prévenu ✓`, "ok", "", numero);
  }
  return redirection(env, `${cf} expédiée ; e-mail client en attente (${envoi}), renvoi automatique sous 10 min.`, "err", "", numero);
}

/* POST /admin/couts : coût du fabricant et frais d'envoi d'une CF (€, TTC) ; case vide = pas de montant */
const montantSaisi = v => {
  const t = nettoyer(v, 12).replace(/\s/g, "").replace(",", ".");
  if (t === "") return { valeur: null };
  return /^\d{1,6}(\.\d{1,2})?$/.test(t) ? { valeur: Number(t) } : { erreur: true };
};
async function coutsAdmin(env, f) {
  const numero = nettoyer(f.get("ev")), cf = cfDe(f, numero);
  if (!cf) return redirection(env, "Commande fournisseur inconnue.", "err", "", numero);
  const cout = montantSaisi(f.get("cout")), envoi = montantSaisi(f.get("envoi"));
  if (cout.erreur || envoi.erreur) return redirection(env, `${cf} : montants invalides (ex. 12,50 ; 6 chiffres au plus, 2 décimales). Rien n'a été modifié.`, "err", "", numero);
  if (!await noterCouts(env, cf, { cout: cout.valeur, envoi: envoi.valeur })) return redirection(env, "Colonnes « Coût fabricant (€) » et « Frais d'envoi (€) » absentes de l'onglet Commandes CF.", "err", "", numero);
  return redirection(env, `${cf} : coûts enregistrés (${cout.valeur == null ? "pas de coût fabricant" : euros(cout.valeur)}${envoi.valeur == null ? "" : ` · envoi ${euros(envoi.valeur)}`}) ✓`, "ok", "", numero);
}

/* POST /admin/reference : n° de commande chez le fournisseur (colonne facultative « Référence externe ») */
async function reference(env, f) {
  const numero = nettoyer(f.get("ev")), cf = cfDe(f, numero), ref = nettoyer(f.get("ref"), 80);
  if (!cf) return redirection(env, "Commande fournisseur inconnue.", "err", "", numero);
  const ls = await majLignesCF(env, cf, null, { [REF_EXTERNE]: ref });
  if (!ls.length) return redirection(env, `${cf} : commande fournisseur introuvable.`, "err", "", numero);
  return redirection(env, ref ? `${cf} : référence externe « ${ref} » enregistrée ✓` : `${cf} : référence externe effacée.`, "ok", "", numero);
}

/* POST /admin/retirer : CF envoyée ou acceptée retirée au fabricant (articles de nouveau à valider), fabricant prévenu */
async function retirer(env, f) {
  const numero = nettoyer(f.get("ev")), cf = nettoyer(f.get("cf")), motif = nettoyer(f.get("motif"), 200);
  if (f.get("confirmer") !== "oui") return redirection(env, "Rien n'a été retiré : cochez « Je confirme ».", "err", "", numero);
  if (!/^CF-\d{4}-\d+-[A-Z]+$/.test(cf) || evDeCF(cf) !== numero) return redirection(env, "Commande fournisseur inconnue.", "err", "", numero);
  const etat = await lireEtat(env);
  const rendu = await rendreCF(env, cf, { auteur: "proprietaire", motif });
  if (!rendu) return redirection(env, `${cf} : rien à retirer (déjà expédiée, retirée ou annulée).`, "err", "", numero);
  const fiche = etat.fabs[rendu.fabricant], test = estTest(env, (etat.evs[numero] || {}).sid);
  let souci = "";
  if (fiche && fiche.manuel) return redirection(env, `${cf} retirée à ${rendu.fabricant} : ${pluriel(rendu.lignes.length, "article")} de nouveau à valider (envoi manuel : prévenez-le si besoin).`, "ok", "", numero);
  if (!env.BREVO_API_KEY || !fiche || !/@/.test(fiche.email)) souci = "fabricant non prévenu (pas d'e-mail ou Brevo non configuré) : prévenez-le";
  else {
    const m = contenuRetrait({ numero: cf, motif, test, piece: rendu.lignes.map(l => l.article).join("\n") });
    try { await envoyerEmail(env, { to: [{ email: fiche.email.trim(), name: rendu.fabricant }], replyTo: { email: env.REPLY_TO || "contact@evarysth.fr", name: "Evarysth" }, subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["retrait", test ? "test" : "live"] }); }
    catch (e) { console.error("Admin : retrait", cf, e.message); souci = "e-mail au fabricant non parti : prévenez-le"; }
  }
  return redirection(env, `${cf} retirée à ${rendu.fabricant || "—"} : ${pluriel(rendu.lignes.length, "article")} de nouveau à valider${souci ? ` ; ${souci}.` : " ; fabricant prévenu ✓"}`, souci ? "err" : "ok", "", numero);
}

/* POST venu de la page elle-même : Origin = celle de la page ; ou, si le navigateur envoie « null » / rien
   (certaines politiques de référent sous Safari), Sec-Fetch-Site = same-origin. Toute autre valeur est refusée. */
/* POST /admin/pause : ouvre ou ferme les ventes (R2, lu par POST /checkout) */
async function pauseAdmin(env, f) {
  const ouvrir = nettoyer(f.get("etat")) === "ouvrir";
  try { await reglerPause(env, { active: !ouvrir, message: nettoyer(f.get("message"), 240) }); }
  catch (e) { return redirection(env, e.message, "err", "systeme"); }
  return redirection(env, ouvrir ? "Ventes rouvertes ✓" : "Ventes en pause : le bouton Commander affiche votre message.", "ok", "systeme");
}

/* POST /admin/sauvegarde : sauvegarde du Sheet tout de suite (même code que le passage hebdomadaire) */
async function sauvegardeAdmin(env) {
  const r = await sauvegarderSheet(env, { force: true });
  if (r.inactif) return redirection(env, "Sauvegarde impossible : secrets Google ou R2 absents.", "err", "systeme");
  if (!r.ok) return redirection(env, `Sauvegarde en échec : ${r.detail || "erreur inconnue"}.`, "err", "systeme");
  return redirection(env, `Sauvegarde faite ✓ (${pluriel(r.onglets, "onglet")}, ${r.lignes} lignes).`, "ok", "systeme");
}

/* GET /admin/sauvegarde.zip : dernière sauvegarde réussie (données clients : jamais mise en cache) */
async function telechargerSauvegarde(env) {
  const z = await derniereSauvegardeZip(env);
  if (!z) return simple("Aucune sauvegarde", "Aucune sauvegarde réussie à télécharger pour l'instant.", 404);
  return new Response(z.octets, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${z.nom}"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

function memeOrigine(req, url) {
  const origine = req.headers.get("Origin"), site = req.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return false;
  if (origine === url.origin) return true;
  return (origine === null || origine === "null") && site === "same-origin";
}

export async function routeAdmin(req, env, url) {
  if (env.ADMIN_HOST && url.host !== env.ADMIN_HOST) return simple("Introuvable", "Page introuvable.", 404);
  if (url.pathname === "/" && req.method === "GET") return new Response(null, { status: 302, headers: { Location: "/admin" } });
  /* Icônes et manifeste : rien de confidentiel, servis sans relire le jeton Access (l'adresse reste derrière Access) */
  const icone = /^\/admin\/([a-z0-9-]+\.(?:svg|png|webmanifest))$/.exec(url.pathname);
  if (icone && req.method === "GET") { const r = ressource(icone[1]); if (r) return r; }
  const route = `${req.method} ${url.pathname}`;
  const routes = ["GET /admin", "POST /admin/valider", "POST /admin/bloquer", "POST /admin/debloquer", "POST /admin/cloturer", "POST /admin/renvoyer", "POST /admin/retirer", "POST /admin/accepter", "POST /admin/expedier", "POST /admin/reference", "POST /admin/couts", "POST /admin/tache", "POST /admin/generation", "POST /admin/pause", "POST /admin/sauvegarde", "GET /admin/sauvegarde.zip"];
  if (!routes.includes(route)) return simple("Introuvable", "Page introuvable.", 404);

  let email;
  try { email = await verifierAcces(req, env); } catch (e) { console.error("Access", e.message); return simple("Erreur temporaire", "Vérification d'accès impossible. Réessayez.", 503); }
  if (!email) return simple("Accès refusé", "Connectez-vous avec le compte autorisé.", 403);
  const vue = req.method === "GET" ? VUES.map(x => x[0]).find(v => v && v === url.searchParams.get("vue")) || "" : "";
  /* Catalogue, Système et Liens restent visibles sans secrets Google (diagnostic) ; HMAC_SECRET toujours requis (jeton CSRF) */
  const sansSheet = ["catalogue", "systeme", "liens"].includes(vue) && !url.searchParams.get("q");
  if ((!sansSheet && !googleConfigure(env)) || !jetonConfigure(env)) return simple("Service indisponible", "Configuration incomplète (secrets Google ou HMAC_SECRET).", 503);

  try {
    if (req.method === "GET" && url.pathname === "/admin/sauvegarde.zip") return await telechargerSauvegarde(env);
    if (req.method === "GET") {
      const { bandeau, cookie } = await lireFlash(env, url, req, vue);
      const q = nettoyer(url.searchParams.get("q"), 80);
      const r = q ? await vueRecherche(env, email, await lireEtat(env), q, bandeau)
        : vue === "tableau" ? await vueTableau(env, email, await lireEtat(env), bandeau)
        : vue === "catalogue" ? await vueCatalogue(env, email, bandeau)
        : vue === "fabricants" ? vueFabricants(email, await lireEtat(env), bandeau)
        : vue === "systeme" ? await vueSysteme(env, email, bandeau)
        : vue === "liens" ? vueLiens(env, email, bandeau)
        : vueCommandes(email, await lireEtat(env), FILTRES.map(x => x[0]).find(x => x === url.searchParams.get("f")) || "traiter", bandeau);
      if (cookie) r.headers.append("Set-Cookie", cookie);
      return r;
    }
    /* POST : même origine (Origin obligatoire), jeton anti-falsification */
    if (!memeOrigine(req, url)) return simple("Requête refusée", "Origine de la requête non reconnue.", 403);
    const f = await req.formData().catch(() => null);
    if (!f || !await csrfValide(env, email, f.get("csrf"))) return redirection(env, "Page expirée : action non faite. Recommencez.", "err");
    if (url.pathname === "/admin/valider") return await valider(env, email, f);
    if (url.pathname === "/admin/bloquer") return await bloquer(env, f);
    if (url.pathname === "/admin/cloturer") return await cloturer(env, f);
    if (url.pathname === "/admin/renvoyer") return await renvoyer(env, f);
    if (url.pathname === "/admin/retirer") return await retirer(env, f);
    if (url.pathname === "/admin/accepter") return await accepterAdmin(env, f);
    if (url.pathname === "/admin/expedier") return await expedierAdmin(env, f);
    if (url.pathname === "/admin/reference") return await reference(env, f);
    if (url.pathname === "/admin/couts") return await coutsAdmin(env, f);
    if (url.pathname === "/admin/tache") return await tacheMaintenant(env);
    if (url.pathname === "/admin/generation") return await generation(env, f);
    if (url.pathname === "/admin/pause") return await pauseAdmin(env, f);
    if (url.pathname === "/admin/sauvegarde") return await sauvegardeAdmin(env);
    return await debloquer(env, f);
  } catch (e) {
    /* Journal : code Google (429 = quota, 5xx = raté de Google, 0 = réseau) ou erreur de programme */
    console.error("Admin", req.method, url.pathname, e instanceof ErreurGoogle ? `Google ${e.statut ?? "-"}` : "erreur interne", e.message);
    if (req.method !== "GET") return simple("Erreur temporaire", "Le Sheet n'a pas répondu. Actualisez la page pour voir ce qui a été enregistré avant de recommencer.", 503);
    if (!(e instanceof ErreurGoogle)) return simple("Erreur inattendue", "La page n'a pas pu être construite. Actualisez ; si l'erreur persiste, elle est dans le journal du Worker.", 500);
    return simple("Erreur temporaire", e.statut === 429
      ? "Trop de lectures du Sheet en une minute. Patientez une minute, puis actualisez la page."
      : "Google Sheets n'a pas répondu. Actualisez la page dans un instant.", 503);
  }
}
