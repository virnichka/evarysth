/* Argent d'une commande : frais Stripe (lus chez Stripe), nombres lus dans le Sheet, marge d'une commande.
   Le Sheet reste une mémoire : le total, la livraison et la remise sont écrits à la commande (sheet.js), les frais Stripe
   juste après (ou, s'ils manquent, par l'entretien de la tâche planifiée), les coûts sont saisis dans /admin. */
import { appelStripe } from "./stripe.js";
import { entetes, lireColonnes } from "./google.js";
import { MONTANTS, noterFrais, ONGLET, versNombre } from "./sheet.js";
import { parisVersMs } from "./planifie.js";

export { versNombre };
export const euros = n => (n == null ? "—" : `${n.toFixed(2).replace(".", ",")} €`);

/* Frais Stripe de la commande (€), ou null si Stripe ne les donne pas encore */
export async function fraisStripe(env, sessionId) {
  const s = await appelStripe(env, "GET", `checkout/sessions/${sessionId}`, { expand: ["payment_intent.latest_charge.balance_transaction"] });
  const pi = s.payment_intent, bt = pi && typeof pi === "object" && pi.latest_charge && pi.latest_charge.balance_transaction;
  return bt && typeof bt === "object" && typeof bt.fee === "number" ? bt.fee / 100 : null;
}

/* Marge d'une commande (TTC) : total − frais Stripe − coûts fabricants − frais d'envoi.
   { total, frais, couts, envois, marge, manque } ; marge = null tant qu'il manque un montant utile (manque : raison courte).
   cfs : [{ cf, atelier, cout, envoi }] une entrée par CF non close. */
export function margeCommande({ total, frais, cfs, nonConfies = 0 }) {
  const sansCout = cfs.filter(c => !c.atelier && c.cout == null);
  const couts = cfs.reduce((n, c) => n + (c.cout || 0), 0), envois = cfs.reduce((n, c) => n + (c.envoi || 0), 0);
  let manque = "";
  if (total == null) manque = "total non enregistré";
  else if (frais == null) manque = "frais Stripe pas encore connus";
  else if (nonConfies) manque = `${nonConfies} article${nonConfies > 1 ? "s" : ""} pas encore confié${nonConfies > 1 ? "s" : ""} à un fabricant`;
  else if (sansCout.length) manque = `coût manquant : ${sansCout.map(c => c.cf).join(", ")}`;
  return { total, frais, couts, envois, manque, marge: manque ? null : total - frais - couts - envois };
}

/* Entretien : renseigne les frais Stripe des commandes récentes dont le total est connu mais pas les frais
   (3 au plus par passage, jamais en erreur). Inactif si la colonne « Frais Stripe (€) » n'existe pas dans le Sheet. */
export async function completerFrais(env, maintenant = Date.now(), { max = 3, ageMaxJours = 14 } = {}) {
  if (!env.STRIPE_SECRET_KEY) return { inactif: true };
  const cols = await entetes(env, ONGLET);
  if (!(MONTANTS.frais in cols) || !(MONTANTS.total in cols)) return { inactif: true };
  const lu = await lireColonnes(env, ONGLET, cols, ["Commande", "Date", "Stripe session id", MONTANTS.total, MONTANTS.frais]);
  const fait = [], erreurs = [];
  const test = env.CHECKOUT_MODE !== "live";
  for (const [i, n] of lu.Commande.entries()) {
    if (fait.length + erreurs.length >= max) break;
    const sid = (lu["Stripe session id"][i] || "").trim();
    if (!n.trim() || !sid.startsWith("cs_") || sid.startsWith("cs_test_") !== test) continue;       /* autre mode : clé inadaptée */
    if (!String(lu[MONTANTS.total][i] || "").trim() || String(lu[MONTANTS.frais][i] || "").trim()) continue;
    const t = parisVersMs(lu.Date[i]);
    if (Number.isFinite(t) && maintenant - t > ageMaxJours * 86400_000) continue;
    try {
      const frais = await fraisStripe(env, sid);
      if (frais != null && await noterFrais(env, n.trim(), frais)) fait.push(n.trim());
    } catch (e) { erreurs.push(`${n.trim()} : ${e.message}`); }
  }
  if (erreurs.length) console.warn("Frais Stripe non récupérés", erreurs);
  return { fait, erreurs };
}
