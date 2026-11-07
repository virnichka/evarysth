/* Tâche planifiée (bloc D, cron toutes les 10 min) : lit l'onglet Commandes ; pour chaque ligne où
   Statut ≠ Dernier statut notifié : envoie l'e-mail dû, puis seulement après un envoi réussi écrit la colonne
   « Dernier statut notifié » et journalise le changement (auteur proprietaire s'il n'est pas déjà dans le Journal).
   envoyee_fabricant → fabricant ; expediee → client ; autres statuts : colonne mise à jour sans e-mail.
   Relance au propriétaire (une seule par commande, marquée dans le Journal) si pas d'acceptee 48 h après l'envoi.
   Inactive sans secrets Google ; un e-mail dont le secret manque n'est pas envoyé et la ligne attend (aucune erreur).
   Lignes retrouvées par leur n° de commande (majCommande), jamais par leur position. */
import { entetes, googleConfigure, lireColonnes } from "./google.js";
import { creerJeton, jetonConfigure } from "./jeton.js";
import { contenuExpedition, contenuFabricant, contenuRelance, envoyerEmail } from "./email.js";
import { dateParis, FABRICANTS, JOURNAL, journaliser, majCommande, ONGLET } from "./sheet.js";

export const STATUTS = ["payee", "fichier_a_produire", "envoyee_fabricant", "acceptee", "expediee", "livree", "incident", "remboursee", "annulee"];
export const RELANCE = "relance_48h";               /* valeur « Nouveau statut » de la ligne de Journal qui marque la relance */
export const DELAI_RELANCE_MS = 48 * 3600_000;
const URL_WORKER = "https://evarysth-checkout.virnichka.workers.dev";
const COLS = ["Commande", "Statut", "Pièce", "Client", "Fabricant", "Lien STL", "Transporteur", "N° de suivi", "Dernier statut notifié", "Stripe session id"];
const oui = v => /^oui$/i.test(String(v || "").trim());
const repondreA = env => ({ email: env.REPLY_TO || "contact@evarysth.fr", name: "Evarysth" });

/* « AAAA-MM-JJ HH:MM » heure de Paris → ms (NaN si illisible) */
export function parisVersMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || "").trim());
  if (!m) return NaN;
  const naif = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const vu = dateParis(new Date(naif));                         /* même instant affiché à Paris → décalage */
  const [, a, mo, j, h, mi] = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(vu).map(Number);
  return naif - (Date.UTC(a, mo - 1, j, h, mi) - naif);
}

/* Fiche du fabricant par son nom (onglet Fabricants) */
async function lireFabricants(env) {
  const cols = await entetes(env, FABRICANTS);
  const noms = ["Nom", "E-mail", "Délai (jours)", "Livre le client"].filter(n => n in cols);
  const v = await lireColonnes(env, FABRICANTS, cols, noms);
  const fabs = {};
  (v.Nom || []).forEach((n, i) => { if (n.trim()) fabs[n.trim()] = { email: (v["E-mail"] || [])[i] || "", delai: (v["Délai (jours)"] || [])[i] || "", livre: oui((v["Livre le client"] || [])[i]) }; });
  return fabs;
}

/* Journal → par commande : lignes dans l'ordre { date, ancien, nouveau, auteur } */
async function lireJournal(env) {
  const cols = await entetes(env, JOURNAL);
  const v = await lireColonnes(env, JOURNAL, cols, ["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]);
  const parCommande = {};
  v.Commande.forEach((n, i) => { if (n) (parCommande[n] ||= []).push({ date: v.Date[i] || "", ancien: v["Ancien statut"][i] || "", nouveau: (v["Nouveau statut"][i] || "").trim() }); });
  return parCommande;
}

const dernierStatut = lignes => [...(lignes || [])].reverse().find(l => STATUTS.includes(l.nouveau));

/* E-mail dû pour ce statut. Renvoie true (envoyé ou aucun e-mail prévu), ou une raison (texte) si la ligne doit attendre. */
async function envoyerSelonStatut(env, c, fabs) {
  const test = String(c.sid || "").startsWith("cs_test_") || env.CHECKOUT_MODE !== "live";
  if (c.statut === "envoyee_fabricant") {
    if (!env.BREVO_API_KEY || !jetonConfigure(env)) return "secret BREVO_API_KEY ou HMAC_SECRET manquant";
    const nom = c.fabricant.trim(), f = fabs[nom];
    if (!f || !/@/.test(f.email)) return `fabricant « ${nom || "—"} » sans e-mail dans l'onglet Fabricants`;
    const base = (env.WORKER_URL || URL_WORKER).replace(/\/+$/, "");
    const lien = async action => `${base}/f/${await creerJeton(env, { commande: c.numero, action, fabricant: nom })}`;
    const [nomClient = "", , adresse = ""] = c.client.split("\n");
    const m = contenuFabricant({ numero: c.numero, piece: c.piece, lienStl: c.stl.trim(), delai: f.delai, test,
      livraison: f.livre ? [nomClient, adresse].filter(Boolean).join("\n") : null,
      liens: { accepter: await lien("accepter"), expedier: await lien("expedier") } });
    await envoyerEmail(env, { to: [{ email: f.email.trim(), name: nom }], replyTo: repondreA(env), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["fabricant", test ? "test" : "live"] });
  } else if (c.statut === "expediee") {
    const [nom = "", email = ""] = c.client.split("\n");
    if (!env.BREVO_API_KEY) return "secret BREVO_API_KEY manquant";
    if (!/@/.test(email)) return true;                         /* pas d'e-mail client : rien à envoyer */
    const m = contenuExpedition({ numero: c.numero, nom: nom.trim(), transporteur: c.transporteur, suivi: c.suivi, test });
    await envoyerEmail(env, { to: [{ email: email.trim(), ...(nom.trim() ? { name: nom.trim() } : {}) }], replyTo: repondreA(env), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["expedition", test ? "test" : "live"] });
  }
  return true;
}

async function relancer(env, c, journal, maintenant) {
  if (!env.BREVO_API_KEY || !env.ORDER_EMAIL) return false;
  const lignes = journal[c.numero] || [];
  if (lignes.some(l => l.nouveau === RELANCE)) return false;
  const envoi = [...lignes].reverse().find(l => l.nouveau === "envoyee_fabricant");
  const t = envoi ? parisVersMs(envoi.date) : NaN;
  if (!(maintenant - t >= DELAI_RELANCE_MS)) return false;
  const test = String(c.sid || "").startsWith("cs_test_") || env.CHECKOUT_MODE !== "live";
  const m = contenuRelance({ numero: c.numero, fabricant: c.fabricant, depuis: envoi.date, test });
  await envoyerEmail(env, { to: env.ORDER_EMAIL.split(",").map(e => ({ email: e.trim() })).filter(e => e.email), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["relance", test ? "test" : "live"] });
  await journaliser(env, { numero: c.numero, ancien: "envoyee_fabricant", nouveau: RELANCE, auteur: "worker" });
  (journal[c.numero] ||= []).push({ date: dateParis(), nouveau: RELANCE });
  return true;
}

/* Un passage. Renvoie un bilan { notifiees, attente, erreurs, relances } (ou { inactive: true }). */
export async function tachePlanifiee(env, maintenant = Date.now()) {
  if (!googleConfigure(env)) return { inactive: true };
  const cols = await entetes(env, ONGLET);
  const v = await lireColonnes(env, ONGLET, cols, COLS);
  const [fabs, journal] = await Promise.all([lireFabricants(env), lireJournal(env)]);
  const bilan = { notifiees: [], attente: [], erreurs: [], relances: [] };
  for (let i = 0; i < v.Commande.length; i++) {
    const c = { numero: v.Commande[i].trim(), statut: (v.Statut[i] || "").trim(), piece: v["Pièce"][i] || "", client: v.Client[i] || "",
      fabricant: v.Fabricant[i] || "", stl: v["Lien STL"][i] || "", transporteur: v.Transporteur[i] || "", suivi: v["N° de suivi"][i] || "",
      notifie: (v["Dernier statut notifié"][i] || "").trim(), sid: v["Stripe session id"][i] || "" };
    if (!c.numero || !STATUTS.includes(c.statut)) continue;
    try {
      if (c.statut !== c.notifie) {
        const r = await envoyerSelonStatut(env, c, fabs);
        if (r !== true) { bilan.attente.push(`${c.numero} : ${r}`); continue; }
        await majCommande(env, c.numero, { "Dernier statut notifié": c.statut });
        const dernier = dernierStatut(journal[c.numero]);
        if (!dernier || dernier.nouveau !== c.statut) {
          await journaliser(env, { numero: c.numero, ancien: dernier ? dernier.nouveau : c.notifie, nouveau: c.statut, auteur: "proprietaire" });
          (journal[c.numero] ||= []).push({ date: dateParis(), ancien: c.notifie, nouveau: c.statut });
        }
        bilan.notifiees.push(`${c.numero} : ${c.statut}`);
      } else if (c.statut === "envoyee_fabricant" && await relancer(env, c, journal, maintenant)) bilan.relances.push(c.numero);
    } catch (e) {
      bilan.erreurs.push(`${c.numero} : ${e.message}`);       /* ligne suivante quand même ; celle-ci sera retentée */
    }
  }
  return bilan;
}

/* Handler `scheduled` : ne lève jamais (journaux Cloudflare seulement) */
export async function lancerTache(env) {
  try {
    const b = await tachePlanifiee(env);
    if (b.inactive) return b;
    if (b.erreurs.length) console.error("Tâche planifiée : erreurs", b.erreurs);
    if (b.attente.length) console.warn("Tâche planifiée : en attente", b.attente);
    if (b.notifiees.length || b.relances.length) console.log("Tâche planifiée", { notifiees: b.notifiees, relances: b.relances });
    return b;
  } catch (e) {
    console.error("Tâche planifiée : Sheet indisponible", e.message);
    return { erreur: e.message };
  }
}
