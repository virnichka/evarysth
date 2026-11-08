/* Back-office Google Sheet (contrat : docs/traitement-commandes.md, « Structure du Sheet ») :
   - onglet « Commandes EV » : une ligne par commande client, clé = Stripe session id, n° EV-AAAA-NNNN ;
   - onglet « Commandes CF » : une ligne par article de la commande (clé = Commande EV + Article n°), fabricant choisi
     par le propriétaire ; la tâche planifiée attribue le n° de commande fournisseur CF-AAAA-NNNN-X (planifie.js). */
import { EVARYSTH } from "./catalogue.js";
import { fichierStandardDispo } from "./fichier.js";
import { ajouterLigne, ecrireCellule, ecrireLigne, entetes, ErreurGoogle, lireColonnes } from "./google.js";

export const ONGLET = "Commandes EV", ONGLET_CF = "Commandes CF", JOURNAL = "Journal", FABRICANTS = "Fabricants";
const C = { num: "Commande", sid: "Stripe session id" };
export const CF = { num: "Commande CF", ev: "Commande EV", art: "Article n°" };

/* Délai entre l'écriture et la relecture de contrôle, et nombre d'essais (modifiables par les tests) */
export const reglages = { attenteVerificationMs: 2000, essais: 5 };
const attendre = ms => new Promise(r => setTimeout(r, ms));

/* « AAAA-MM-JJ HH:MM », heure de Paris */
export function dateParis(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const lignesArticles = fiche => fiche.lignes.filter(l => (l.meta || {}).produit !== "emballage-cadeau");
export const typeCommande = fiche => (lignesArticles(fiche).some(l => (l.meta || {}).mode === "custom") ? "sur-mesure" : "standard");
/* Point de verrou : aucun article ne part chez le fabricant sans validation du propriétaire (page /admin).
   Départ : a_valider si le fichier STL est connu (standard présent dans R2), sinon lien_stl_a_indiquer. */
export const A_VALIDER = "a_valider", STL_A_INDIQUER = "lien_stl_a_indiquer";
export const statutInitial = async (env, a) => (a.type === "standard" && await fichierStandardDispo(env, a.texte) ? A_VALIDER : STL_A_INDIQUER);

/* Un article : « <produit> · <taille M | a=45 b=32> · <matière> · <coloris> · ×<qté> » (matière : celle du catalogue) */
function ligneArticle(l) {
  const m = l.meta || {};
  let taille = m.taille || "";
  if (m.mode === "custom") {
    try { taille = Object.entries(JSON.parse(m.cotes_mm || "{}")).map(([k, v]) => `${k}=${v}`).join(" "); } catch { /* cotes illisibles */ }
  }
  const p = m.produit && EVARYSTH.getProduct(m.produit);
  const col = p && (p.colors || []).find(c => c.id === m.coloris);
  const matiere = m.matiere || (p && EVARYSTH.matiere ? EVARYSTH.matiere(p).label : "");
  return [m.produit || l.nom, taille || "—", ...(matiere ? [matiere] : []), (col && col.label) || m.coloris || "—", `×${l.quantite}`].join(" · ");
}

/* Articles de la commande (hors emballage cadeau) : [{ texte, type: standard | sur-mesure }] */
export const articles = fiche => lignesArticles(fiche).map(l => ({ texte: ligneArticle(l), type: (l.meta || {}).mode === "custom" ? "sur-mesure" : "standard" }));

/* Colonne Articles de « Commandes EV » : un article par ligne */
export const piece = fiche => articles(fiche).map(a => a.texte).join("\n");

/* Colonne Client : 3 lignes nom / e-mail / adresse */
export function client(fiche) {
  const a = (fiche.livraison && fiche.livraison.adresse) || {};
  const adresse = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
  return [(fiche.livraison && fiche.livraison.nom) || (fiche.client && fiche.client.nom) || "", (fiche.client && fiche.client.email) || "", adresse].join("\n");
}

/* Prochain n° de l'année : plus grand NNNN existant + 1 (4 chiffres au moins) */
export function prochainNumero(numeros, annee) {
  const re = new RegExp(`^EV-${annee}-(\\d{4,})$`);
  const max = numeros.reduce((m, n) => { const x = re.exec(String(n).trim()); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `EV-${annee}-${String(max + 1).padStart(4, "0")}`;
}

/* Ajoute la commande si son session id est absent. Renvoie { numero, nouveau, statut, type }.
   N° sans collision, sans verrou (Google n'en propose pas) :
   1. lecture des colonnes Commande et Stripe session id : session déjà présente → rien à faire ;
   2. n° = plus grand n° de l'année + 1, ligne = 1re ligne dont Commande est vide ;
   3. écriture (values.update), attente, relecture : si une autre commande a écrit la même ligne entre-temps
      (deux webhooks simultanés lisent le même état, donc visent la même ligne et le même n°), un seul des deux
      reste ; celui qui ne se retrouve pas recommence à l'étape 1 avec un état à jour (n° suivant, ligne suivante).
   Deux commandes ne peuvent donc jamais garder le même n° ; après `essais` échecs → erreur (5xx, Stripe réessaie). */
export async function enregistrerCommande(env, fiche, session) {
  const cmd = await enregistrerEV(env, fiche, session);
  await enregistrerArticles(env, cmd.numero, fiche, cmd.date);
  return cmd;
}

async function enregistrerEV(env, fiche, session) {
  const cols = await entetes(env, ONGLET);
  const type = typeCommande(fiche);
  const statut = "payee";                               /* statut initial (Journal, e-mail) ; la colonne Statut est une formule */
  const quand = session.created ? new Date(session.created * 1000) : new Date();
  const date = dateParis(quand);
  const annee = date.slice(0, 4);
  const cadeau = fiche.cadeau ? (fiche.cadeau.message ? `oui · ${fiche.cadeau.message}` : "oui") : "";

  for (let essai = 0; essai < reglages.essais; essai++) {
    const lu = await lireColonnes(env, ONGLET, cols, [C.num, C.sid]);
    const deja = lu[C.sid].indexOf(session.id);
    if (deja >= 0) return { numero: lu[C.num][deja], nouveau: false, statut, type, date };

    const numero = prochainNumero(lu[C.num], annee);
    const vide = lu[C.num].findIndex(n => !n.trim());
    const ligne = (vide >= 0 ? vide : lu[C.num].length) + 2;
    await ecrireLigne(env, ONGLET, cols, ligne, {
      Commande: numero,
      Date: date,
      Type: type,
      Articles: piece(fiche),
      Client: client(fiche),
      "Stripe session id": session.id,
      "Cadeau / message": cadeau
    });

    if (reglages.attenteVerificationMs) await attendre(reglages.attenteVerificationMs);
    const verif = await lireColonnes(env, ONGLET, cols, [C.num, C.sid]);
    if (verif[C.sid][ligne - 2] === session.id && verif[C.num][ligne - 2] === numero) return { numero, nouveau: true, statut, type, date };
    const ailleurs = verif[C.sid].indexOf(session.id);
    if (ailleurs >= 0) return { numero: verif[C.num][ailleurs], nouveau: false, statut, type, date };
    console.warn(`Sheet : ligne ${ligne} reprise par une autre commande, nouvel essai.`);
  }
  throw new ErreurGoogle("Sheet : n° de commande non attribué après plusieurs essais.");
}

/* Lignes de « Commandes CF » de la commande : une par article, fabricant vide (choisi par le propriétaire).
   Rejeu (Stripe renvoie l'événement, ou écriture interrompue) : seuls les articles absents sont écrits.
   Même méthode que pour le n° EV : écriture sur une ligne vide, attente, relecture ; ligne reprise par une autre
   commande entre-temps → l'article est réécrit plus bas au passage suivant. */
async function enregistrerArticles(env, numero, fiche, date) {
  const cols = await entetes(env, ONGLET_CF);
  const liste = articles(fiche);
  for (let essai = 0; essai < reglages.essais; essai++) {
    const lu = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art]);
    const presents = new Set(lu[CF.ev].map((n, i) => (n === numero ? lu[CF.art][i] : null)).filter(Boolean));
    const manquants = liste.map((a, i) => ({ ...a, n: String(i + 1) })).filter(a => !presents.has(a.n));
    if (!manquants.length) return;
    const vides = [];
    lu[CF.ev].forEach((n, i) => { if (!n.trim()) vides.push(i + 2); });
    for (let l = lu[CF.ev].length + 2; vides.length < manquants.length; l++) vides.push(l);
    const ecrites = [];
    for (const [k, a] of manquants.entries()) {
      const ligne = vides[k];
      const statut = await statutInitial(env, a);             /* noté comme notifié : pas d'e-mail ni de Journal pour l'état initial */
      await ecrireLigne(env, ONGLET_CF, cols, ligne, { [CF.ev]: numero, [CF.art]: a.n, Date: date, Statut: statut, Type: a.type, Article: a.texte, "Dernier statut notifié": statut });
      ecrites.push({ ligne, n: a.n });
    }
    if (reglages.attenteVerificationMs) await attendre(reglages.attenteVerificationMs);
    const verif = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art]);
    if (ecrites.every(e => verif[CF.ev][e.ligne - 2] === numero && verif[CF.art][e.ligne - 2] === e.n)) return;
    console.warn(`Sheet : article de ${numero} repris par une autre commande, nouvel essai.`);
  }
  throw new ErreurGoogle(`Sheet : articles de ${numero} non enregistrés après plusieurs essais.`);
}

/* Mise à jour de cellules d'une ligne de « Commandes CF », retrouvée par Commande EV + Article n° */
export async function majArticle(env, numeroEV, n, valeursParNom) {
  const cols = await entetes(env, ONGLET_CF);
  const lu = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art]);
  const i = lu[CF.ev].findIndex((x, k) => x === numeroEV && lu[CF.art][k] === String(n));
  if (i < 0) throw new ErreurGoogle(`Article ${numeroEV} n° ${n} introuvable dans le Sheet.`);
  for (const [nom, v] of Object.entries(valeursParNom)) await ecrireCellule(env, ONGLET_CF, cols, i + 2, nom, v);
}

/* Mise à jour de cellules d'une commande, retrouvée par son n° (jamais par sa position) */
export async function majCommande(env, numero, valeursParNom) {
  const cols = await entetes(env, ONGLET);
  const { [C.num]: nums } = await lireColonnes(env, ONGLET, cols, [C.num]);
  const i = nums.indexOf(numero);
  if (i < 0) throw new ErreurGoogle(`Commande ${numero} introuvable dans le Sheet.`);
  for (const [nom, v] of Object.entries(valeursParNom)) await ecrireCellule(env, ONGLET, cols, i + 2, nom, v);
}

export async function journaliser(env, { numero, ancien = "", nouveau, auteur = "worker", date = dateParis() }) {
  const cols = await entetes(env, JOURNAL);
  return ajouterLigne(env, JOURNAL, cols, { Date: date, Commande: numero, "Ancien statut": ancien, "Nouveau statut": nouveau, Auteur: auteur });
}

/* Ligne « création » du Journal (ancien statut vide), écrite une seule fois même si Stripe renvoie l'événement */
export async function journaliserCreation(env, numero, statut) {
  const cols = await entetes(env, JOURNAL);
  const lu = await lireColonnes(env, JOURNAL, cols, ["Commande", "Ancien statut"]);
  if (lu.Commande.some((n, i) => n === numero && !(lu["Ancien statut"][i] || "").trim())) return false;
  await ajouterLigne(env, JOURNAL, cols, { Date: dateParis(), Commande: numero, "Ancien statut": "", "Nouveau statut": statut, Auteur: "worker" });
  return true;
}
