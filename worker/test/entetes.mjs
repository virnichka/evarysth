/* En-têtes des onglets du Sheet simulé (contrat : docs/commandes.md, « Structure du Sheet ») */
import { statutEV } from "../src/planifie.js";

export const ENTETES_EV = ["Commande", "Date", "Statut", "Statut forcé", "Type", "Articles", "Client", "Commandes CF", "Cadeau / message",
  "Dernier statut notifié", "Stripe session id", "Notes"];
export const ENTETES_CF = ["Commande CF", "Commande EV", "Article n°", "Date", "Statut", "Type", "Action requise", "Article",
  "Fabricant", "Lien STL", "Transporteur", "N° de suivi", "Dernier statut notifié", "Notes"];
export const COL_EV = Object.fromEntries(ENTETES_EV.map((n, i) => [n, i]));
export const COL_CF = Object.fromEntries(ENTETES_CF.map((n, i) => [n, i]));
/* Ligne de tableau → objet { en-tête: valeur } */
export const objet = (entetes, r) => r && Object.fromEntries(entetes.map((n, i) => [n, r[i] ?? ""]));

/* Formules d'en-tête de « Commandes EV » (Statut, Commandes CF), recalculées comme le ferait Google à chaque lecture */
export function appliquerFormules(sheet) {
  const ev = sheet["Commandes EV"], cf = sheet["Commandes CF"];
  if (!ev || !cf) return;
  const iEV = Object.fromEntries(ev[0].map((n, i) => [n, i])), iCF = Object.fromEntries(cf[0].map((n, i) => [n, i]));
  for (const l of ev.slice(1)) {
    const n = l[iEV.Commande];
    if (!n) continue;
    const arts = cf.slice(1).filter(a => a[iCF["Commande EV"]] === n);
    l[iEV.Statut] = l[iEV["Statut forcé"]] || statutEV(arts.map(a => a[iCF.Statut]).filter(Boolean)) || "payee";
    l[iEV["Commandes CF"]] = [...new Set(arts.map(a => a[iCF["Commande CF"]]).filter(Boolean))].sort().join("\n");
  }
}
