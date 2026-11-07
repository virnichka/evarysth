# Traitement des commandes V1

Chantier piloté par la session `session_01GS5VpHVaTuCX1b9qmaJGA4` (chef de projet). Chaque bloc de code
(B à E) est réalisé dans une session séparée, un par un, dans l'ordre.

Sheet (back-office) : son identifiant n'est **pas** écrit ici (dépôt public) ; il est la valeur du secret `SHEET_ID`.

## Décisions

- **Google Sheets = back-office.** Pas de base D1, pas de page admin. Compte Gmail personnel.
  Accès par **compte de service** : JWT RS256 signé en WebCrypto (sans bibliothèque), échangé contre
  un jeton d'accès (cache 1 h). Secrets Cloudflare : `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY`, `SHEET_ID`,
  `HMAC_SECRET`, plus `BREVO_API_KEY` (existant). Jamais de secret dans le dépôt (il est public).
- **Stripe reste la référence pour l'argent** (reçus, remboursements).
- **Statuts** (menu déroulant, valeurs exactes) : `payee`, `fichier_a_produire`, `envoyee_fabricant`,
  `acceptee`, `expediee`, `livree`, `incident`, `remboursee`, `annulee`.
  - Standard : `payee` → **le propriétaire valide à la main** en passant à `envoyee_fabricant` (pas d'envoi auto en V1).
  - Sur-mesure (la majorité des ventes) : arrivée directe en `fichier_a_produire` ; le propriétaire produit le STL
    en local avec OpenSCAD (modèles écrits par lui), colle un lien Drive, puis passe à `envoyee_fabricant`.
- **Onglets** : `Commandes`, `Journal` (une ligne par changement de statut : date, commande,
  ancien → nouveau, auteur), `Fabricants` (**un seul** en V1 : nom, e-mail, délai), `Listes`.
- **Colonnes de Commandes** : Commande (`EV-AAAA-NNNN`, clé unique) · Date · Statut ▼ · Type
  (standard/sur-mesure) · Action requise (formule) · Pièce (produit, taille ou cotes, coloris, qté) ·
  Commande OpenSCAD (ex. `openscad -D largeur=142 -D hauteur=60 -o EV-2026-0042.stl modeles/<modèle>.scad`,
  noms de paramètres = `custom.params` de `data.js`) · Client (nom, e-mail, adresse) · Fabricant ▼ ·
  Lien STL · Transporteur · N° de suivi · Dernier statut notifié (protégée, réservée au Worker) ·
  Stripe session id · Cadeau / message · Notes.
- **Toujours chercher une ligne par son n° de commande**, jamais par sa position (le propriétaire trie et filtre).
- **Webhook sans doublon** : si la commande (Stripe session id) est déjà dans le Sheet, ne rien ajouter.
  Si Google échoue, répondre en erreur (5xx) pour que Stripe réessaie.
- **Tâche planifiée Cloudflare toutes les 10 min** : lire le Sheet, envoyer l'e-mail dû quand
  `Statut` ≠ `Dernier statut notifié`, puis mettre à jour cette colonne. Aucun script Google à écrire.
- **Liens fournisseur** : jeton `commande.action.fabricant.expiration.signature`, signature HMAC-SHA256,
  validité 14 jours, rien à stocker.
  - L'ouverture du lien (`GET /f/<jeton>`) affiche **seulement** une page avec un bouton
    (protection contre les robots de messagerie qui ouvrent les liens).
  - L'appui sur le bouton (`POST /f/<jeton>`) revérifie le jeton, n'accepte que la transition prévue,
    écrit le statut puis une ligne dans le Journal. Un 2e clic affiche « déjà confirmée ».
  - Deux actions : `accepter` (`envoyee_fabricant` → `acceptee`) et `expedier` (formulaire
    transporteur + n° de suivi → `expediee`).
- **Fichiers** : STL standards sur R2, servis par `GET /fichier/<jeton>` (lien temporaire) ;
  sur-mesure = lien Drive collé à la main.
- **RGPD** : mentionner Google (Sheets/Drive) comme sous-traitant dans `confidentialite/`
  (source `tools/pages-legales/`) ; l'adresse client n'est transmise au fabricant que s'il livre le client lui-même.
- Textes en français, ton du site, sans promesse invérifiable.

## Structure du Sheet (contrat entre le Sheet et le Worker)

Établie au bloc A. Le Worker lit/écrit **par nom de colonne** (ligne 1), jamais par position figée ; les lettres
ci-dessous sont l'état initial.

### Onglet `Commandes` (ligne 1 = en-têtes, figée)

| Col | En-tête | Écrit par | Format |
|-----|---------|-----------|--------|
| A | Commande | Worker | `EV-AAAA-NNNN` |
| B | Date | Worker | `AAAA-MM-JJ HH:MM` (heure de Paris) |
| C | Statut | Worker puis propriétaire | menu déroulant (liste `Listes!A`) |
| D | Type | Worker | `standard` ou `sur-mesure` (sur-mesure si au moins une ligne l'est) |
| E | Action requise | **formule** (en-tête, `MAP`) | ne jamais écrire dans cette colonne |
| F | Pièce | Worker | une ligne par article : `<produit> · <taille M \| a=45 b=32> · <coloris> · ×<qté>` |
| G | Commande OpenSCAD | **formule** (en-tête, `MAP`) | ne jamais écrire ; fichier `<commande>-<produit>.stl`, modèle `modeles/<produit>.scad` |
| H | Client | Worker | 3 lignes : nom / e-mail / adresse |
| I | Fabricant | Worker (fabricant par défaut) puis propriétaire | menu déroulant (`Fabricants!A`) |
| J | Lien STL | propriétaire (sur-mesure) | URL Drive |
| K | Transporteur | Worker (via lien fournisseur) | texte |
| L | N° de suivi | Worker (via lien fournisseur) | texte |
| M | Dernier statut notifié | **Worker seulement** (protégée, avertissement) | une valeur de statut ou vide |
| N | Stripe session id | Worker | `cs_test_…` |
| O | Cadeau / message | Worker | vide, ou `oui` + message |
| P | Notes | propriétaire | libre |

Règles d'écriture pour le Worker :
- **Nouvelle ligne** : lire les colonnes A et N, refuser si le session id existe déjà, puis écrire avec
  `values.update` sur la 1re ligne dont A est vide, en envoyant `null` pour E et G (cellules ignorées) : les
  formules d'en-tête s'étendent seules. Ne pas utiliser `values.append` (les formules remplissent la colonne).
- **Mise à jour** : retrouver la ligne en cherchant le n° de commande dans la colonne A, puis écrire la cellule.
- Écrire avec `valueInputOption=RAW` (A et B sont au format texte ; évite qu'un texte soit converti en date).
- Le Sheet est en locale `fr_FR`, fuseau `Europe/Paris` : une formule écrite par l'API doit utiliser `;`
  comme séparateur d'arguments (le Worker n'écrit aucune formule en V1).

### Onglet `Journal`
`Date` · `Commande` · `Ancien statut` · `Nouveau statut` · `Auteur` (`worker`, `fabricant`, `proprietaire`).
Ajout en fin (`values.append` autorisé ici). Les changements faits à la main dans le Sheet sont journalisés par
la tâche planifiée (auteur `proprietaire`) quand elle détecte `Statut` ≠ `Dernier statut notifié`.

### Onglet `Fabricants`
`Nom` · `E-mail` · `Délai (jours)` · `Livre le client` (`oui`/`non`, menu). Une seule ligne en V1 (ligne 2),
pré-remplie `À renseigner` / vide / `5` / `non`.

### Onglet `Listes`
Colonne A `Statuts` (les 9 valeurs), B `Types`, C `Transporteurs` (suggestions).

## Bloc A — Sheet

- **Objectif** : préparer le Sheet selon la structure ci-dessus (réalisé par le chef de projet, connecteur Google Sheets).
- **Fichiers** : aucun (Sheet seulement) ; ce document.
- **Critères d'acceptation** : 4 onglets ; en-têtes exacts ; menus Statut et Fabricant ; formules Action requise
  et Commande OpenSCAD en en-tête ; colonne M protégée ; mise en forme conditionnelle sur `fichier_a_produire` ;
  ligne d'exemple vérifiée puis supprimée.
- **Réalisé (2026-11-07)** : les anciens onglets du suivi manuel `Commandes` et `Listes` ont été renommés
  `Commandes (ancien)` et `Listes (ancien)` (rien supprimé) ; les 4 onglets du plan sont créés. Les onglets
  existants `Synthèse`, `Livre des recettes`, `Checklist`, `Modèles d'e-mails`, `Après-vente`, `Mode d'emploi`
  pointent toujours sur l'ancien onglet (à rebrancher plus tard si utile). Fuseau passé à `Europe/Paris`.
  Formules E et G testées sur une commande mixte (`openscad -D a=45 -D b=32 -o EV-2026-0001-pince-parasol.stl
  modeles/pince-parasol.scad`), protections en mode avertissement sur E, G et M, mise en forme conditionnelle
  (ligne orange en `fichier_a_produire`, Statut rouge en `incident`).

## Bloc B — Webhook → Sheet + e-mail « commande reçue »

- **Objectif** : à `checkout.session.completed`, ajouter la commande au Sheet sans doublon, statut initial
  selon le type, e-mail client « commande reçue » (Brevo), ligne dans le Journal.
- **Fichiers** : `worker/src/google.js` (nouveau : JWT RS256 WebCrypto, jeton en cache 1 h, lecture/écriture
  par nom de colonne), `worker/src/sheet.js` (nouveau : commandes), `worker/src/index.js` (webhook),
  `worker/src/email.js` (e-mail client), `worker/test/`, README « Paiement ».
- **N° de commande** : méthode sans collision à choisir et documenter ici (ex. compteur dérivé du Sheet sous verrou
  + repli sur l'identifiant Stripe, ou séquence déterministe).
- **Critères d'acceptation** :
  1. Module Google testé (signature JWT vérifiable avec la clé publique, cache du jeton).
  2. Un même événement reçu deux fois n'ajoute qu'une ligne.
  3. Statut initial : `payee` (standard) ou `fichier_a_produire` (sur-mesure) ; `Pièce` au format ci-dessus.
  4. Google en erreur → réponse 5xx.
  5. Sans `GOOGLE_SA_EMAIL`/`GOOGLE_SA_KEY`/`SHEET_ID` : rien ne change, la fiche Brevo actuelle part toujours.
  6. Tests avec Google et Brevo simulés, `cd worker && node --test` vert.

## Bloc C — Liens fournisseur

- **Objectif** : jetons HMAC `commande.action.fabricant.expiration.signature` (14 jours), `GET /f/<jeton>`
  (page avec un bouton, style du site), `POST /f/<jeton>` (transition, Journal), formulaire d'expédition.
- **Fichiers** : `worker/src/jeton.js` (nouveau), `worker/src/fournisseur.js` (nouveau), `worker/src/index.js`,
  `worker/test/`, README.
- **Critères d'acceptation** :
  1. Jeton falsifié → refus ; jeton expiré → refus avec message clair.
  2. GET ne modifie rien.
  3. Double clic → « déjà confirmée », une seule ligne de Journal.
  4. Transition interdite (ex. `expedier` depuis `payee`) → refus.
  5. `expedier` exige transporteur + n° de suivi, écrit K et L.
  6. Sans `HMAC_SECRET` : routes `/f/` en 503 propre, reste du Worker intact.

## Bloc D — Tâche planifiée + e-mails selon le statut

- **Objectif** : cron Cloudflare toutes les 10 min ; quand `Statut` ≠ `Dernier statut notifié` : envoyer l'e-mail dû
  puis mettre à jour M. `envoyee_fabricant` → e-mail fournisseur (pièce, cotes, coloris, lien STL, liens
  accepter/expédier, adresse seulement si `Livre le client` = oui) ; `expediee` → e-mail client avec le suivi ;
  relance au propriétaire si pas d'`acceptee` 48 h après l'envoi (date tirée du Journal).
- **Fichiers** : `worker/wrangler.toml` (`[triggers] crons`), `worker/src/planifie.js` (nouveau),
  `worker/src/index.js` (`scheduled`), `worker/src/email.js`, `worker/test/`, README.
- **Critères d'acceptation** :
  1. Rien n'est envoyé deux fois (deux passages successifs → un seul e-mail).
  2. M n'est mis à jour qu'après un envoi réussi.
  3. Pas d'adresse client au fabricant s'il ne livre pas le client.
  4. Une seule relance par commande.
  5. Sans secrets : la tâche ne fait rien, sans erreur.

## Bloc E — R2 + recette complète

- **Objectif** : bucket R2 des STL standards et `GET /fichier/<jeton>` ; Google comme sous-traitant dans
  `confidentialite/` (source `tools/pages-legales/`) ; recette **sans captures** (`curl` + `node --test`, Stripe test)
  des parcours standard et sur-mesure, du paiement à `expediee` ; checklist finale des secrets et des modèles Brevo.
- **Fichiers** : `worker/wrangler.toml` (binding R2), `worker/src/fichier.js` (nouveau), `tools/pages-legales/`,
  pages générées, `worker/test/`, README.
- **Critères d'acceptation** :
  1. `/fichier/<jeton>` : jeton valide → STL ; falsifié/expiré → refus.
  2. Sans binding R2 : 503 propre.
  3. Page de confidentialité à jour et republiée.
  4. Recette des deux parcours documentée ici (commandes lancées, résultats).
  5. Checklist des secrets et modèles Brevo ajoutée à « À faire par le propriétaire ».

## Suivi

| Bloc | Statut | Session | PR | Date |
|------|--------|---------|----|------|
| A | fait | session_01GS5VpHVaTuCX1b9qmaJGA4 | — (Sheet seul) | 2026-11-07 |
| B | à faire | — | — | — |
| C | à faire | — | — | — |
| D | à faire | — | — | — |
| E | à faire | — | — | — |

## À faire par le propriétaire

1. **Fabricant** : remplir la ligne 2 de l'onglet `Fabricants` (nom, e-mail, délai, livre le client oui/non).
2. **Google Cloud** (avec evarysth@gmail.com) : console.cloud.google.com → créer un projet (ex. `evarysth`)
   → « API et services » → activer **Google Sheets API**.
3. **Compte de service** : « IAM et administration » → « Comptes de service » → créer (ex. `worker-commandes`,
   aucun rôle) → onglet « Clés » → « Ajouter une clé » → JSON. Garder le fichier hors du dépôt.
4. **Partager le Sheet** en **Éditeur** avec l'e-mail du compte de service (`…@….iam.gserviceaccount.com`).
5. **Secrets Cloudflare** (dans `worker/`) :
   - `npx wrangler secret put GOOGLE_SA_EMAIL` → champ `client_email` du JSON ;
   - `npx wrangler secret put GOOGLE_SA_KEY` → champ `private_key` du JSON (tout le bloc `-----BEGIN PRIVATE KEY-----…`) ;
   - `npx wrangler secret put SHEET_ID` → l'identifiant dans l'URL du Sheet (entre `/d/` et `/edit`) ;
   - `npx wrangler secret put HMAC_SECRET` → une valeur aléatoire longue (ex. `openssl rand -hex 32`).
6. Supprimer le fichier JSON de la clé une fois les secrets enregistrés.
