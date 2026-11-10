# Evarysth

> Le site est désormais en ligne sur **[www.evarysth.fr](https://www.evarysth.fr)**.

## Documentation (état au 9 novembre 2026)
| Document | Contenu | État |
|---|---|---|
| `README.md` (ce fichier) | Fonctionnement du site, des commandes et des outils | à jour |
| `CLAUDE.md` | Consignes pour Claude : ajout d'un produit 3D, contrôles, mise en ligne | à jour |
| `docs/traitement-commandes.md` | Circuit des commandes : Sheet, e-mails, fabricants, page /admin | en service (blocs A à G faits) |
| `docs/refonte-geometrie.md` | Moteur 3D unique (manifold-3d), 16 produits, contrôles automatiques | chantier clos |
| `docs/chaine-fabrication.md` | Commande payée → fichiers d'impression automatiques (R2), puis atelier et prix calculé | en cours : phases 0 à 3 faites, phase 4 (agent d'atelier) à venir |
| `docs/guide-reglages-fabrication.md` | Réglages des comptes Cloudflare, GitHub et Sheet pour la fabrication | fait |

## 1. Vue d'ensemble
Evarysth est une boutique en ligne de petites pièces d'intérieur imprimées en 3D (supports, clips, crochets…), présentées en 4 univers : Balcon, Bureau, Meubles, Déco.
Chaque pièce s'achète en taille standard ou **sur-mesure** : on règle ses cotes en mm avec des curseurs, et le modèle 3D (Three.js), le prix et le résumé se mettent à jour en direct avant l'ajout au panier.

Site 100 % statique (HTML/CSS/JavaScript, aucune installation ni compilation), publié automatiquement sur GitHub Pages (adresse : www.evarysth.fr) à chaque mise à jour de `main`.

## 2. Fichiers principaux

| Fichier | Rôle, en clair |
|---|---|
| `index.html` | **L'accueil et le gabarit.** Squelette de l'accueil (et des favoris, `#favoris`) ; sert aussi de modèle aux pages générées. |
| `catalogue/`, `univers/<id>/` | Pages catalogue et univers (`evarysth.fr/univers/balcon/`…), **générées** comme les pages produit. |
| `produits/<id>/index.html` | **Une vraie page par produit** (adresse `www.evarysth.fr/produits/<id>/`), **générée** : titre, description, aperçu de partage, données Google. Ne pas modifier à la main. |
| `sitemap.xml`, `robots.txt`, `404.html` | Plan du site pour les moteurs de recherche (généré), consignes aux robots, page « introuvable » (générée). |
| `assets/og/<id>.jpg` | Images d'aperçu quand on partage un lien (WhatsApp, réseaux…), 1200 × 630. |
| `produit.html` | Ancienne adresse : redirige vers `produits/<produit>/` (les anciens liens `#p-<produit>` aussi). |
| `assets/css/style.css` | Toute l'apparence : couleurs, polices, mise en page, thème clair/sombre, version mobile. |
| `assets/js/data.js` | **Le catalogue.** Univers, produits, prix, 3 tailles standard, curseurs sur-mesure (min/max), photos, matières (avec leur jeu d'ajustement) et fiche d'impression de chaque produit. C'est le fichier à modifier pour ajouter ou changer un produit. |
| `assets/js/app.js` | **Le chef d'orchestre.** Lit le type de page (`data-product-id`, `data-universe-id`, `data-page="catalogue"` sur le `<body>`, ou `#…` sur l'accueil), affiche la bonne vue, construit les cartes et la fiche produit, relie curseurs ↔ prix ↔ 3D. Contient aussi les icônes dessinées (`SHAPES`). |
| `assets/js/viewer3d.js` | **Le moteur 3D.** Charge Three.js et le moteur géométrique seulement quand une fiche en a besoin, affiche et fait tourner la pièce. Si la 3D ne peut pas s'afficher (WebGL absent, WASM bloqué), la fiche montre la 1re photo ou la vignette 3D avec un message court. |
| `assets/js/geo.js` | **Moteur géométrique** (`docs/refonte-geometrie.md`), commun au navigateur et à Node : kit `ext`, `box`, `cyl`, `rev`, `join`, `tray`… sur **manifold-3d** (unions booléennes, maillage étanche). Seul moteur du site depuis la phase 4 (l'ancien kit three.js est retiré). |
| `assets/vendor/manifold-3d/` | manifold-3d **3.5.4** (`manifold.js` + `manifold.wasm`, licence Apache-2.0), copié depuis `tools/node_modules` ; chargé à la demande par le viewer. Changer de version : `tools/package.json`, recopier les 2 fichiers, `MANIFOLD_VERSION` dans `geo.js`. |
| `assets/js/modeles/` | **Un fichier par pièce 3D** : le « plan » qui transforme des cotes en mm en pièce 3D. Seul le fichier de la fiche ouverte est chargé. |
| `assets/js/cart.js` | Le panier latéral : ajout, quantités, code promo de démo `BIENVENUE10` (codes Stripe en mode test), total, envoi au paiement ; mémorisé dans le navigateur. |
| `assets/js/ui.js` | Le confort : thème clair/sombre, recherche (touche `/`), favoris, notifications, fenêtres modales. |
| `assets/models/<produit>/` | Fichiers STL d'origine des produits qui partent d'un modèle existant. |
| `assets/photos/<produit>/` | Photos commerciales (`1.webp` = vignette du catalogue). |
| `tools/` | Outils d'atelier : analyse des STL (`analyse-stl.py`, `bgcode-decode.py`), `generer-pages.mjs` (pages produit, univers, catalogue, légales, 404, sitemap ; textes légaux dans `pages-legales/`), `captures-og.cjs` (images de partage et vignettes 3D), `icones-admin.mjs` (icônes de /admin). Fabrication et contrôles (voir « Générer un STL ») : `generer-stl.mjs`, `verifier-geometrie.mjs`, `references-geometrie.json` (référence figée), `lib/` (moteur Node, contrôles, fiche d'impression), `test/` (tests Node). Dépendances Node épinglées dans `tools/package.json` (three 0.170.0, manifold-3d 3.5.4 : `cd tools && npm ci`) ; la publication du site n'en a pas besoin. |
| `.github/workflows/pages.yml` | Publication automatique sur GitHub Pages (le dossier `worker/` n'est pas publié). |
| `.github/workflows/geometrie.yml` | **Contrôles de géométrie** (job `geometrie`, contrôle obligatoire sur `main`) : lancé sur **chaque PR** (vert en quelques secondes si rien ne touche `assets/js/` (dont `data.js`), `assets/models/`, `tools/` ou ce workflow) et sur chaque push sur `main` qui touche ces dossiers : `cd tools && npm ci && node --test`. Ne pas remettre de filtre `paths` sur `pull_request` : une PR sans résultat resterait bloquée. |
| `worker/` | **Le service de paiement** (Cloudflare Worker + Stripe Checkout, **mode test**) : reçoit le panier, recalcule les prix depuis `data.js`, crée la session Stripe, reçoit le webhook. Voir « Paiement » ci-dessous. |
| `commande/merci/` | Page de retour après paiement (récapitulatif de la commande). |
| `.github/workflows/worker.yml` | Teste puis déploie le Worker à chaque changement de `worker/` ou de `data.js`. |
| `.github/workflows/fabrication.yml` | **Génération des fichiers d'une commande** (lancée par le Worker au paiement, ou à la main avec la case « Essai ») : STL, fichier tranché, 3MF, fiche fabricant → R2. |
| `.github/workflows/stl-standards.yml` | À chaque push sur `main` touchant le catalogue ou les modèles : regénère les STL des 3 tailles standard dans R2 (`<produit>/<taille>.stl`, `.zip` si plusieurs pièces). |
| `.github/workflows/image-fabrication.yml` + `fabrication/` | Image Docker de tranchage (Bambu Studio en ligne de commande, profils P2S) publiée sur GHCR ; son empreinte est épinglée dans `fabrication.yml`. |
| `CLAUDE.md` | Méthode pour ajouter un produit 3D à partir de fichiers STL. |

## Paiement et commandes (mode test)
Ventes **non ouvertes** : sans drapeau, « Commander » affiche « Les commandes ouvrent bientôt ». Tester :
`https://www.evarysth.fr/?checkout=test` (désactiver : `?checkout=off`). Cartes : `4242 4242 4242 4242` (OK),
`4000 0025 0000 3155` (3D Secure), `4000 0000 0000 9995` (refusée). Détails et historique : `docs/traitement-commandes.md`.

**Circuit d'une commande**
1. Panier → Worker `evarysth-checkout` (`worker/`) → page Stripe → `commande/merci/`. Le navigateur n'envoie que produit,
   taille ou cotes, coloris, quantité, cadeau ; **le Worker recalcule les prix depuis `data.js`** et vérifie les cotes.
2. Webhook Stripe payé → Sheet back-office : une ligne `Commandes EV` (n° client `EV-AAAA-NNNN`) et une ligne par article
   dans `Commandes CF` ; e-mail client « Commande reçue » et fiche « Nouvelle commande » au propriétaire (Brevo).
   Article en `a_valider` (STL standard présent dans R2) ou `lien_stl_a_indiquer`. **Rien ne part sans validation.**
   **En parallèle, génération automatique des fichiers** (`docs/chaine-fabrication.md`) : pour chaque article, le Worker
   lance `.github/workflows/fabrication.yml` (n° d'article `CF-AAAA-NNNN-<n°>`, sans donnée client). En ~1 min, GitHub
   produit les STL aux cotes commandées, le fichier tranché pour la P2S (PLA/PETG), un 3MF non tranché et une fiche
   fabricant, les range dans R2 (`commandes/<n°>/<SHA>/`), puis rappelle le Worker (signature HMAC) qui remplit les
   colonnes `Génération` (`en_cours` → `prete` ou `echec`), `Masse g`, `Temps min`, `Plateaux` du Sheet. Échec de
   lancement : nouvel essai par la tâche planifiée. Rien n'est imprimé ni envoyé automatiquement : les fichiers sont
   proposés dans /admin (ligne « Fichiers » sous chaque article de la fiche, Fabrication · phase 3) et partent avec l'e-mail
   fabricant une fois l'article validé. Fichiers prêts → l'article passe de « Lien STL à indiquer » à « À valider ».
   Chaîne de fabrication (`worker/src/fabrication.js`, éteinte tant que `GH_ACTIONS_TOKEN` et `FABRICATION_HMAC` manquent :
   une ligne de Journal le note) : un run `.github/workflows/fabrication.yml` par article (n° `CF-AAAA-NNNN-<n° d'article>`,
   SHA du site au paiement lu dans `version.json`) → STL, 3MF, `.gcode.3mf` (PLA/PETG) et fiche dans R2, rappel signé
   `POST /fabrication/retour` → colonnes `Génération`, `SHA`, `Masse g`, `Temps min`, `Plateaux`, `Motif génération`
   (facultatives). Réglages : `docs/guide-reglages-fabrication.md` ; architecture : `docs/chaine-fabrication.md`.
3. Le propriétaire gère les commandes sur la page d'administration `https://evarysth-admin.virnichka.workers.dev/admin`
   (téléphone, derrière Cloudflare Access). Onglet Commandes = liste des commandes client (n° EV) avec recherche (n° EV,
   n° CF ou nom) et filtres `?f=` : À traiter (défaut : à valider ou bloquées), Chez le fabricant, Expédiées, Bloquées,
   Toutes. Une commande s'ouvre en fiche (`?q=<n°>`) : en-tête (client, ville, statut, lien du paiement Stripe), articles
   à valider (fabricant + fichiers prêts ou lien STL saisi → « Valider et envoyer » → `envoyee_fabricant`, n° fournisseur
   `CF-AAAA-NNNN-X`, seul n° vu par le fabricant, lettre = fabricant, e-mail fabricant immédiat avec 3 liens signés
   14 jours : STL (zip s'il y en a plusieurs), 3MF non tranché, fiche d'impression), une ligne « Fichiers » sous
   chaque article, à valider ou envoyé (état, liens dont le fichier tranché P2S, masse · temps · plateaux ; en échec : motif
   et « Relancer la génération » au même SHA) ; repliés dans « Autres options » : lien STL manuel (affiché d'office s'il
   n'y a pas de fichiers prêts), dossier, SHA, matière, « Régénérer au SHA actuel » avec case de confirmation et ligne
   d'Historique, tant que l'article n'est pas envoyé ; envoi fabricant : renvoi d'e-mail, réponse par un autre canal,
   référence externe et retrait repliés dans « Actions » ; liste : badge « À valider » prioritaire ; « Valider et envoyer » refusé tant que les fichiers ne sont pas prêts, sauf lien STL
   saisi à la main), articles bloqués
   (« Débloquer »), un pli par envoi fabricant (articles, STL, suivi, « Renvoyer l'e-mail » au fabricant ou d'expédition
   au client, sans changer le statut ; « Retirer au fabricant » tant que rien n'est expédié : fabricant prévenu par e-mail,
   articles de nouveau à valider sans fabricant, n° CF jamais réattribué), Historique replié, et un pli « Bloquer, annuler ou rembourser » (« Bloquer » →
   `incident` ; articles à cocher un par un, puis « Annuler » (pas encore expédiés) ou « Marquer remboursés » après
   remboursement fait dans Stripe, case « Je confirme » obligatoire, aucun e-mail ; un geste commercial sans retour se fait
   seulement dans Stripe). Badge « En attente fabricant » (affichage seul, le Sheet garde `en_fabrication`) tant qu'aucun
   envoi n'est accepté ; envoi non accepté signalé en jaune, en orange après 48 h sans réponse. Autres onglets : Tableau de bord (compteurs, alertes), Catalogue
   (STL présents dans R2), Fabricants (en cours / en retard), Système (voyants dont R2 lu pour de vrai, expiration du
   jeton GitHub avec alerte à J-30, dernier run de fabrication ; chaque voyant a un « ? » qui explique à quoi il sert ;
   « Lancer la tâche maintenant »), Liens. Tableau de bord :
   alerte par génération en échec d'un article pas encore envoyé. Icônes de /admin intégrées au Worker
   (`worker/src/icones.js`, à régénérer par `node tools/icones-admin.mjs` si `assets/icons/` change).
4. Le fabricant clique « Accepter » puis « Expédier » (transporteur + suivi) dans son e-mail (liens signés, 14 jours) ;
   **s'il ne livre pas le client** (`Livre le client` = non), « Expédier » signifie « pièce envoyée à l'atelier » : l'article
   passe à `a_reexpedier`, le client n'est pas prévenu, et il l'est quand le propriétaire déclare la réexpédition dans /admin ;
   ou « Je ne peux pas la fabriquer » (motif facultatif, possible tant que rien n'est expédié) : articles de nouveau à
   valider dans /admin (« fabricant à changer »), note datée dans `Notes`, e-mail au propriétaire, anciens liens sans effet.
   Hors e-mail : fabricant `manuel` ou `atelier` (colonne `Envoi` de `Fabricants`) validé
   directement « acceptée », fiche à transmettre sur le pli, champ « Référence externe » (colonne facultative de
   `Commandes CF`) ; `atelier` (l'imprimante d'Evarysth) : comme `manuel`, mais proposé et accepté seulement pour un
   article en PLA ou PETG (matières tranchées pour la P2S), fichier tranché sur la fiche ; pour tout fabricant, « Marquer acceptée » / « Déclarer l'expédition » depuis /admin (e-mail client).
5. Tâche planifiée (toutes les 10 min) : e-mail d'expédition au client (un par colis), relance au propriétaire si pas
   d'acceptation sous 48 h, renvoi des e-mails en échec, Journal. Statut client (`Commandes EV`) = formule du Sheet.

**Montants, entretien et pilotage** (9 nov. 2026, tout est facultatif côté Sheet : colonnes absentes → ignorées)
- `Commandes EV` : `Environnement`, `Total TTC (€)`, `dont livraison (€)`, `Remise (€)` écrits à la commande, `Frais Stripe (€)`
  lus chez Stripe (`finances.js`, repris par l'entretien s'ils manquent) ; `Commandes CF` : `Coût fabricant (€)` et
  `Frais d'envoi (€)` saisis dans /admin (pli « Coûts » d'un n° CF, un montant par CF) ; sommes et `Marge TTC (€)` = formules
  du Sheet ; la fiche /admin a un pli « Montants » (marge, ou ce qui manque pour la calculer).
- Tâche planifiée → `entretien()` (`systeme.js`) : un appel de maintien par jour de la clé Brevo (elle expire après 90 jours
  sans appel), **sauvegarde hebdomadaire du Sheet** dans R2 (`sauvegardes/evarysth-AAAA-MM-JJ.zip` : un CSV par onglet, formules
  d'en-têtes, manifeste ; 12 semaines gardées ; téléchargeable et « Sauvegarder maintenant » dans /admin → Système), frais Stripe manquants. États dans
  R2 (`systeme/*.json`) ; sans R2, tout est inactif.
- **Pause des ventes** : /admin → Système → « Mettre les ventes en pause » (R2 `systeme/pause.json`) ; `POST /checkout`
  répond 503 avec le message (affiché tel quel dans le panier), le webhook n'est pas concerné.
- **Tableau de bord** (aucun e-mail en plus) : à valider, à réexpédier, chez le fabricant, hors délai (délai du fabricant,
  y compris atelier / envoi manuel), expédiées ce mois, bloquées ; alertes : échéance légale de livraison (CGV, 30 jours :
  alerte dès le 21e jour), hors délai, à réexpédier, relances 48 h, fichiers en échec, sans fabricant depuis 24 h, coûts
  fabricant à saisir, ventes en pause, clé Brevo refusée, sauvegarde en échec ou en retard.
- **Passage en production** : partir d'une copie du Sheet vidée de ses lignes de test (garder en-têtes et formules de la
  ligne 1), nouveau `SHEET_ID` dans Cloudflare ; la colonne `Environnement` distingue test et live pendant la transition.

**Fichiers** (`worker/src/`) : `index.js` (routes), `commande.js` (panier → Stripe), `sheet.js` / `google.js` (Sheet,
lecture/écriture par nom de colonne, jamais par position ; en-têtes affichés → noms du code : `NOMS_AFFICHES`), `planifie.js` (tâche), `admin.js` + `acces.js` (page
d'administration, jeton Access revérifié), `fournisseur.js` + `jeton.js` (liens fabricant), `fichier.js` (STL R2),
`email.js` (contenus Brevo), `systeme.js` (entretien, sauvegarde, pause), `finances.js` (frais Stripe, marge), `fabrication.js` (déclenchement de la génération, rappel HMAC, liens des fichiers générés,
relance depuis /admin, état GitHub), `zip.js` (archive des STL d'un article, faite à la demande). Tests : `cd worker && node --test`.

**Deux Workers** (`worker/wrangler.toml`) : `evarysth-checkout` (tout le code et les secrets ; sert `/admin` seulement
pour l'adresse `ADMIN_HOST`) et `evarysth-admin` (`[env.admin]`, simple relais sans secret, protégé par Access :
équipe `ACCESS_TEAM_DOMAIN`, application `ACCESS_AUD`, autorisé `ADMIN_EMAILS`). Déployés par
`.github/workflows/worker.yml` à chaque push sur `main` touchant `worker/` ou `data.js`.

**Secrets** (Cloudflare, Worker `evarysth-checkout`, jamais dans le dépôt public) : `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY`, `ORDER_EMAIL`, `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY`, `SHEET_ID`, `HMAC_SECRET` ;
facultatifs (chaîne de fabrication) : `GH_ACTIONS_TOKEN`, `FABRICATION_HMAC`. Secrets d'Actions (GitHub) :
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `FABRICATION_HMAC`, variable `R2_ACCOUNT_ID`.
En mode test, une clé Stripe live est refusée.

**Points d'attention**
- Ne jamais supprimer une ligne de commande dans le Sheet : statut `annulee` / `remboursee`. Ne pas écrire dans les colonnes
  grises (formules, « Dernier statut notifié »).
- R2 (STL standards) : binding `STL` actif dans `wrangler.toml` (bucket `evarysth-stl`) ; clés `<produit>/<taille>.stl|.zip`,
  remplies par `.github/workflows/stl-standards.yml` à chaque push sur `main` touchant le catalogue ou les modèles.
- Brevo : domaine `evarysth.fr` authentifié (DNS OVH), expéditeur `commandes@evarysth.fr`, réponses vers le client ou
  `contact@evarysth.fr`. La clé API expire après 90 jours sans appel.
- Paiement différé (SEPA) : cocher aussi `checkout.session.async_payment_succeeded` sur le webhook Stripe.
- Sécurité : signature Stripe vérifiée, jetons HMAC en temps constant, textes échappés, Sheet écrit en `RAW`, actions
  GitHub épinglées par SHA. Reste hors code : limite d'appels WAF sur `/checkout` et `/promo`.
- Reporté : livre des recettes et remboursements Stripe synchronisés (`charge.refunded`).

**Passage en production** : pages légales sans `[À COMPLÉTER]` ; compte Stripe activé, URL CGV et confidentialité dans
Stripe (Informations publiques), reçus clients cochés ; clé `sk_live_` + webhook live → secrets ; codes promo recréés en
live ; `CHECKOUT_MODE = "live"` dans `wrangler.toml` et retrait de `?checkout=test` dans `cart.js` ;
commande réelle à petit prix puis remboursement.

## Générer un STL (fabrication)

`cd tools && npm ci` une fois, puis depuis la racine :
`node tools/generer-stl.mjs <produit> [a=… b=… c=…] [--taille=<libellé ou 1-3>] [--impression]`. Le calcul est **celui de
l'aperçu** : mêmes fichiers `assets/js/modeles/*.js`, même `geo.js`, même manifold-3d, même jeu de matière. Sortie dans
`sortie-stl/` (ignoré par git) + manifeste JSON (produit, cotes, matière, jeu, SHA git, versions, étanche, volume, boîte,
solides obtenus et attendus, contrôles) :
- sans `--impression` : un STL des pièces assemblées comme sur le site, Z vers le haut ;
- `--impression` : les **pièces séparées**, orientées selon la fiche d'impression, posées à z = 0 et rangées sur le plateau
  de la Bambu Lab (256 × 256 × 256 mm, 5 mm entre pièces, bande avant de 10 mm laissée libre pour la ligne de chargement
  de la P2S), un STL par pièce dans les coordonnées du plateau (`<produit>-<cotes>-plateau<n>-<pièce>.stl`), positions
  dans le manifeste ; `--quantite=n` (exemplaires répartis sur plusieurs plateaux, fichiers `-ex<k>`), `--coloris=<id>`,
  `--cf=<n°>`, `--3mf` (3MF non tranché par plateau, pour un fabricant externe).

**Chaîne de fabrication** (`docs/chaine-fabrication.md`) : `node tools/fabriquer.mjs --cf=… --produit=… --cotes='{"a":60}'
[--coloris=…] [--quantite=n] [--docker=<image>]` enchaîne `generer-stl` → `tools/trancher.mjs` (Bambu Studio dans l'image
`fabrication/Dockerfile`, profils P2S PLA/PETG, couleur du coloris) → `tools/fiche-impression.mjs` (fiche.html pour le
fabricant, sans donnée client) et range le tout dans `sortie-fabrication/` (manifeste.json, STL, plateau-<n>.3mf,
plateau-<n>.gcode.3mf). C'est ce que lance `.github/workflows/fabrication.yml` (essai à la main : onglet Actions →
« Fabrication » → Run workflow, case « Essai »). Image publiée sur GHCR par `image-fabrication.yml`.

**Erreur** si une cote sort des bornes de `data.js` ou si un contrôle échoue (ci-dessous) ; `--forcer` écrit quand même,
pour diagnostic.

**Jeu par matière.** Chaque matière de `data.js` a un `jeu` en mm (PLA 0,2 ; PETG 0,3 ; ASA 0,3 ; PA-CF 0,25 ; PA12 0,3),
passé au modèle avec les cotes (`EVARYSTH.jeu(p)`, dans l'aperçu comme en fabrication). Le modèle l'applique à chaque
ajustement fonctionnel : pièce qui entre dans un trou du client → cote − jeu ; pièce qui entoure un objet du client →
cote + jeu. La cote saisie par le client et le prix ne changent pas.

**Contrôles** (`node tools/verifier-geometrie.mjs [produit…] [--detail]`, et les tests `cd tools && node --test`, < 1 min),
à toutes les combinaisons min/défaut/max des cotes de chaque produit :
- maillage étanche, nombre de solides déclaré par le modèle (`define(id, factory, { solides })`) ;
- **cotes fonctionnelles** déclarées par le modèle (`cotes: v => [{ nom, axe, en, mesure, selon?, attendu }]`), mesurées
  par coupe (`Manifold.slice`) à ± 0,05 mm : diamètre libre d'un trou, diamètre d'un fût, largeur d'une ouverture,
  étendue hors tout (syntaxe en tête de `tools/lib/controles.mjs`) ;
- **paroi minimale** (1,2 mm par défaut, `paroi: { min, seuil, coupes }` dans le modèle) : chaque coupe est « ouverte »
  par `offset(−e/2)` puis `offset(+e/2)` ; ce qui disparaît est plus fin que e ;
- **fiche d'impression** (`impression` du produit dans `data.js` : orientation = rotation propre du repère du modèle vers
  le plateau, supports, `parPlateau` ou `plateaux`, matière, remarques) : pièces dans le volume, surface d'appui non nulle,
  autant de pièces que de solides déclarés, exemplaires par plateau tenus aux cotes par défaut ;
- **référence figée** `tools/references-geometrie.json` (boîte, volume, solides par combinaison) : tout écart échoue.
  Après un changement de forme voulu : `node tools/verifier-geometrie.mjs [produit…] --mettre-a-jour` (affiche les écarts),
  à committer avec le modèle.

## Sécurité du site (CSP)

GitHub Pages ne permet pas d'en-têtes HTTP : la Content-Security-Policy est posée en
`<meta http-equiv="Content-Security-Policy">` dans `index.html` (reprise par toutes les pages
générées), `produit.html` et `commande/merci/index.html`. Elle n'autorise que :

| Directive | Sources | Pourquoi |
|---|---|---|
| `script-src` | `'self'` `'unsafe-inline'` `'wasm-unsafe-eval'` `cdn.jsdelivr.net` `cloud.umami.is` | scripts du site + scripts inline (thème, Umami, importmap), compilation du WASM manifold-3d (servi par le site, moteur géométrique du viewer), Three.js, statistiques |
| `style-src` | `'self'` `'unsafe-inline'` `fonts.googleapis.com` | feuille du site, attributs `style`, Google Fonts |
| `font-src` | `'self'` `fonts.gstatic.com` | fichiers de polices |
| `img-src` | `'self'` `data:` `blob:` | photos, textures 3D |
| `connect-src` | `'self'` `evarysth-checkout.virnichka.workers.dev` `cloud.umami.is` `gateway.umami.is` | STL locaux, Worker de paiement, envoi des stats (`gateway.umami.is/api/send`) |
| `worker-src` | `'self'` `blob:` | — |
| `object-src` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` | durcissement (`base-uri 'self'` laisse passer le `<base href>`) |

`frame-ancestors` n'est pas pris en compte en meta. **Ajout d'un service externe** (CDN,
police, stats, API…) : ajouter son hôte à la bonne directive dans les 3 fichiers ci-dessus,
puis `node tools/generer-pages.mjs`, et vérifier dans la console qu'aucune violation CSP
n'apparaît. Les données venant du `localStorage` ou du Worker sont toujours échappées
(`esc()`) avant un `innerHTML`.

## 3. Où sont rangées les données ?
Il n'y a **pas de base de données** : tout le contenu est écrit directement dans les fichiers du site.

| Quoi | Où |
|---|---|
| Produits (nom, description, prix, tailles, curseurs sur-mesure), univers et leurs textes | `assets/js/data.js` |
| Tarifs du prix sur-mesure (€/kg par matière, €/h machine, forfait, emballage, taux d’échec, coefficient, supplément sur-mesure) ; prix de chaque taille standard | `assets/js/data.js` (`EVARYSTH.tarif`, matières) ; masse et temps : `assets/js/bareme.js` (généré, voir `docs/chaine-fabrication.md`) |
| Textes fixes de la page : accueil, étapes, FAQ, pied de page | `index.html` |
| Textes de la fiche produit (boutons, libellés, livraison…) | `assets/js/app.js` |
| Photos | `assets/photos/<produit>/` |
| Formes 3D | `assets/js/modeles/` (un plan par pièce) et `assets/models/` (fichiers STL) |
| Panier, favoris, code promo, thème choisi par le visiteur | Dans **le navigateur du visiteur** (`localStorage`) : rien n'est envoyé ni conservé sur un serveur, et chaque visiteur ne voit que les siens. |

Pour changer un texte ou un prix : modifier le bon fichier ci-dessus, puis publier sur `main`.

## 4. Comment ça fonctionne

1. **Chargement** — `index.html` charge dans l'ordre : `data.js` (le catalogue) → `ui.js` → `viewer3d.js` → `app.js` → `cart.js`.
2. **Navigation** — chaque produit, univers et le catalogue ont leur vraie page (`produits/<id>/`, `univers/<id>/`, `catalogue/`),
   générée par `tools/generer-pages.mjs` ; le `<body>` indique à `app.js` quoi dessiner (`data-product-id`, `data-universe-id`,
   `data-page`). Sur l'accueil, seule l'ancre `#favoris` change la vue (fonction `route`) ; les anciens liens `#catalogue`,
   `#f-<univers>`, `#p-<produit>` redirigent vers les nouvelles pages.
3. **Fiche produit** — sur `produits/<id>/`, `app.js` lit le produit dans `data.js`, crée les boutons de taille et un curseur par cote sur-mesure, puis, si le produit a un champ `model`, demande à `viewer3d.js` d'afficher la pièce 3D dans `#viewer3d` (le moteur va alors chercher le plan de cette seule pièce).
4. **Bouger un curseur** →
   la nouvelle valeur est enregistrée → `update()` recalcule le prix (`EVARYSTH.priceFor`), les cotes affichées et le résumé → le viewer 3D reçoit les nouvelles cotes et **redessine la pièce** à partir de son plan (`assets/js/modeles/<pièce>.js`).
5. **Ajouter au panier** — le bouton `#add` transmet le produit et ses cotes à `cart.js`, qui met à jour le panier et le garde en mémoire (`localStorage`).
6. **Sans 3D possible** (vieux navigateur, pas de réseau) — l'illustration dessinée reste affichée à la place.

## 5. Repères dans le code (IDs HTML)

**Vues** : dans `index.html`, `#home-view` (accueil, avec `#families-root` = carrousel des univers et `#popular-root` = hacks les plus demandés), `#family-view` (favoris), `#toasts` (notifications) ; dans les pages générées, `#catalogue-view` / `#catalogue-root` (catalogue), `#family-view` (univers), `#product-root` (fiche produit).

**Fiche produit** (créée par `app.js`) :
- `#stage` : zone visuelle ; `#viewer3d` : rendu 3D ; `#photos` / `#views` : photos et vignettes ; `#open3d` : curseur d'ouverture (pièces articulées)
- `#pane-standard` / `#pane-custom` : panneaux « Standard » et « Sur-mesure » (curseurs)
- `#dims` : cotes affichées ; `#summary` : résumé de la commande
- `#price`, `#price-note`, `#qty`, `#add`, `#add-price` : prix, quantité, bouton d'ajout
- `#color-name`, `#stage-mat` : couleur et matière choisies

**Panier** (créé par `cart.js`) : `#cart`, `#cart-list`, `#cart-total`, `#promo-input`, `#cart-checkout`.

**Recherche / modales** (créées par `ui.js`) : `#q` (champ de recherche), `#q-list` (résultats), `#modal`.

**Dans le JavaScript** : tout est rangé sous l'objet global `EVARYSTH` — `EVARYSTH.products` (catalogue), `EVARYSTH.viewer3d` (3D), `EVARYSTH.priceFor` (prix : fixé pour les tailles standard, calculé depuis le barème tranché pour le sur-mesure).
