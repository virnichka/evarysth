# Traitement des commandes V1

> **État actuel (9 novembre 2026)** : résumé dans le README, « Paiement et commandes ». Le circuit en vigueur est celui
> du **bloc G** (point de verrou + page `/admin`) ; les blocs A à F sont l'historique de construction (certains détails,
> comme « fourni séparément » ou le choix du fabricant dans le Sheet, ont été remplacés par le bloc G).
> Depuis le 9 novembre 2026 : R2 activé et génération automatique des fichiers à chaque commande payée, voir
> `docs/chaine-fabrication.md` (colonnes P à U de `Commandes CF`).

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
  - Sur-mesure (la majorité des ventes) : arrivée directe en `fichier_a_produire` ; le propriétaire fournit le STL
    (aujourd'hui généré par la chaîne de fabrication, `docs/chaine-fabrication.md`), colle un lien, puis passe à `envoyee_fabricant`.
- **Onglets** (bloc F : `Commandes` remplacé par `Commandes EV` + `Commandes CF`, voir « Structure du Sheet ») : `Commandes`, `Journal` (une ligne par changement de statut : date, commande,
  ancien → nouveau, auteur), `Fabricants` (**un seul** en V1 : nom, e-mail, délai), `Listes`.
- **Colonnes de Commandes** : Commande (`EV-AAAA-NNNN`, clé unique) · Date · Statut ▼ · Type
  (standard/sur-mesure) · Action requise (formule) · Pièce (produit, taille ou cotes, coloris, qté) · Client (nom, e-mail, adresse) · Fabricant ▼ ·
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
  - Trois actions : `accepter` (`envoyee_fabricant` → `acceptee`), `expedier` (formulaire
    transporteur + n° de suivi → `expediee`) et `refuser` (motif facultatif, depuis `envoyee_fabricant` ou `acceptee`) :
    les lignes de la CF repassent à `a_valider` (ou `lien_stl_a_indiquer`) avec `Fabricant` et `Commande CF` vidés,
    une note datée est ajoutée à `Notes`, Journal `refusee_fabricant` (auteur `fabricant`), e-mail au propriétaire.
    Le même effet s'obtient depuis /admin (« Retirer au fabricant », auteur `proprietaire`, e-mail au fabricant).
    Un n° CF rendu n'est jamais réattribué ; ses anciens liens affichent « Commande retirée ».
- **Fichiers** : STL standards sur R2, servis par `GET /fichier/<jeton>` (lien temporaire) ;
  sur-mesure = lien Drive collé à la main.
- **RGPD** : mentionner Google (Sheets/Drive) comme sous-traitant dans `confidentialite/`
  (source `tools/pages-legales/`) ; l'adresse client n'est transmise au fabricant que s'il livre le client lui-même.
- Textes en français, ton du site, sans promesse invérifiable.

## Structure du Sheet (contrat entre le Sheet et le Worker)

Établie au bloc A, revue au bloc F (commande client / commandes fournisseur). Le Worker lit/écrit **par nom de
colonne** (ligne 1), jamais par position figée ; les lettres ci-dessous sont l'état initial.

Deux niveaux, deux numérotations qui ne se croisent jamais :
- **commande client** `EV-AAAA-NNNN` (onglet `Commandes EV`, une ligne par achat) : seul n° que voit le client ;
- **commande fournisseur** `CF-AAAA-NNNN-X` (onglet `Commandes CF`, une ligne par article) : seul n° que voit le
  fabricant. Même `AAAA-NNNN` que la commande client ; la lettre (A, B…) distingue les fabricants. Les articles d'une
  même commande client confiés au même fabricant portent le même n° CF : un seul e-mail, un seul colis.

### Onglet `Commandes EV` (ligne 1 = en-têtes, figée)

| Col | En-tête | Écrit par | Format |
|-----|---------|-----------|--------|
| A | Commande | Worker | `EV-AAAA-NNNN` (clé ; recherche par la colonne Stripe session id contre les doublons) |
| B | Date | Worker | `AAAA-MM-JJ HH:MM` (heure de Paris) |
| C | Statut | **formule** (en-tête, `MAP` + `COUNTIFS` sur `Commandes CF`) | ne jamais écrire ; statut forcé s'il y en a un, sinon calculé |
| D | Statut forcé | propriétaire | menu : vide, `incident`, `remboursee`, `annulee` |
| E | Type | Worker | `standard` ou `sur-mesure` (sur-mesure si au moins un article l'est) |
| F | Articles | Worker | un article par ligne : `<produit> · <taille M \| a=45 b=32> · <matière> · <coloris> · ×<qté>` |
| G | Client | Worker | 3 lignes : nom / e-mail / adresse |
| H | Commandes CF | **formule** (en-tête, `MAP` + `FILTER`) | ne jamais écrire ; n° CF de la commande, un par ligne |
| I | Cadeau / message | Worker | vide, ou `oui` + message |
| J | Dernier statut notifié | **Worker seulement** (repliée avec K) | `payee` une fois l'e-mail « commande reçue » parti |
| K | Stripe session id | Worker | `cs_test_…` |
| L | Notes | propriétaire | libre |

Statut client (formule, même règle que `statutEV` dans `planifie.js`, à garder identiques), calculé sur les articles de
la commande hors `annulee`/`remboursee` : `incident` si un article l'est ; `livree` si tous livrés ; `expediee` si
tous partis ; `partiellement_expediee` si une partie est partie ; `en_fabrication` si au moins un est
`envoyee_fabricant`/`acceptee` ; sinon `payee`. Tout annulé → `annulee` (`remboursee` s'il y en a un). Un
`Statut forcé` remplace le calcul (à vider pour revenir au calcul). La tâche planifiée n'écrit rien dans cet onglet :
elle journalise seulement chaque changement de `Statut` (auteur `worker`).

### Onglet `Commandes CF` (ligne 1 = en-têtes, figée)

| Col | En-tête | Écrit par | Format |
|-----|---------|-----------|--------|
| A | Commande CF | **tâche planifiée** | `CF-AAAA-NNNN-X`, vide tant que le fabricant n'est pas choisi |
| B | Commande EV | Worker | `EV-AAAA-NNNN` |
| C | Article n° | Worker | `1`, `2`… dans la commande ; clé de la ligne = Commande EV + Article n° |
| D | Date | Worker | celle de la commande EV |
| E | Statut | Worker puis propriétaire / fabricant (liens) | menu (`Listes!A`, les 9 statuts) |
| F | Type | Worker | `standard` ou `sur-mesure` |
| G | Action requise | **formule** (en-tête, `MAP`) | ne jamais écrire |
| H | Article | Worker | `<produit> · <taille M \| a=45 b=32> · <matière> · <coloris> · ×<qté>` (matière du catalogue) |
| I | Fabricant | **propriétaire** | menu (`Fabricants!A`) ; vide à la création |
| J | Lien STL | propriétaire (sur-mesure) | URL Drive |
| K | Transporteur | Worker (lien fournisseur) ou propriétaire | menu (`Listes!C`) |
| L | N° de suivi | Worker (lien fournisseur) ou propriétaire | texte |
| M | Dernier statut notifié | **Worker seulement** (protégée, avertissement, repliée) | une valeur de statut ou vide |
| N | Notes | propriétaire | libre (le Worker y ajoute une note datée en cas de refus / retrait) |
| O | Référence externe | propriétaire (/admin ou Sheet) | **facultative** : n° de commande chez le fournisseur (plateforme…) ; en-tête à ajouter pour activer le champ dans /admin |
| P | Génération | Worker (chaîne de fabrication) | `a_declencher`, `en_cours`, `prete`, `echec`, `fabrication_non_configuree` |
| Q | SHA | Worker | version du site (commit) utilisée pour les fichiers |
| R | Masse g | Worker (rappel du workflow) | masse de filament estimée |
| S | Temps min | Worker (rappel du workflow) | temps d'impression estimé |
| T | Plateaux | Worker (rappel du workflow) | nombre de plateaux |
| U | Motif génération | Worker | raison d'un `echec`, vide sinon |

Colonnes Q à V (`docs/chaine-fabrication.md`, Fabrication · phase 2) : lues et écrites **par leur nom** (ordre libre) ;
absentes → ignorées sans erreur.

Règles d'écriture pour le Worker :
- **Nouvelle commande** : ligne EV sur la 1re ligne dont A est vide (méthode « écrire puis vérifier », bloc B), puis une
  ligne CF par article sur les 1res lignes dont B est vide, même méthode ; `Dernier statut notifié` = statut initial
  (pas d'e-mail ni de Journal pour l'état initial). Rejeu Stripe : seuls les articles absents sont écrits.
  Cellules de formule envoyées à `null` (ignorées) ; jamais de `values.append` sur ces deux onglets.
- **n° CF** (tâche planifiée) : pour les articles pas encore envoyés (statut `payee`/`fichier_a_produire`, ou e-mail
  fabricant pas encore parti), groupe = même commande EV + même fabricant → même n° ; un groupe inchangé garde sa
  lettre ; un article déjà envoyé n'est jamais renuméroté (un nouvel article chez le même fabricant prend une
  nouvelle lettre) ; fabricant effacé → n° effacé.
- **Suivi** : transporteur + n° de suivi saisis sur une ligne d'une CF sont recopiés sur ses lignes qui n'en ont pas.
- **Mise à jour** : ligne EV retrouvée par son n° (colonne A) ; ligne CF par Commande EV + Article n° ; lien
  fournisseur : toutes les lignes portant le n° CF du jeton.
- Écrire avec `valueInputOption=RAW` (A et B sont au format texte ; évite qu'un texte soit converti en date).
- Le Sheet est en locale `fr_FR`, fuseau `Europe/Paris` : une formule écrite par l'API doit utiliser `;`
  comme séparateur d'arguments (le Worker n'écrit aucune formule).

### Onglet `Journal`
`Date` · `Commande` · `Ancien statut` · `Nouveau statut` · `Auteur` (`worker`, `fabricant`, `proprietaire`).
`Commande` porte un n° EV (création, statut client recalculé, auteur `worker`) ou un n° CF (statuts fournisseur, relance).
Ajout en fin (`values.append` autorisé ici). Les changements faits à la main dans le Sheet sont journalisés par
la tâche planifiée (auteur `proprietaire`) quand elle détecte `Statut` ≠ `Dernier statut notifié`.

### Onglet `Fabricants`
`Nom` · `E-mail` · `Délai (jours)` · `Livre le client` (`oui`/`non`, menu) · `Envoi` (**facultative** : `manuel`, sinon
e-mail). Une seule ligne en V1 (ligne 2), pré-remplie `À renseigner` / vide / `5` / `non`.
Envoi `manuel` (atelier interne, plateforme, téléphone…) : e-mail facultatif ; « Valider » dans /admin passe directement à
`acceptee` sans rien envoyer ; le pli de la CF affiche la fiche à transmettre (pièces, STL, délai, adresse si
`Livre le client` = oui), puis « Déclarer l'expédition » (e-mail client). Pas de relance 48 h, pas de « Renvoyer l'e-mail ».
Si la ligne passe à `envoyee_fabricant` dans le Sheet, la tâche la marque notifiée sans e-mail.

### Onglet `Listes`
Colonne A `Statuts` (les 9 statuts d'article, menu de `Commandes CF`), B `Types`, D `Statuts EV` (les 8 statuts client,
pour mémoire : `payee`, `en_fabrication`, `partiellement_expediee`, `expediee`, `livree`, `incident`,
`remboursee`, `annulee`), C `Transporteurs` (menu de la page fabricant « Expédier », lu à chaque
affichage ; valeur hors liste refusée ; onglet illisible → liste de secours dans `fournisseur.js`).

## Bloc A — Sheet

- **Objectif** : préparer le Sheet selon la structure ci-dessus (réalisé par le chef de projet, connecteur Google Sheets).
- **Fichiers** : aucun (Sheet seulement) ; ce document.
- **Critères d'acceptation** : 4 onglets ; en-têtes exacts ; menus Statut et Fabricant ; formule Action requise
  en en-tête (la formule « Commande OpenSCAD » de l'époque a été retirée avec la refonte géométrique) ; colonne M protégée ; mise en forme conditionnelle sur `fichier_a_produire` ;
  ligne d'exemple vérifiée puis supprimée.
- **Réalisé (2026-11-07)** : les anciens onglets du suivi manuel `Commandes` et `Listes` ont été renommés
  `Commandes (ancien)` et `Listes (ancien)` (rien supprimé) ; les 4 onglets du plan sont créés. Les onglets
  existants `Synthèse`, `Livre des recettes`, `Checklist`, `Modèles d'e-mails`, `Après-vente`, `Mode d'emploi`
  pointent toujours sur l'ancien onglet (à rebrancher plus tard si utile). Fuseau passé à `Europe/Paris`.
  Formules E et G testées sur une commande mixte, protections en mode avertissement sur E, G et M, mise en forme conditionnelle
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
- **Réalisé (2026-11-07)** :
  - **N° de commande, méthode retenue : « écrire puis vérifier »** (`enregistrerCommande`, `worker/src/sheet.js`).
    Google n'offre pas de verrou et le contrat interdit `values.append` sur Commandes, donc : (1) lecture des colonnes
    `Commande` et `Stripe session id` (session déjà présente → rien à faire) ; (2) n° = plus grand `EV-<année>-NNNN`
    de l'année (heure de Paris) + 1, ligne = 1re ligne dont `Commande` est vide ; (3) `values.update` (RAW, `null` pour
    les colonnes non écrites, dont E et G), attente de 2 s, relecture. Deux webhooks simultanés lisent le même état, donc
    visent la même ligne avec le même n° : un seul reste, l'autre ne se retrouve pas et recommence avec un état à jour
    (n° et ligne suivants). Deux commandes ne gardent jamais le même n°. 5 essais, puis erreur → 503 (Stripe réessaie).
    Limite : un n° supprimé à la main en fin de liste peut être réattribué ; ne pas supprimer de ligne (passer `annulee`).
  - Ordre du webhook : Sheet (ligne, sauf si déjà là) → e-mail client « commande reçue » (seulement si la ligne vient d'être
    ajoutée ; si Brevo réussit, `Dernier statut notifié` = statut initial, sinon reste vide et l'échec est journalisé dans
    Cloudflare) → ligne `Journal` (ancien statut vide, auteur `worker`, écrite une seule fois même si l'événement revient)
    → fiche de fabrication (inchangée, avec en plus « Back-office : EV-AAAA-NNNN »). Google en erreur : la fiche part quand
    même, puis réponse 503. Sans les 3 secrets Google : comportement d'avant, aucun appel à Google.
  - Fabricant : 1er `Nom` non vide de l'onglet `Fabricants`. `Cadeau / message` : `oui` ou `oui · <message>`.
    Coloris de `Pièce` : libellé du catalogue (ex. `Rose poudré`). La ligne « Emballage cadeau » n'apparaît pas dans `Pièce`.
  - Limite : la 1re ligne vide doit exister dans la grille (1 000 lignes par défaut) ; au-delà, ajouter des lignes au Sheet.

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
- **Réalisé (2026-11-07)** : `worker/src/planifie.js` + e-mails dans `worker/src/email.js`, tests
  `worker/test/planifie.test.mjs`. Ordre par ligne : e-mail → colonne M → Journal. Relance marquée dans le Journal
  (`Nouveau statut` = `relance_48h`, auteur `worker`), ignorée pour le calcul du dernier statut. Liens fournisseur vers
  la variable `WORKER_URL` (`wrangler.toml`). Le fabricant d'une ligne doit porter exactement le `Nom` de l'onglet
  `Fabricants` (menu) et avoir un e-mail, sinon la ligne attend.

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
- **Réalisé** (2026-11-07) :
  - `worker/src/fichier.js` + route `GET|HEAD /fichier/<jeton>` (`index.js`). Jeton `fichier.<clé b64url>.<exp>.<sig>`
    (helpers exportés de `jeton.js`), 14 jours ; 403 falsifié/autre secret/lien fournisseur, 410 expiré, 404 objet absent,
    405 autre méthode, 503 sans binding `STL` ou sans `HMAC_SECRET`. Clés R2 `<produit>/<taille>.<stl|3mf|zip>`
    (taille = libellé en minuscules sans accents : `m`, `moyenne`, `Ø 12` → `12`).
  - `planifie.js` : `Lien STL` vide → `liensStandards()` (un lien par ligne standard dont le fichier est dans R2 ;
    lignes sur-mesure ignorées ; R2 absent/en panne → « fourni séparément », l'e-mail part quand même).
  - **R2 non activé sur le compte Cloudflare** (API : « Please enable R2 through the Cloudflare Dashboard ») : bucket
    non créé, binding laissé **commenté** dans `wrangler.toml` (voir « À faire par le propriétaire », 7).
    *Depuis : R2 activé, binding `STL` actif (Fabrication · phase 2b, 9 novembre 2026).*
  - Confidentialité : Google (Sheets/Drive) sous-traitant, Brevo ajouté aux destinataires, fabricant (adresse seulement
    s'il livre le client, jamais l'e-mail) ; `node tools/generer-pages.mjs` → `confidentialite/index.html`.
- **Recette** (sans captures) :

  | Commande | Résultat |
  |----------|----------|
  | `cd worker && node --test` | 46 tests, 46 OK (dont 5 `fichier.test.mjs`, 3 `parcours.test.mjs`) |
  | `test/parcours.test.mjs` — standard | webhook Stripe signé (`cs_test_`) → ligne `payee`, fabricant par défaut, e-mail « commande reçue » + fiche Brevo ; tâche : rien au fabricant ; propriétaire → `envoyee_fabricant` ; tâche : e-mail `[TEST]` au fabricant avec lien `/fichier/` (STL téléchargé, octets identiques), sans adresse (`Livre le client` = non) ; GET `/f/` accepter → page seule ; POST → `acceptee` ; POST expédier (Colissimo + suivi) → `expediee` ; tâche : e-mail client avec transporteur et suivi, `Dernier statut notifié` = `expediee`, 3e passage sans effet. Journal : `payee/worker`, `envoyee_fabricant/proprietaire`, `acceptee/fabricant`, `expediee/fabricant` |
  | `test/parcours.test.mjs` — sur-mesure | webhook → `fichier_a_produire` (cotes dans Pièce) ; lien Drive collé + `envoyee_fabricant` ; e-mail fabricant avec le lien Drive, nom + adresse (`Livre le client` = oui), sans e-mail client ; puis même suite jusqu'à `expediee` ; Journal `fichier_a_produire/worker` → … → `expediee/fabricant` |
  | `test/parcours.test.mjs` — sans R2 | e-mail fabricant envoyé avec « fourni séparément » ; `/fichier/…` → 503 |
  | `curl $W/` (W = `https://evarysth-checkout.virnichka.workers.dev`) | 200 `{"service":"evarysth-checkout","mode":"test"}` |
  | `curl -X POST $W/checkout` (Origin site, `boite-rugged` standard M noir, puis sur-mesure 140×100×45) | 200, deux sessions Stripe `cs_test_…` (réf. `EV-261107-…`, `cgv: "case"`) |
  | `curl -X POST $W/webhook` sans signature | 400 « Signature invalide. » |
  | `curl $W/f/<faux jeton>` | 503 (en ligne : `HMAC_SECRET` / secrets Google pas encore posés → back-office inactif, sans erreur) |
  | `curl $W/fichier/<faux jeton>` (après déploiement) | 503 « Fichiers indisponibles pour le moment (configuration). » |

  Google, Brevo et R2 sont simulés dans les tests (secrets absents en ligne) ; le paiement réel des sessions test et
  la suite en ligne restent à faire par le propriétaire (« À faire », 12).

## Bloc F — Commande client (EV) et commandes fournisseur (CF)

Besoin : une commande peut mêler des articles qu'un même fabricant ne sait pas tous faire (matière, coloris).
- Onglet `Commandes` renommé `Commandes EV` (une ligne par achat) ; nouvel onglet `Commandes CF` (une ligne par article,
  fabricant choisi **à la main** : pas d'attribution automatique, faute de règles fiables pour l'instant).
- Le Worker écrit les deux au paiement (`sheet.js`) ; la tâche planifiée (`planifie.js`) attribue les n° CF, recopie le
  suivi dans la CF, envoie un e-mail par CF (fabricant) et par colis (client, « un colis de votre commande… / le reste
  suivra » quand il y a plusieurs CF). Statut client et liste des CF de la commande EV : formules du Sheet (le
  propriétaire peut forcer `incident`, `remboursee` ou `annulee` dans `Statut forcé`) ; la tâche journalise les
  changements de statut client.
- Liens fournisseur (`fournisseur.js`, `jeton.js`) : le jeton porte le n° CF (format `CF-AAAA-NNNN-X` exigé) ;
  accepter/expédier s'applique à toutes les lignes de la CF ; lignes `annulee`/`remboursee` ignorées ; une ligne en
  `incident` bloque l'action (409) ; une ligne confiée à un autre fabricant → 403.
- Frais de port : inchangés (un seul port payé par le client, colis multiples à la charge d'Evarysth).
- Transporteur et n° de suivi : sur la ligne CF (saisis par le fabricant via son lien, ou à la main).
- Tests : `test/planifie.test.mjs` (n° CF, statut client, colis), `test/parcours.test.mjs` (« deux fabricants »).

## Suivi

| Bloc | Statut | Session | PR | Date |
|------|--------|---------|----|------|
| A | fait | session_01GS5VpHVaTuCX1b9qmaJGA4 | — (Sheet seul) | 2026-11-07 |
| B | fait | session_01GS5VpHmWue7HWoi95gWYL7 | #52 | 2026-11-07 |
| C | fait | session_01GS5VpKRWwfCa8XJt9x4oFK | #53 | 2026-11-07 |
| D | fait | session_01GS5VpHmWB2agPXhtWWgf37 | #54 | 2026-11-07 |
| E | fait | session_01GS5VpKztszaCbXbHttRJK2 | #55 | 2026-11-07 |
| F | fait | session_01GS5VpLFnaQ2PVEEt3DgtCA | — | 2026-11-07 |
| G | fait | session_01GS5VpK81EPrmtM231yNafH | — | 2026-11-08 |

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
7. **Fait le 9 novembre 2026** (R2 activé, bucket créé, STL standards envoyés automatiquement par `stl-standards.yml`).
   Historique : **R2 (STL standards)** : tableau de bord Cloudflare → R2 → activer R2 (gratuit jusqu'à 10 Go). Puis dans `worker/` :
   `npx wrangler r2 bucket create evarysth-stl` ; décommenter le bloc `[[r2_buckets]]` de `wrangler.toml` (binding `STL`)
   et pousser sur `main`. Envoyer les STL : `npx wrangler r2 object put evarysth-stl/boite-rugged/m.stl --file boite-m.stl --remote`
   (une clé par produit et taille standard : `<produit>/<taille>.stl`, taille en minuscules sans accents ; `.zip` pour
   plusieurs pièces). Contrôle : `curl -I $W/fichier/x` → 403 (et non plus 503).

### Checklist finale (avant la 1re vraie commande)

8. **Secrets Cloudflare** (`cd worker && npx wrangler secret put <NOM>` ; aucun dans le dépôt) :

   | Secret | Rôle | Source |
   |--------|------|--------|
   | `STRIPE_SECRET_KEY` | API Stripe (sessions, lignes) | Stripe → Développeurs → Clés API (`sk_test_`/`rk_test_` en test) — déjà posé |
   | `STRIPE_WEBHOOK_SECRET` | signature du webhook | Stripe → Webhooks → endpoint `$W/webhook` (`checkout.session.completed`) → `whsec_…` — déjà posé |
   | `BREVO_API_KEY` | envoi de tous les e-mails | Brevo → SMTP et API → Clés API (`xkeysib-…`) |
   | `ORDER_EMAIL` | destinataire fiche de fabrication + relances 48 h | votre adresse (plusieurs : séparées par des virgules) |
   | `GOOGLE_SA_EMAIL` | compte de service (Sheet) | JSON de clé, champ `client_email` (étapes 2-4) |
   | `GOOGLE_SA_KEY` | clé privée du compte de service | JSON, champ `private_key` (tout le bloc) |
   | `SHEET_ID` | classeur des commandes | URL du Sheet, entre `/d/` et `/edit` |
   | `HMAC_SECRET` | liens fournisseur et `/fichier/` | `openssl rand -hex 32` (le changer invalide les liens envoyés) |

   Contrôle : `npx wrangler secret list` ; `curl $W/f/x` doit passer de 503 à une page « lien invalide ».
9. **Brevo** : aucun modèle à créer (contenus dans `worker/src/email.js`). Authentifier le domaine `evarysth.fr`
   (Expéditeurs, domaines et IP → Domaines : SPF/DKIM/DMARC), et l'expéditeur `commandes@evarysth.fr` (`EMAIL_FROM`) ;
   les réponses vont à l'e-mail du client ou `contact@evarysth.fr` (`REPLY_TO`), boîte à faire exister.
10. **Onglet `Fabricants`** : ligne 2 complète (nom identique à la colonne `Fabricant`, e-mail, délai, `Livre le client`).
11. **Webhook Stripe** : endpoint `$W/webhook` actif sur `checkout.session.completed` (mode test).
12. **Commande test réelle (mode test)** : site avec `?checkout=test` → panier (une pièce standard, puis une sur-mesure) →
    carte `4242 4242 4242 4242` → vérifier : une ligne dans `Commandes EV` (`payee`) et une par article dans `Commandes CF`
    (`payee` / `fichier_a_produire`), e-mail « commande reçue », fiche de fabrication ; dans `Commandes CF`, choisir le
    fabricant (n° CF attribué sous 10 min), puis passer à `envoyee_fabricant` (sur-mesure : coller d'abord le lien Drive) → sous 10 min, e-mail
    `[TEST]` au fabricant (mettre votre propre adresse dans `Fabricants` pour l'essai) → boutons accepter puis expédier →
    sous 10 min, e-mail d'expédition au client ; Journal complet. Puis remettre l'e-mail du vrai fabricant.

### Règles d'usage du Sheet
- Ne jamais supprimer une ligne de commande : passer son statut à `annulee` (ou `remboursee` après remboursement dans Stripe),
  sur les lignes de `Commandes CF` (le statut client suit), ou dans `Statut forcé` de la commande EV.
- Ne rien écrire dans `Statut` et `Commandes CF` (Commandes EV), ni dans `Commande CF`, `Action requise`
  et `Dernier statut notifié` (Commandes CF).
- Au quotidien, on travaille dans `Commandes CF` : choisir le fabricant, puis passer **toutes les lignes d'une même CF**
  à `envoyee_fabricant`. Le statut de `Commandes EV` se met à jour seul.
- Fabricant qui répond autrement que par ses liens (téléphone, e-mail) : sur le pli de la CF, « Il a répondu
  autrement » → « Marquer acceptée » et « Déclarer l'expédition » (transporteur de `Listes`, suivi facultatif, e-mail
  client immédiat ; Journal auteur `proprietaire`).
- Changer de fabricant après l'envoi : dans /admin, « Retirer au fabricant » sur le pli de la CF, puis valider avec
  un autre fabricant (à défaut, dans le Sheet : remettre les lignes à `payee`, choisir le nouveau fabricant, repasser à
  `envoyee_fabricant` ; l'ancien fabricant reçoit un refus s'il utilise encore ses liens).
- Trier et filtrer librement : le Worker retrouve chaque ligne par sa clé, jamais par sa position.
- Les onglets `Synthèse` et `Livre des recettes` lisent encore `Commandes (ancien)` : à rebrancher si tu veux les garder.

## Bloc G — Point de verrou + page d'administration (« télécommande »)

Décision (8 novembre 2026, propriétaire) : **aucun article ne part chez un fabricant sans validation**, faite depuis une
page mobile plutôt que dans l'appli Google Sheets.
- **Statuts de départ** (`sheet.js`, `statutInitial`) : `a_valider` si le fichier STL est connu (article standard présent
  dans R2), sinon `lien_stl_a_indiquer` (sur-mesure, ou standard sans R2). `payee` / `fichier_a_produire` restent
  reconnus pour les commandes antérieures. Statut client inchangé (`payee` tant que rien n'est parti).
- **Lien STL obligatoire** : l'e-mail fabricant ne part jamais sans lien (ni saisi ni dans R2) ; la tâche planifiée met la
  CF en attente « lien STL manquant » (fin du « fourni séparément »). Lien collé à la main dans le Sheet sur une ligne
  `lien_stl_a_indiquer` → la tâche la passe à `a_valider` (aucun e-mail).
- **Worker d'administration** `evarysth-admin` (`wrangler.toml` `[env.admin]`, `ROLE = "admin"`) : simple relais derrière
  Access vers le Worker public (liaison de service `PUBLIC`, aucun secret) ; le Worker public sert `/admin` seulement
  quand la requête porte l'adresse `ADMIN_HOST` (donc relayée), 404 sinon. Adresse : `https://evarysth-admin.virnichka.workers.dev/admin`
  (domaine `evarysth.fr` chez OVH : pas de sous-domaine Cloudflare ; `ADMIN_HOST` à changer si le DNS passe chez Cloudflare).
  - **Accès** : Cloudflare Access sur l'adresse workers.dev du Worker d'administration ; le Worker revérifie le JWT
    `Cf-Access-Jwt-Assertion` (`acces.js` : signature RS256 avec les clés de l'équipe, émetteur, audience `ACCESS_AUD`,
    expiration, e-mail dans `ADMIN_EMAILS` = `evarysth@gmail.com`). Variables vides → 403 pour tous.
  - **`GET /admin`** (`admin.js`, HTML sans script, CSP `default-src 'none'`) : commandes ayant un article avant envoi
    (fabricant au choix, « — plus tard — » possible, champ lien STL) ; commandes bloquées ; CF en cours (lecture seule).
  - **`POST /admin/valider`** : Origin = la page, jeton anti-falsification (HMAC lié à l'e-mail Access, 12 h), relecture
    du Sheet ; tout est contrôlé avant d'écrire (fabricant avec e-mail, lien https ou fichier R2) ; puis fabricant, lien,
    n° CF (`numerosCF`) et `envoyee_fabricant`, e-mail fabricant envoyé tout de suite, `Dernier statut notifié`, Journal
    (auteur `proprietaire`) ; redirection 303. Double clic → « déjà validée ». E-mail en échec → la tâche planifiée le
    renvoie (le statut est écrit, pas `Dernier statut notifié`).
  - **`POST /admin/bloquer`** (articles avant envoi → `incident`) et **`/admin/debloquer`** (articles bloqués jamais
    envoyés → `a_valider` / `lien_stl_a_indiquer`).
- Sheet : `Listes!A` (11 statuts, menu de `Commandes CF!E`), formule « Action requise », couleurs, `Mode d'emploi` mis à jour.
  - **Onglets** (`?vue=`) : Tableau de bord (compteurs, alertes relance 48 h et commande sans fabricant depuis 24 h),
    Catalogue (produits de `data.js`, STL présent / manquant dans R2 par taille standard), Système (voyant par secret
    ou binding, mode test/live, dernier passage de la tâche), Liens (Sheet construit depuis `SHEET_ID`, Stripe, Brevo…).
  - **`POST /admin/tache`** (onglet Système, mêmes protections) : lance la tâche planifiée tout de suite (remplace
    l'ancien `/maj` et le secret `ADMIN_KEY`, supprimés). Heure du dernier passage : métadonnée de développeur du
    classeur (`ID_PASSAGE`, invisible dans le Sheet), écrite à chaque passage.
  - **Lot 2** : bandeau après action signé (HMAC_SECRET), valable 2 min, affiché une seule fois (cookie `admin_flash`) ;
    recherche `GET /admin?q=` (n° EV, n° CF, nom) → fiche en lecture seule avec le Journal de l'EV et de ses CF ;
    onglet Fabricants (e-mail masqué, CF en cours et en retard au-delà du délai) ; icônes et manifeste servis sous
    `/admin/` depuis `worker/src/icones.js` (généré par `tools/icones-admin.mjs`), CSP `img-src 'self'; manifest-src 'self'`.
- Tests : `test/admin.test.mjs` (accès, page, validation, double clic, requêtes étrangères, panne Brevo, blocage, onglets, tâche manuelle).
- Reporté à l'itération suivante : livre des recettes et `charge.refunded`.

### À faire par le propriétaire (bloc G)
13. **Cloudflare Zero Trust** (gratuit) : one.dash.cloudflare.com → créer l'équipe (nom → `<équipe>.cloudflareaccess.com`).
14. **Déployer le Worker d'administration** : fusion sur `main` (le workflow lance aussi `wrangler deploy --env admin`).
15. ~~Secrets du Worker d'administration~~ : inutile. Ce Worker n'est qu'un relais (liaison de service `PUBLIC`) vers le
    Worker public, qui a déjà tous les secrets et sert `/admin` uniquement pour l'adresse `ADMIN_HOST`.
16. **Activer Access** : tableau de bord Cloudflare → Workers → `evarysth-admin` → Paramètres → Domaines et routes →
    `workers.dev` → activer Cloudflare Access ; politique : e-mail = `evarysth@gmail.com`. Relever le **tag AUD** et
    le domaine de l'équipe, les reporter dans `[vars]` du Worker public (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`) et pousser.
17. Contrôle : `https://evarysth-admin.virnichka.workers.dev/admin` demande un code envoyé à evarysth@gmail.com, puis
    affiche EV-2026-0006 « à valider » ; sans connexion (navigation privée, autre e-mail) : refus.

## Idées gardées pour la V2
- ~~GitHub Action OpenSCAD~~ : remplacée par la chaîne de fabrication (`fabrication.yml`, `docs/chaine-fabrication.md`).
- Rebrancher `Synthèse` / `Livre des recettes` sur le nouvel onglet `Commandes EV`.
- Proposition automatique du fabricant (capacités dans `Fabricants` : matières, coloris, taille max, priorité).
- Proposer le fabricant d'après la matière de l'article (déjà dans la colonne `Article`).
