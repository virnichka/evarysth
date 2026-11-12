# Traitement des commandes (Sheet, e-mails, fabricants, /admin)

Vue d'ensemble du circuit : README « Paiement et commandes ». Génération des fichiers d'impression : `docs/fabrication.md`.
Le Sheet back-office n'est identifié que par le secret `SHEET_ID` (jamais écrit dans le dépôt, qui est public).

## Règles
- **Google Sheets = back-office**, lu et écrit par un **compte de service** (JWT RS256 signé en WebCrypto, sans
  bibliothèque, jeton en cache 1 h). **Stripe reste la référence pour l'argent** (reçus, remboursements).
- **Rien ne part chez un fabricant sans validation**, faite dans /admin.
- **Toujours chercher une ligne par sa clé** (n° de commande), jamais par sa position : le propriétaire trie et filtre.
- **Webhook sans doublon** : commande déjà présente (Stripe session id) → rien n'est ajouté ; Google en erreur → 5xx
  pour que Stripe réessaie.
- **Tâche planifiée Cloudflare toutes les 10 min** : quand `Statut` ≠ `Dernier statut notifié`, envoyer l'e-mail dû puis
  mettre à jour cette colonne (e-mail → colonne → Journal). Aucun script Google.
- **RGPD** : Google et Brevo cités dans `confidentialite/` (source `tools/pages-legales/`) ; l'adresse du client n'est
  transmise au fabricant que s'il livre le client lui-même, jamais son e-mail.

## Statuts
- **Article** (`Commandes CF`, `STATUTS` de `worker/src/planifie.js`, menu `Listes!A2:A13`) : `lien_stl_a_indiquer`,
  `a_valider`, `payee`, `fichier_a_produire`, `envoyee_fabricant`, `acceptee`, `a_reexpedier`, `expediee`, `livree`,
  `incident`, `remboursee`, `annulee`.
  - Départ (`statutInitial`, `sheet.js`) : `a_valider` si le fichier STL est connu (standard présent dans R2), sinon
    `lien_stl_a_indiquer` ; fichiers de la chaîne de fabrication prêts → `a_valider`. `payee` / `fichier_a_produire`
    restent reconnus pour les commandes anciennes.
  - L'e-mail fabricant ne part jamais sans lien STL (saisi ou dans R2) : sinon la CF attend « lien STL manquant ».
- **Commande client** (`Commandes EV`, formule ; `statutEV` de `planifie.js`, à garder identiques), calculé sur les
  articles hors `annulee`/`remboursee` : `incident` si un article l'est ; `livree` si tous livrés ; `expediee` si tous
  partis ; `partiellement_expediee` si une partie est partie ; `en_fabrication` si au moins un est
  `envoyee_fabricant`/`acceptee`/`a_reexpedier` ; sinon `payee`. Tout annulé → `annulee` (`remboursee` s'il y en a un).
  `Statut forcé` remplace le calcul (le vider pour y revenir). La tâche planifiée journalise chaque changement.

## Structure du Sheet (contrat entre le Sheet et le Worker)
Le Worker lit et écrit **par nom de colonne** (ligne 1) ; les lettres ci-dessous sont indicatives. Les en-têtes affichés
peuvent être plus parlants que les noms internes : correspondance dans `NOMS_AFFICHES` (`worker/src/google.js`, les deux
noms sont acceptés). Pour renommer une colonne : ajouter la ligne dans `NOMS_AFFICHES`, publier, puis changer l'en-tête.
Les en-têtes calculés (`Statut commande`, `N° fabricant (CF)` de `Commandes EV`, `Prochaine action`) se changent dans le
texte de leur formule.

Deux numérotations qui ne se croisent jamais :
- **commande client** `EV-AAAA-NNNN` (`Commandes EV`, une ligne par achat) : seul n° que voit le client ;
- **commande fournisseur** `CF-AAAA-NNNN-X` (`Commandes CF`, une ligne par article) : seul n° que voit le fabricant.
  Même `AAAA-NNNN` que la commande client ; la lettre distingue les fabricants. Les articles d'une même commande confiés
  au même fabricant portent le même n° CF : un seul e-mail, un seul colis.

### Onglet `Commandes EV` (ligne 1 = en-têtes, figée)
| Col | En-tête | Écrit par | Format |
|-----|---------|-----------|--------|
| A | Commande | Worker | `EV-AAAA-NNNN` (clé) |
| B | Date | Worker | `AAAA-MM-JJ HH:MM` (heure de Paris) |
| C | Statut | **formule** (en-tête, `MAP` + `COUNTIFS` sur `Commandes CF`) | ne jamais écrire |
| D | Statut forcé | propriétaire | vide, `incident`, `remboursee`, `annulee` |
| E | Type | Worker | `standard` ou `sur-mesure` (sur-mesure si au moins un article l'est) |
| F | Articles | Worker | un par ligne : `<produit> · <taille M \| a=45 b=32> · <matière> · <coloris> · ×<qté>` |
| G | Client | Worker | 3 lignes : nom / e-mail / adresse |
| H | Commandes CF | **formule** (en-tête, `MAP` + `FILTER`) | ne jamais écrire |
| I | Cadeau / message | Worker | vide, ou `oui` / `oui · <message>` |
| J | Dernier statut notifié | **Worker seulement** | `payee` une fois l'e-mail « commande reçue » parti |
| K | Stripe session id | Worker | `cs_test_…` |
| L | Notes | propriétaire | libre |
| M à Q | Environnement · Total TTC (€) · dont livraison (€) · Remise (€) · Frais Stripe (€) | Worker | **facultatives** : `test` / `live`, puis montants (euros TTC) ; frais Stripe lus juste après le paiement, sinon complétés par la tâche planifiée (`finances.js`) |
| R à T | Coûts fabricants (€) · Frais d'envoi (€) · Marge TTC (€) | **formules** (`MAP` + `SUMIFS` sur `Commandes CF`) | ne jamais écrire ; marge vide tant qu'un coût ou les frais Stripe manquent |

### Onglet `Commandes CF` (ligne 1 = en-têtes, figée)
| Col | En-tête | Écrit par | Format |
|-----|---------|-----------|--------|
| A | Commande CF | **tâche planifiée** | `CF-AAAA-NNNN-X`, vide tant que le fabricant n'est pas choisi |
| B | Commande EV | Worker | `EV-AAAA-NNNN` |
| C | Article n° | Worker | `1`, `2`… ; clé de la ligne = Commande EV + Article n° |
| D | Date | Worker | celle de la commande EV |
| E | Statut | Worker, propriétaire, fabricant (liens) | menu (statuts d'article) |
| F | Type | Worker | `standard` ou `sur-mesure` |
| G | Action requise | **formule** (en-tête, `MAP`) | ne jamais écrire |
| H | Article | Worker | même format que `Articles` (matière du catalogue) |
| I | Fabricant | propriétaire (/admin ou Sheet) | menu (`Fabricants!A`) |
| J | Lien STL | propriétaire | URL (vide si les fichiers sont générés : liens recalculés à chaque e-mail) |
| K | Transporteur | Worker (lien fournisseur) ou propriétaire | menu (`Listes!C`) |
| L | N° de suivi | Worker (lien fournisseur) ou propriétaire | texte |
| M | Dernier statut notifié | **Worker seulement** (protégée) | statut ou vide |
| N | Notes | propriétaire | libre (le Worker ajoute une note datée en cas de refus / retrait) |
| O | Référence externe | propriétaire | **facultative** : n° de commande chez le fournisseur |
| P à U | Génération · SHA · Masse g · Temps min · Plateaux · Motif génération | Worker (chaîne de fabrication) | **facultatives**, voir `docs/fabrication.md` |
| V | Coût fabricant (€) | /admin (pli « Coûts ») | **facultative** : un seul montant par n° CF, sur sa première ligne |
| W | Frais d'envoi (€) | /admin (pli « Coûts ») | **facultative** : port payé par Evarysth, même règle |
Colonnes facultatives absentes → ignorées sans erreur.

### Onglet `Journal`
`Date` · `Commande` (n° EV ou n° CF) · `Ancien statut` · `Nouveau statut` · `Auteur` (`worker`, `fabricant`,
`proprietaire`). Ajout en fin (`values.append` autorisé ici seulement). Les changements faits à la main dans le Sheet
sont journalisés par la tâche planifiée (auteur `proprietaire`). Entrées particulières : `relance_48h`,
`generation_relancee`, `regeneree_sha_actuel`, `refusee_fabricant`, `fabrication_non_configuree`.

### Onglet `Fabricants`
`Nom` · `E-mail` · `Délai (jours)` · `Livre le client` (`oui`/`non`) · `Envoi` (facultative : `e-mail`, `manuel` ou
`atelier`). Le nom doit être exactement celui choisi dans la colonne `Fabricant`.
- `e-mail` : e-mail fabricant avec liens d'action ; relance au propriétaire si pas d'`acceptee` 48 h après l'envoi.
- `manuel` (plateforme, téléphone…) : « Valider » passe directement à `acceptee` sans e-mail ; le pli de la CF affiche la
  fiche à transmettre, puis « Déclarer l'expédition ». Pas de relance ni de « Renvoyer l'e-mail ».
- `atelier` : comme `manuel`, proposé et accepté seulement si la matière de la fiche d'impression est PLA ou PETG
  (`MATIERES_ATELIER`, même liste que `PROFILS_FILAMENT` de `tools/trancher.mjs`, vérifié par test).

**Fabricant qui ne livre pas le client** (`Livre le client` = non, hors `atelier`) : sa pièce vient chez Evarysth.
« Déclarer l'expédition » devient « Confirmer l'envoi à l'atelier » (e-mail fabricant : « Pièce à nous renvoyer ») :
l'article passe à `a_reexpedier`, transporteur et suivi vont dans `Notes`, aucun e-mail au client. Le propriétaire
contrôle la pièce, puis « Déclarer l'expédition au client » dans /admin → `expediee` + e-mail client. Un article
`a_reexpedier` reste « en fabrication » pour le client, annulable / remboursable, pas retirable.

### Onglet `Listes`
A `Statuts` (statuts d'article, `A2:A13`), B `Types`, C `Transporteurs` (menu de la page fabricant « Expédier », relu à
chaque affichage, valeur hors liste refusée ; onglet illisible → liste de secours dans `fournisseur.js`), D `Statuts EV`
(pour mémoire).

### Règles d'écriture du Worker
- **Nouvelle commande, méthode « écrire puis vérifier »** (`enregistrerCommande`, `sheet.js` ; Google n'offre pas de
  verrou) : lecture de `Commande` et `Stripe session id` (session déjà là → rien) ; n° = plus grand `EV-<année>-NNNN` + 1,
  ligne = 1re ligne dont `Commande` est vide ; `values.update` (RAW, `null` pour les cellules de formule), attente 2 s,
  relecture. Deux webhooks simultanés visent la même ligne : un seul reste, l'autre recommence. 5 essais, puis 503.
  Puis une ligne CF par article (1res lignes dont B est vide, même méthode). Rejeu Stripe : seuls les articles absents
  sont écrits. Jamais de `values.append` sur ces deux onglets ; la 1re ligne vide doit exister dans la grille.
- `Dernier statut notifié` = statut initial à la création (pas d'e-mail ni de Journal pour l'état initial).
- **n° CF** (tâche planifiée) : pour les articles pas encore envoyés, même commande EV + même fabricant → même n° ; un
  groupe inchangé garde sa lettre ; un article déjà envoyé n'est jamais renuméroté ; fabricant effacé → n° effacé ; un
  n° CF rendu n'est jamais réattribué.
- **Suivi** : transporteur + n° de suivi saisis sur une ligne d'une CF sont recopiés sur ses autres lignes.
- `valueInputOption=RAW` ; le Sheet est en `fr_FR`, `Europe/Paris` (une formule écrite par l'API utiliserait `;`).

## Liens fournisseur (`worker/src/jeton.js`, `fournisseur.js`)
- Jeton `commande.action.fabricant.expiration.signature`, HMAC-SHA256 (`HMAC_SECRET`), 14 jours, rien à stocker ; il porte
  le n° CF.
- `GET /f/<jeton>` n'affiche qu'une page avec un bouton (les robots de messagerie ouvrent les liens) ; `POST` revérifie
  le jeton, n'accepte que la transition prévue, écrit le statut puis le Journal ; un 2e clic affiche « déjà confirmée ».
- Actions : `accepter` (`envoyee_fabricant` → `acceptee`), `expedier` (transporteur + n° de suivi → `expediee`),
  `refuser` (motif facultatif) : les lignes repassent à `a_valider` / `lien_stl_a_indiquer`, `Fabricant` et
  `Commande CF` vidés, note datée, Journal `refusee_fabricant`, e-mail au propriétaire. Même effet depuis /admin
  (« Retirer au fabricant », e-mail au fabricant) ; les anciens liens affichent « Commande retirée ».
- Lignes `annulee`/`remboursee` ignorées ; une ligne en `incident` bloque l'action (409) ; autre fabricant → 403.
- Fichiers : `GET /fichier/<jeton>` (R2, 14 jours ; 403 falsifié, 410 expiré, 404 absent, 503 sans binding ou secret).
  Clés R2 des STL standards : `<produit>/<taille>.<stl|zip>` (taille en minuscules sans accents : `m`, `Ø 12` → `12`).

## Page d'administration /admin
- Adresse : `https://evarysth-admin.virnichka.workers.dev/admin`. Worker `evarysth-admin` (`wrangler.toml`
  `[env.admin]`) = simple relais derrière **Cloudflare Access** vers le Worker public (liaison de service `PUBLIC`, aucun
  secret) ; le Worker public ne sert `/admin` que pour l'adresse `ADMIN_HOST`, 404 sinon. Le domaine `evarysth.fr` est
  chez OVH : `ADMIN_HOST` à changer si le DNS passe chez Cloudflare.
- Accès : JWT `Cf-Access-Jwt-Assertion` revérifié (`acces.js` : signature, émetteur, audience `ACCESS_AUD`, expiration,
  e-mail dans `ADMIN_EMAILS`). Variables vides → 403 pour tous.
- Page HTML sans script (CSP `default-src 'none'`) ; chaque POST : Origin = la page, jeton anti-falsification lié à
  l'e-mail Access (12 h), relecture du Sheet et tout contrôlé avant d'écrire. Valider : fabricant, lien, n° CF,
  `envoyee_fabricant`, e-mail fabricant immédiat (en échec, la tâche planifiée le renvoie), Journal ; double clic →
  « déjà validée ». Aussi : bloquer / débloquer, retirer au fabricant, marquer acceptée, déclarer l'expédition, coûts.
- Onglets (`?vue=`) : Commandes (recherche `?q=` par n° EV, n° CF ou nom ; filtres `?f=`), Tableau de bord (alertes
  relance 48 h, commande sans fabricant depuis 24 h, génération en échec), Catalogue, Fabricants, Système (voyants des
  secrets et bindings, mode test/live, dernier passage de la tâche, « Lancer la tâche maintenant »), Liens. Bandeau après
  action signé, valable 2 min (cookie `admin_flash`). Icônes servies depuis `worker/src/icones.js` (généré par
  `tools/icones-admin.mjs`).

## Secrets du Worker (`cd worker && npx wrangler secret put <NOM>` ; aucun dans le dépôt)
| Secret | Rôle | Source |
|--------|------|--------|
| `STRIPE_SECRET_KEY` | API Stripe | Stripe → Développeurs → Clés API |
| `STRIPE_WEBHOOK_SECRET` | signature du webhook | Stripe → Webhooks → endpoint `<Worker>/webhook` (`checkout.session.completed`) |
| `BREVO_API_KEY` | tous les e-mails | Brevo → SMTP et API → Clés API |
| `ORDER_EMAIL` | fiche « Nouvelle commande » et relances 48 h | adresse(s) du propriétaire, séparées par des virgules |
| `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY` | compte de service | JSON de clé du compte de service : `client_email`, `private_key` (tout le bloc) |
| `SHEET_ID` | classeur des commandes | URL du Sheet, entre `/d/` et `/edit` |
| `HMAC_SECRET` | liens fournisseur, `/fichier/`, /admin | `openssl rand -hex 32` (le changer invalide les liens envoyés) |
| `GH_ACTIONS_TOKEN`, `FABRICATION_HMAC` | chaîne de fabrication | `docs/fabrication.md` |

- Compte de service : projet Google Cloud avec l'API Google Sheets activée, compte sans rôle, clé JSON (supprimée une fois
  les secrets posés), Sheet partagé en **Éditeur** avec son e-mail.
- Brevo : contenus des e-mails dans `worker/src/email.js` (aucun modèle Brevo) ; domaine `evarysth.fr` authentifié
  (SPF/DKIM/DMARC), expéditeur `EMAIL_FROM`, réponses vers l'e-mail du client ou `REPLY_TO`.
- Access : `ACCESS_AUD` et `ACCESS_TEAM_DOMAIN` dans `[vars]` du Worker public (tag AUD de l'application Access).
- Sans secrets Google, le webhook et la tâche planifiée ne touchent pas au Sheet (aucune erreur).

## Règles d'usage du Sheet
- Ne jamais supprimer une ligne de commande : passer à `annulee` (ou `remboursee` après remboursement dans Stripe) sur
  les lignes de `Commandes CF`, ou dans `Statut forcé` de la commande EV.
- Ne rien écrire dans les colonnes de formule ni dans `Commande CF` et `Dernier statut notifié`.
- Au quotidien, tout se fait dans /admin ; dans le Sheet, passer **toutes les lignes d'une même CF** ensemble.
- Fabricant qui répond autrement que par ses liens : sur le pli de la CF, « Il a répondu autrement » → « Marquer
  acceptée » / « Déclarer l'expédition ».
- Changer de fabricant après l'envoi : « Retirer au fabricant » dans /admin, puis valider avec un autre.
