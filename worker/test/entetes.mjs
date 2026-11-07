/* En-têtes des onglets du Sheet simulé (contrat : docs/traitement-commandes.md, « Structure du Sheet ») */
export const ENTETES_EV = ["Commande", "Date", "Statut", "Type", "Articles", "Client", "Commandes CF", "Cadeau / message",
  "Dernier statut notifié", "Stripe session id", "Notes"];
export const ENTETES_CF = ["Commande CF", "Commande EV", "Article n°", "Date", "Statut", "Type", "Action requise", "Article",
  "Commande OpenSCAD", "Fabricant", "Lien STL", "Transporteur", "N° de suivi", "Dernier statut notifié", "Notes"];
export const COL_EV = Object.fromEntries(ENTETES_EV.map((n, i) => [n, i]));
export const COL_CF = Object.fromEntries(ENTETES_CF.map((n, i) => [n, i]));
/* Ligne de tableau → objet { en-tête: valeur } */
export const objet = (entetes, r) => r && Object.fromEntries(entetes.map((n, i) => [n, r[i] ?? ""]));
