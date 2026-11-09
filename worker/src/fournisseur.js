/* Liens fournisseur (bloc C) : GET /f/<jeton> affiche une page avec un bouton, sans rien modifier
   (les robots de messagerie ouvrent les liens) ; POST /f/<jeton> revérifie le jeton et applique la seule transition prévue.
   Le jeton porte un n° de commande fournisseur (CF-AAAA-NNNN-X) : l'action s'applique à toutes les lignes de
   l'onglet « Commandes CF » qui portent ce n°, retrouvées par la colonne « Commande CF », jamais par leur position. */
import { ecrireCellule, entetes, ErreurGoogle, googleConfigure, lireColonnes } from "./google.js";
import { ErreurJeton, jetonConfigure, verifierJeton } from "./jeton.js";
import { A_REEXPEDIER, ajouterNote, CF, FABRICANTS, JOURNAL, journaliser, ONGLET_CF, passeParAtelier, refusDe, rendreCF, REFUSEE, RETIRABLES } from "./sheet.js";
import { estAtelier } from "./planifie.js";
import { contenuRefus, envoyerEmail } from "./email.js";

/* E-mail au propriétaire après un refus (le refus est déjà enregistré : un échec d'envoi est seulement journalisé,
   la commande apparaît de toute façon « à valider » dans /admin) */
async function prevenirRefus(env, cf, rendu, motif) {
  const to = String(env.ORDER_EMAIL || "").split(",").map(e => ({ email: e.trim() })).filter(e => e.email);
  if (!env.BREVO_API_KEY || !to.length) return;
  const ev = cf.replace(/^CF-/, "EV-").replace(/-[A-Z]+$/, "");
  const test = env.CHECKOUT_MODE !== "live";
  const m = contenuRefus({ numero: cf, fabricant: rendu.fabricant, motif, piece: rendu.lignes.map(l => l.article).join("\n"), test,
    lien: env.ADMIN_HOST ? `https://${env.ADMIN_HOST}/admin?${new URLSearchParams({ q: ev })}` : "" });
  try { await envoyerEmail(env, { to, subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["refus", test ? "test" : "live"] }); }
  catch (e) { console.error("Refus : e-mail au propriétaire non parti", cf, e.message); }
}

/* Transitions : statuts de départ acceptés → statut d'arrivée ; « déjà » = statuts où l'action est déjà faite */
export const TRANSITIONS = {
  accepter: { depuis: ["envoyee_fabricant"], vers: "acceptee", deja: ["acceptee", A_REEXPEDIER, "expediee", "livree"] },
  expedier: { depuis: ["acceptee", "envoyee_fabricant"], vers: "expediee", deja: ["expediee", "livree"] },
  /* Refus : articles rendus à l'atelier (rendreCF), possible tant que rien n'est expédié */
  refuser: { depuis: RETIRABLES, vers: REFUSEE, deja: [] }
};
/* Fabricant qui ne livre pas le client : son « expédition » est l'envoi de la pièce à Evarysth (a_reexpedier), sans e-mail au client */
export const TRANSITION_ENTRANTE = { depuis: ["acceptee", "envoyee_fabricant"], vers: A_REEXPEDIER, deja: [A_REEXPEDIER, "expediee", "livree"] };
/* Fiche du fabricant (onglet Fabricants) : { livre, atelier } ou null si introuvable ou onglet illisible */
export async function fabricantDe(env, nom) {
  try {
    const cols = await entetes(env, FABRICANTS);
    const lu = await lireColonnes(env, FABRICANTS, cols, ["Nom", "Livre le client", ...("Envoi" in cols ? ["Envoi"] : [])]);
    const i = lu.Nom.findIndex(n => n.trim() === nom);
    return i < 0 ? null : { livre: /^oui$/i.test(String(lu["Livre le client"][i] || "").trim()), atelier: estAtelier((lu.Envoi || [])[i]) };
  } catch (e) {
    console.warn("Fabricants illisible", e instanceof ErreurGoogle ? e.message : e);
    return null;
  }
}
/* Transporteurs : colonne « Transporteurs » de l'onglet Listes (même liste que le menu du Sheet) ; secours si illisible */
export const LISTES = "Listes";
export const TRANSPORTEURS_SECOURS = ["La Poste – Colissimo", "La Poste – Lettre suivie", "Mondial Relay", "Autre"];
export async function lireTransporteurs(env) {
  try {
    const cols = await entetes(env, LISTES);
    const lu = await lireColonnes(env, LISTES, cols, ["Transporteurs"]);
    const liste = [...new Set(lu.Transporteurs.map(t => t.trim()).filter(Boolean))];
    if (liste.length) return liste;
  } catch (e) {
    console.warn("Transporteurs : onglet Listes illisible, liste de secours", e instanceof ErreurGoogle ? e.message : e);
  }
  return TRANSPORTEURS_SECOURS;
}
const LIBELLES = {
  accepter: { titre: "Accepter la commande", bouton: "J'accepte la commande", ok: "Commande acceptée. Merci !" },
  expedier: { titre: "Déclarer l'expédition", bouton: "Confirmer l'expédition", ok: "Expédition enregistrée. Merci !" },
  refuser: { titre: "Refuser la commande", bouton: "Je ne peux pas la fabriquer", ok: "Refus enregistré, merci de nous avoir prévenus : l'atelier Evarysth confie la commande à un autre fabricant." }
};
/* Même bouton, autre sens quand la pièce nous est renvoyée (« Pièce à nous renvoyer » dans l'e-mail) */
const LIBELLE_ENTRANT = { titre: "Déclarer l'envoi à l'atelier Evarysth", bouton: "Confirmer l'envoi à l'atelier", ok: "Envoi à l'atelier enregistré. Merci !" };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nettoyer = (s, max = 80) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function page(titre, corps, statut = 200) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(titre)} · Evarysth</title>
<style>
:root{--bg:#f4f1ea;--card:#fff;--line:#e4dfd4;--text:#151515;--muted:#66625a;--accent:#ff5a1f;--accent-hover:#ff7440;--err:#b3261e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 16px}.marque{font:600 12px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{font-family:"Bricolage Grotesque",Inter,sans-serif;font-size:28px;letter-spacing:-.025em;line-height:1.1;margin:12px 0 20px}
.carte{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}p{margin:0 0 12px}.muted{color:var(--muted);font-size:14px}
.piece{white-space:pre-line;font:14px/1.5 ui-monospace,"JetBrains Mono",monospace;background:var(--bg);border-radius:8px;padding:10px 12px;margin:0 0 16px}
label{display:block;font-weight:600;font-size:14px;margin:0 0 6px}input,select,textarea{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin:0 0 14px;background:#fff;color:var(--text)}
button{width:100%;font:600 16px/1 Inter,sans-serif;padding:14px;border:0;border-radius:999px;background:var(--accent);color:#151515;cursor:pointer}button:hover{background:var(--accent-hover)}
.erreur{color:var(--err);font-weight:600}
</style></head><body><main><div class="marque">Evarysth · espace fabricant</div><h1>${esc(titre)}</h1><div class="carte">${corps}</div></main></body></html>`;
  return new Response(html, { status: statut, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}
const message = (titre, texte, statut, classe = "") => page(titre, `<p class="${classe}">${esc(texte)}</p>`, statut);

/* Lignes de la commande fournisseur (par n° CF) : { cols, lignes: [{ ligne, statut }], statut, fabricants, piece } ;
   statut = le moins avancé des lignes (celui qui décide si l'action est possible) */
const ORDRE = ["lien_stl_a_indiquer", "a_valider", "payee", "fichier_a_produire", "envoyee_fabricant", "acceptee", A_REEXPEDIER, "expediee", "livree"];
async function lireCommande(env, numero) {
  const cols = await entetes(env, ONGLET_CF);
  const lu = await lireColonnes(env, ONGLET_CF, cols, [CF.num, "Statut", "Fabricant", "Article"]);
  const lignes = [];
  lu[CF.num].forEach((n, i) => { if (n.trim() === numero) lignes.push({ ligne: i + 2, statut: (lu.Statut[i] || "").trim(), fabricant: (lu.Fabricant[i] || "").trim(), article: lu.Article[i] || "" }); });
  if (!lignes.length) return null;
  const actives = lignes.filter(l => !["annulee", "remboursee"].includes(l.statut));
  const base = actives.length ? actives : lignes;
  const rang = s => { const r = ORDRE.indexOf(s); return r < 0 ? -1 : r; };
  const statut = base.reduce((m, l) => (rang(l.statut) < rang(m) ? l.statut : m), base[0].statut);
  return { cols, lignes: base, statut, fabricants: [...new Set(base.map(l => l.fabricant).filter(Boolean))], piece: base.map(l => l.article).join("\n") };
}

function formulaire(jeton, action, transporteurs = [], lib = LIBELLES[action]) {
  const champs = action === "expedier" ? `
<label for="transporteur">Transporteur</label><select id="transporteur" name="transporteur" required>
<option value="">Choisir…</option>${transporteurs.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
<label for="suivi">N° de suivi</label><input id="suivi" name="suivi" required maxlength="80" autocomplete="off">`
    : action === "refuser" ? `
<label for="motif">Motif <span class="muted">(facultatif)</span></label><textarea id="motif" name="motif" rows="3" maxlength="300" placeholder="Ex. : délai impossible, matière ou machine indisponible…"></textarea>
<p class="muted">Besoin seulement de plus de temps ? Répondez plutôt à l'e-mail de commande.</p>` : "";
  return `<form method="post" action="/f/${esc(jeton)}">${champs}<button type="submit">${esc(lib.bouton)}</button></form>`;
}

/* Contrôles communs à GET et POST ; renvoie soit une Response (refus), soit le contexte */
async function preparer(env, jeton) {
  if (!jetonConfigure(env) || !googleConfigure(env))
    return message("Service indisponible", "Ce service n'est pas encore ouvert. Contactez l'atelier Evarysth.", 503);
  let j;
  try { j = await verifierJeton(env, jeton); } catch (e) {
    if (!(e instanceof ErreurJeton)) throw e;
    if (e.code === "expire") return message("Lien expiré", "Ce lien a plus de 14 jours et n'est plus valable. Demandez un nouveau lien à l'atelier Evarysth.", 410, "erreur");
    return message("Lien invalide", "Ce lien est incomplet ou a été modifié. Utilisez le lien reçu par e-mail, tel quel.", 403, "erreur");
  }
  const c = await lireCommande(env, j.commande);
  if (!c) {
    /* Commande refusée ou retirée : ses articles n'ont plus ce n° */
    const refus = await refusDe(env, j.commande);
    if (refus && j.action === "refuser" && refus.auteur === "fabricant") return message("Refus déjà enregistré", `Votre refus de la commande ${j.commande} est bien enregistré. Merci !`, 200);
    if (refus) return message("Commande retirée", `La commande ${j.commande} ne vous est plus confiée : merci de ne pas la fabriquer. Une question ? Répondez à l'e-mail de commande.`, 410, "erreur");
  }
  if (!c) return message("Commande introuvable", `La commande ${j.commande} n'existe plus. Contactez l'atelier Evarysth.`, 404, "erreur");
  if (c.fabricants.some(f => f !== j.fabricant))
    return message("Lien plus valable", `La commande ${j.commande} a été confiée à un autre fabricant.`, 403, "erreur");
  /* « Déclarer l'expédition » d'un fabricant qui ne livre pas le client = envoi de la pièce à Evarysth */
  const entrant = j.action === "expedier" && passeParAtelier(await fabricantDe(env, j.fabricant));
  return { j, c, t: entrant ? TRANSITION_ENTRANTE : TRANSITIONS[j.action], entrant, lib: entrant ? LIBELLE_ENTRANT : LIBELLES[j.action] };
}

const dejaFaite = (j, c, lib = LIBELLES[j.action]) => message(lib.titre, `Déjà confirmée : la commande ${j.commande} est au statut « ${c.statut} ».`, 200);
const interdite = (j, c) => message("Action impossible", `La commande ${j.commande} est au statut « ${c.statut || "vide"} » : cette action n'est pas possible pour le moment. Contactez l'atelier Evarysth.`, 409, "erreur");

export async function routeFournisseur(req, env, jeton) {
  try {
    const r = await preparer(env, jeton);
    if (r instanceof Response) return r;
    const { j, c, t, entrant, lib } = r;
    if (t.deja.includes(c.statut)) return dejaFaite(j, c, lib);
    if (!t.depuis.includes(c.statut)) return interdite(j, c);

    const transporteurs = j.action === "expedier" ? await lireTransporteurs(env) : [];
    if (req.method === "GET") {
      return page(lib.titre, `<p>Commande <b>${esc(j.commande)}</b></p>
${c.piece ? `<div class="piece">${esc(c.piece)}</div>` : ""}${formulaire(jeton, j.action, transporteurs, lib)}
<p class="muted" style="margin:14px 0 0">Lien valable jusqu'au ${esc(new Date(j.expiration).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }))}.</p>`);
    }

    if (j.action === "refuser") {
      const f = await req.formData().catch(() => new FormData());
      const motif = nettoyer(f.get("motif"), 300);
      const rendu = await rendreCF(env, j.commande, { auteur: "fabricant", motif });
      if (rendu) await prevenirRefus(env, j.commande, rendu, motif);
      return message(LIBELLES.refuser.titre, LIBELLES.refuser.ok, 200);
    }

    const ecrits = {};
    if (j.action === "expedier") {
      const f = await req.formData().catch(() => new FormData());
      ecrits.Transporteur = nettoyer(f.get("transporteur"));
      ecrits["N° de suivi"] = nettoyer(f.get("suivi"));
      if (!ecrits.Transporteur || !ecrits["N° de suivi"])
        return page(lib.titre, `<p class="erreur">Le transporteur et le n° de suivi sont obligatoires.</p>${formulaire(jeton, "expedier", transporteurs, lib)}`, 400);
      if (!transporteurs.includes(ecrits.Transporteur))
        return page(lib.titre, `<p class="erreur">Choisissez un transporteur dans la liste.</p>${formulaire(jeton, "expedier", transporteurs, lib)}`, 400);
    }
    /* Pièce envoyée à Evarysth : le suivi va dans Notes (« Transporteur » et « N° de suivi » restent réservés au colis du client) */
    if (entrant && !t.deja.includes(c.statut)) {
      const suivi = `${ecrits.Transporteur} · ${ecrits["N° de suivi"]}`;
      await ajouterNote(env, j.commande, `${j.commande} expédiée par ${j.fabricant} à l'atelier Evarysth (${suivi}) : à contrôler puis réexpédier au client`)
        .catch(e => console.warn("Notes : suivi de l'envoi à l'atelier non noté", e.message));
      delete ecrits.Transporteur; delete ecrits["N° de suivi"];
    }
    for (const l of c.lignes) {
      if (!t.depuis.includes(l.statut)) continue;           /* ligne déjà plus avancée (ou en incident) : inchangée */
      for (const [nom, v] of Object.entries(ecrits)) await ecrireCellule(env, ONGLET_CF, c.cols, l.ligne, nom, v);
      await ecrireCellule(env, ONGLET_CF, c.cols, l.ligne, "Statut", t.vers);
    }
    /* Deux envois quasi simultanés (double clic rapide) : une seule ligne de Journal */
    const cj = await entetes(env, JOURNAL);
    const lu = await lireColonnes(env, JOURNAL, cj, ["Commande", "Nouveau statut", "Auteur"]);
    const dejaJournal = lu.Commande.some((n, i) => n === j.commande && lu["Nouveau statut"][i] === t.vers && lu.Auteur[i] === "fabricant");
    if (!dejaJournal) await journaliser(env, { numero: j.commande, ancien: c.statut, nouveau: t.vers, auteur: "fabricant" });
    return message(lib.titre, `${lib.ok} La commande ${j.commande} est passée au statut « ${t.vers} ».`, 200);
  } catch (e) {
    console.error("Lien fournisseur", e instanceof ErreurGoogle ? e.message : e);
    return message("Erreur temporaire", "L'enregistrement n'a pas pu se faire. Réessayez dans quelques minutes.", 503, "erreur");
  }
}
