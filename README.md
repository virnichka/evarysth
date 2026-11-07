# Evarysth

> Le site est désormais en ligne sur **[www.evarysth.fr](https://www.evarysth.fr)**.

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
| `assets/js/data.js` | **Le catalogue.** Univers, produits, prix, 3 tailles standard, curseurs sur-mesure (min/max), photos. C'est le fichier à modifier pour ajouter ou changer un produit. |
| `assets/js/app.js` | **Le chef d'orchestre.** Lit le type de page (`data-product-id`, `data-universe-id`, `data-page="catalogue"` sur le `<body>`, ou `#…` sur l'accueil), affiche la bonne vue, construit les cartes et la fiche produit, relie curseurs ↔ prix ↔ 3D. Contient aussi les icônes dessinées (`SHAPES`). |
| `assets/js/viewer3d.js` | **Le moteur 3D.** Charge Three.js seulement quand une fiche en a besoin, affiche et fait tourner la pièce. |
| `assets/js/modeles/` | **Un fichier par pièce 3D** : le « plan » qui transforme des cotes en mm en pièce 3D. Seul le fichier de la fiche ouverte est chargé. |
| `assets/js/cart.js` | Le panier latéral : ajout, quantités, code promo de démo `BIENVENUE10` (codes Stripe en mode test), total, envoi au paiement ; mémorisé dans le navigateur. |
| `assets/js/ui.js` | Le confort : thème clair/sombre, recherche (touche `/`), favoris, notifications, fenêtres modales. |
| `assets/models/<produit>/` | Fichiers STL d'origine des produits qui partent d'un modèle existant. |
| `assets/photos/<produit>/` | Photos commerciales (`1.webp` = vignette du catalogue). |
| `tools/` | Outils d'atelier : analyse des STL (Python), `generer-pages.mjs` (pages produit, sitemap), `captures-og.cjs` (images de partage). |
| `.github/workflows/pages.yml` | Publication automatique sur GitHub Pages (le dossier `worker/` n'est pas publié). |
| `worker/` | **Le service de paiement** (Cloudflare Worker + Stripe Checkout, **mode test**) : reçoit le panier, recalcule les prix depuis `data.js`, crée la session Stripe, reçoit le webhook. Voir « Paiement » ci-dessous. |
| `commande/merci/` | Page de retour après paiement (récapitulatif de la commande). |
| `.github/workflows/worker.yml` | Teste puis déploie le Worker à chaque changement de `worker/` ou de `data.js`. |
| `CLAUDE.md` | Méthode pour ajouter un produit 3D à partir de fichiers STL. |

## Paiement (Stripe Checkout, mode test)
Ventes **non ouvertes** : sans drapeau, « Commander » affiche « Les commandes ouvrent bientôt » (panier conservé).
- Activer sur son navigateur : ouvrir `https://www.evarysth.fr/?checkout=test` (désactiver : `?checkout=off`).
- Parcours : panier → `worker/` (`https://evarysth-checkout.virnichka.workers.dev`) → page Stripe → `commande/merci/`.
  Le navigateur n'envoie que produit, taille ou cotes, coloris et quantité ; **les prix sont recalculés par le Worker**
  depuis `data.js`, les cotes vérifiées (min/max/pas). Codes promo : ceux créés dans Stripe.
- Chaque ligne Stripe porte en métadonnées `produit`, `mode`, `cotes_mm` (JSON), `coloris`, `catalogue` (empreinte de `data.js`).
- **Emballage cadeau** (3 € par commande, case `#gift-on` du panier, mémorisée dans `evarysth.cadeau`) : le navigateur n'envoie que
  `cadeau: true` et `message` (200 caractères max, refusé au-delà). Le Worker ajoute lui-même la ligne Stripe « Emballage cadeau »
  au prix de `CADEAU_CENTS` (`worker/src/commande.js`, même valeur que `GIFT` dans `cart.js`). Métadonnées de session :
  `cadeau` (`oui`/`non`) et `message_cadeau` ; repris dans la fiche de fabrication et sur `commande/merci/`.
  Comme chez Stripe, un code promo porte sur les articles et l'emballage, jamais sur la livraison : le total du panier est celui de Stripe.
- **CGV** : pages `cgv/`, `mentions-legales/`, `confidentialite/` générées depuis `tools/pages-legales/<id>.html`
  (repères `[À COMPLÉTER : …]` surlignés en jaune, classe `.todo`). Le Worker demande la case « J'accepte les CGV »
  (`consent_collection.terms_of_service`) ; si l'URL des CGV n'est pas renseignée dans Stripe (Paramètres → Informations publiques),
  Stripe refuse et le Worker repasse au texte seul (`custom_text.submit`). La réponse de `/checkout` indique `cgv: "case"` ou `"texte"`.
  `CGV_STRIPE = "non"` dans `wrangler.toml` coupe l'essai. Sur-mesure : rappel de l'exclusion du droit de rétractation (art. L221-28 3°)
  sur la fiche, dans le panier et sur la page Stripe.
- Cartes de test : `4242 4242 4242 4242` (accepté), `4000 0025 0000 3155` (3D Secure), `4000 0000 0000 9995` (refusé).
- Commandes payées : tableau de bord Stripe, et fiche de fabrication dans les journaux du Worker (Cloudflare → Workers → Logs).
- **Back-office Google Sheet** (`worker/src/google.js`, `worker/src/sheet.js`, plan : `docs/traitement-commandes.md`) : à chaque
  `checkout.session.completed`, le Worker ajoute la commande à l'onglet `Commandes` (sans doublon, clé : Stripe session id),
  lui attribue un n° `EV-AAAA-NNNN` (méthode « écrire puis vérifier », voir le plan, bloc B), statut `payee` (standard) ou
  `fichier_a_produire` (sur-mesure), écrit une ligne dans `Journal` et envoie au client l'e-mail Brevo « Commande EV-… reçue »
  (une seule fois). Accès par compte de service (JWT RS256 en WebCrypto, jeton en cache 1 h). Google en erreur : la fiche
  de fabrication part quand même, puis réponse 503 (Stripe réessaie). **Inactif tant que les secrets `GOOGLE_SA_EMAIL`,
  `GOOGLE_SA_KEY` et `SHEET_ID` ne sont pas tous définis** (marche à suivre : plan, « À faire par le propriétaire »).
- **Liens fournisseur** (`worker/src/jeton.js`, `worker/src/fournisseur.js`) : jeton
  `commande.action.fabricant.expiration.signature` (HMAC-SHA256, secret `HMAC_SECRET`, valable 14 jours, rien de stocké ;
  création : `creerJeton(env, { commande, action, fabricant })`, utilisée par les e-mails du bloc D). `GET /f/<jeton>` affiche
  seulement une page avec un bouton (ne modifie rien) ; `POST /f/<jeton>` revérifie le jeton et le fabricant de la ligne,
  puis applique la seule transition prévue : `accepter` (`envoyee_fabricant` → `acceptee`) ou `expedier` (`acceptee` ou
  `envoyee_fabricant` → `expediee`, transporteur choisi dans `Listes!C` + n° de suivi obligatoires, écrits dans le Sheet), puis une ligne de
  `Journal` (auteur `fabricant`). 2e clic : « déjà confirmée », sans 2e ligne. Lien falsifié 403, expiré 410, transition
  interdite 409. **Sans `HMAC_SECRET` ou sans secrets Google : `/f/` répond 503**, le reste du Worker est inchangé.
- **Tâche planifiée** (`worker/src/planifie.js`, cron `*/10 * * * *` dans `worker/wrangler.toml`, handler `scheduled`) :
  lit l'onglet `Commandes` ; pour chaque ligne où `Statut` ≠ `Dernier statut notifié`, envoie l'e-mail dû (Brevo), puis
  **seulement après un envoi réussi** écrit cette colonne (ligne retrouvée par son n°) et journalise le changement
  (auteur `proprietaire` s'il n'est pas déjà dans `Journal`). `envoyee_fabricant` → e-mail au fabricant de la ligne
  (onglet `Fabricants` : e-mail, délai ; pièce, cotes, coloris, lien STL, boutons accepter/expédier signés `creerJeton`,
  liens vers `WORKER_URL`) ; nom et adresse du client **seulement si `Livre le client` = oui**. `expediee` → e-mail client
  avec transporteur et n° de suivi. Autres statuts : colonne mise à jour, sans e-mail. Relance à `ORDER_EMAIL` si pas
  d'`acceptee` 48 h après le passage en `envoyee_fabricant` (date du `Journal`), **une seule par commande** (ligne
  `Journal` « → `relance_48h` »). Sans secrets Google : ne fait rien ; sans `BREVO_API_KEY`/`HMAC_SECRET` ou fabricant
  sans e-mail : la ligne attend (avertissement dans les journaux) ; Brevo en erreur : colonne inchangée, nouvel essai
  10 min plus tard. La fiche « Nouvelle commande » du webhook est inchangée.
  **Vérification manuelle** : `GET $W/maj?cle=<ADMIN_KEY>` lance la même tâche tout de suite et affiche un bilan
  (secret `ADMIN_KEY` ; absent → 503, clé fausse → 403).
- **STL standards** (`worker/src/fichier.js`, bucket R2 `evarysth-stl`, binding `STL` **commenté** dans `worker/wrangler.toml`
  tant que le bucket n'existe pas) : `GET /fichier/<jeton>` sert l'objet R2 en pièce jointe ; jeton
  `fichier.<clé>.<expiration>.<signature>` (HMAC_SECRET, 14 jours, même mécanique que les liens fournisseur, non
  interchangeable avec eux) ; falsifié → 403, expiré → 410, absent → 404, sans binding ou sans `HMAC_SECRET` → 503.
  Clés : `<produit>/<taille>.stl` (ou `.3mf`, `.zip`), taille en minuscules sans accents (`boite-rugged/m.stl`,
  `…/moyenne.stl`, `Ø 12` → `12`). E-mail fabricant d'une ligne au `Lien STL` vide : un lien par ligne standard dont le
  fichier existe ; sinon « fourni séparément » (R2 en panne : idem, l'e-mail part quand même).
- Secrets (dans Cloudflare, jamais dans le dépôt) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (+ `BREVO_API_KEY`, `ORDER_EMAIL`, `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY`, `SHEET_ID`, `HMAC_SECRET`) ; binding R2 `STL` facultatif. En mode test, une clé live est refusée.
- Tests : `cd worker && node --test` (dont `test/parcours.test.mjs` : recette de bout en bout webhook → tâche planifiée → liens fournisseur → expédition).
- Passage en production (checklist, dans l'ordre) :
  1. Pages légales sans `[À COMPLÉTER]` ; Stripe → activer le compte (identité, SIRET, IBAN) ; Paramètres → Informations
     publiques : URL CGV `https://www.evarysth.fr/cgv/`, confidentialité `https://www.evarysth.fr/confidentialite/`,
     e-mail support `contact@evarysth.fr` (active aussi la case CGV, `cgv: "case"`).
  2. Paramètres → E-mails clients : « Paiements réussis » et « Remboursements » cochés (reçus Stripe).
  3. En mode live : clé `sk_live_` (ou `rk_live_` restreinte) → secret `STRIPE_SECRET_KEY` ; webhook live
     `https://evarysth-checkout.virnichka.workers.dev/webhook` sur `checkout.session.completed` → secret `STRIPE_WEBHOOK_SECRET`.
  4. Recréer les coupons/codes promo en live (ex. `BRABOU78`, mêmes conditions qu'en test).
  5. `CHECKOUT_MODE = "live"` dans `worker/wrangler.toml` (déploiement auto) ; retirer le drapeau `?checkout=test` dans `cart.js`.
  6. Commande réelle à petit prix puis remboursement : e-mail reçu, webhook 200, reçu client.

### E-mails de commande (Brevo) — configuration faite le 7 novembre 2026
À chaque commande payée, le Worker doit m'envoyer par l'API Brevo un e-mail « Nouvelle commande » avec la fiche de fabrication.
Le code d'envoi est **en cours dans une autre session (pas encore dans le dépôt)** ; les comptes et le DNS sont prêts :
- **Compte Brevo** : offre gratuite (300 e-mails/jour), aucune validation en attente.
- **Domaine evarysth.fr authentifié** dans Brevo. Zone DNS OVH : ajout du TXT `brevo-code:…` (racine), des CNAME DKIM
  `brevo1._domainkey` → `b1.evarysth-fr.dkim.brevo.com.` et `brevo2._domainkey` → `b2.evarysth-fr.dkim.brevo.com.`,
  du TXT `_dmarc` `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` ; SPF unique complété :
  `v=spf1 include:mx.ovh.com include:spf.brevo.com -all`. A/AAAA (GitHub Pages), `www` et MX OVH inchangés.
- **Expéditeur** : `Evarysth <commandes@evarysth.fr>` (validé). Reply-to : l'e-mail du client, sinon `REPLY_TO`
  (`contact@evarysth.fr`, `worker/wrangler.toml`).
- **Adresses du projet** : boîte `evarysth@gmail.com` ; redirections OVH (MX Plan → Redirections) `contact@evarysth.fr`
  (clients, affichée sur les pages légales) et `commandes@evarysth.fr` (expéditeur) → `evarysth@gmail.com`.
  Aucune adresse personnelle dans le dépôt.
- **Clé API v3** `evarysth-worker`, restreinte à « E-mails transactionnels » ; enregistrée dans Cloudflare comme secret
  **`BREVO_API_KEY`** du Worker `evarysth-checkout`. Blocage des IP non autorisées **désactivé** pour les clés API
  (le Worker appelle depuis des IP Cloudflare variables).
- Test de réception d'une redirection : écrire depuis une **autre** boîte que `evarysth@gmail.com` (Gmail masque un
  message qui revient vers l'expéditeur : il n'apparaît que dans « Envoyés »). Contrôle SPF/DKIM/DMARC « PASS » :
  « Afficher l'original » de l'e-mail « [TEST] Nouvelle commande ».
- **Envoi branché** (`worker/src/email.js`) : à chaque `checkout.session.completed`, e-mail « Nouvelle commande EV-… »
  (« [TEST] » en mode test) avec la fiche de fabrication (cotes en mm avec leurs libellés, coloris, emballage cadeau et
  message, adresse, lien Stripe). Répondre à l'e-mail écrit au client (reply-to). Expéditeur : `EMAIL_FROM` dans
  `worker/wrangler.toml`. **Destinataire : secret Cloudflare `ORDER_EMAIL`** (une ou plusieurs adresses séparées par des
  virgules), jamais dans le dépôt, qui est public. Sans `ORDER_EMAIL` ou `BREVO_API_KEY`, aucun e-mail (avertissement dans
  les journaux) ; si Brevo refuse, le webhook répond 500 et Stripe renvoie l'événement plus tard.
- Attention : la clé expire après **90 jours sans aucun appel** ; tant que les ventes sont fermées, la recréer si besoin.

## Sécurité du site (CSP)

GitHub Pages ne permet pas d'en-têtes HTTP : la Content-Security-Policy est posée en
`<meta http-equiv="Content-Security-Policy">` dans `index.html` (reprise par toutes les pages
générées), `produit.html` et `commande/merci/index.html`. Elle n'autorise que :

| Directive | Sources | Pourquoi |
|---|---|---|
| `script-src` | `'self'` `'unsafe-inline'` `cdn.jsdelivr.net` `cloud.umami.is` | scripts du site + scripts inline (thème, Umami, importmap), Three.js, statistiques |
| `style-src` | `'self'` `'unsafe-inline'` `fonts.googleapis.com` | feuille du site, attributs `style`, Google Fonts |
| `font-src` | `'self'` `fonts.gstatic.com` | fichiers de polices |
| `img-src` | `'self'` `data:` `blob:` | photos, textures 3D |
| `connect-src` | `'self'` `evarysth-checkout.virnichka.workers.dev` `cloud.umami.is` | STL locaux, Worker de paiement, envoi des stats (`/api/send`) |
| `worker-src` | `'self'` `blob:` | — |
| `object-src` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` `checkout.stripe.com` | durcissement (`base-uri 'self'` laisse passer le `<base href>`) |

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
| Textes fixes de la page : accueil, étapes, FAQ, pied de page | `index.html` |
| Textes de la fiche produit (boutons, libellés, livraison…) | `assets/js/app.js` |
| Photos | `assets/photos/<produit>/` |
| Formes 3D | `assets/js/modeles/` (un plan par pièce) et `assets/models/` (fichiers STL) |
| Panier, favoris, code promo, thème choisi par le visiteur | Dans **le navigateur du visiteur** (`localStorage`) : rien n'est envoyé ni conservé sur un serveur, et chaque visiteur ne voit que les siens. |

Pour changer un texte ou un prix : modifier le bon fichier ci-dessus, puis publier sur `main`.

## 4. Comment ça fonctionne

1. **Chargement** — `index.html` charge dans l'ordre : `data.js` (le catalogue) → `ui.js` → `viewer3d.js` → `app.js` → `cart.js`.
2. **Navigation** — tout se passe sur une seule page. La fin de l'adresse décide de ce qu'on voit :
   `#catalogue`, `#f-<univers>`, `#p-<produit>`, `#favoris`. Quand elle change, `app.js` (fonction `route`) masque la vue courante et dessine la nouvelle.
3. **Fiche produit** — `app.js` lit le produit dans `data.js`, crée les boutons de taille et un curseur par cote sur-mesure, puis, si le produit a un champ `model`, demande à `viewer3d.js` d'afficher la pièce 3D dans `#viewer3d` (le moteur va alors chercher le plan de cette seule pièce).
4. **Bouger un curseur** →
   la nouvelle valeur est enregistrée → `update()` recalcule le prix (`EVARYSTH.priceFor`), les cotes affichées et le résumé → le viewer 3D reçoit les nouvelles cotes et **redessine la pièce** à partir de son plan (`assets/js/modeles/<pièce>.js`).
5. **Ajouter au panier** — le bouton `#add` transmet le produit et ses cotes à `cart.js`, qui met à jour le panier et le garde en mémoire (`localStorage`).
6. **Sans 3D possible** (vieux navigateur, pas de réseau) — l'illustration dessinée reste affichée à la place.

## 5. Repères dans le code (IDs HTML)

**Vues** (dans `index.html`) : `#home-view` (accueil), `#catalogue-view` / `#catalogue-root`, `#family-view` / `#families-root`, `#popular-root` (hacks les plus demandés), `#product-root` (fiche produit), `#toasts` (notifications).

**Fiche produit** (créée par `app.js`) :
- `#stage` : zone visuelle ; `#viewer3d` : rendu 3D ; `#photos` / `#views` : photos et vignettes ; `#open3d` : curseur d'ouverture (pièces articulées)
- `#pane-standard` / `#pane-custom` : panneaux « Standard » et « Sur-mesure » (curseurs)
- `#dims` : cotes affichées ; `#summary` : résumé de la commande
- `#price`, `#price-note`, `#qty`, `#add`, `#add-price` : prix, quantité, bouton d'ajout
- `#color-name`, `#stage-mat` : couleur et matière choisies

**Panier** (créé par `cart.js`) : `#cart`, `#cart-list`, `#cart-total`, `#promo-input`, `#cart-checkout`.

**Recherche / modales** (créées par `ui.js`) : `#q` (champ de recherche), `#q-list` (résultats), `#modal`.

**Dans le JavaScript** : tout est rangé sous l'objet global `EVARYSTH` — `EVARYSTH.products` (catalogue), `EVARYSTH.viewer3d` (3D), `EVARYSTH.priceFor` (prix).
