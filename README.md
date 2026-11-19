# Evarysth

> Le site est désormais en ligne sur **[www.evarysth.fr](https://www.evarysth.fr)**.

## Documentation
| Document | Contenu |
|---|---|
| `README.md` (ce fichier) | Fonctionnement du site et des outils |
| `CLAUDE.md` | Consignes pour Claude : ajout d'un produit 3D, contrôles, mise en ligne |
| `docs/bareme.md` | Barème des prix : tranchage Bambu Studio, image Docker, profils |
| `docs/prix.md` | Règle de calcul des prix |

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
| `assets/js/data.js` | **Le catalogue.** Univers, produits, prix, 3 tailles standard, curseurs sur-mesure (min/max ; un paramètre `type: "compte"` est un nombre entier d'éléments, voir « Paramètre compte » ; `type: "choix"` une option dans une liste, voir « Paramètre choix »), photos, matières (avec leur jeu d'ajustement) et fiche d'impression de chaque produit. C'est le fichier à modifier pour ajouter ou changer un produit. |
| `assets/js/app.js` | **Le chef d'orchestre.** Lit le type de page (`data-product-id`, `data-universe-id`, `data-page="catalogue"` sur le `<body>`, ou `#…` sur l'accueil), affiche la bonne vue, construit les cartes et la fiche produit, relie curseurs ↔ prix ↔ 3D. Contient aussi les icônes dessinées (`SHAPES`). |
| `assets/js/prix.js` | **Le calcul des prix** (règle : `docs/prix.md`), chargé après `data.js` et `bareme.js` sur le site : tarifs, prix sur-mesure, prix d'une taille, frais de livraison et d'emballage cadeau, code de démonstration. Contrôle : `node tools/rapport-prix.mjs --verifier`. |
| `assets/js/viewer3d.js` | **Le moteur 3D.** Charge Three.js et le moteur géométrique seulement quand une fiche en a besoin, affiche et fait tourner la pièce. Si la 3D ne peut pas s'afficher (WebGL absent, WASM bloqué), la fiche montre la 1re photo ou la vignette 3D avec un message court. |
| `assets/js/geo.js` | **Moteur géométrique**, commun au navigateur et à Node : kit `ext`, `box`, `cyl`, `rev`, `join`, `tray`… sur **manifold-3d** (unions booléennes, maillage étanche). Seul moteur du site. |
| `assets/vendor/manifold-3d/` | manifold-3d **3.5.4** (`manifold.js` + `manifold.wasm`, licence Apache-2.0), copié depuis `tools/node_modules` ; chargé à la demande par le viewer. Changer de version : `tools/package.json`, recopier les 2 fichiers, `MANIFOLD_VERSION` dans `geo.js`. |
| `assets/js/modeles/` | **Un fichier par pièce 3D** : le « plan » qui transforme des cotes en mm en pièce 3D. Seul le fichier de la fiche ouverte est chargé. |
| `assets/js/cart.js` | Le panier latéral : ajout, quantités, code promo de démo `BIENVENUE10`, total ; « Commander » annonce l'ouverture prochaine ; mémorisé dans le navigateur. |
| `assets/js/ui.js` | Le confort : thème clair/sombre, recherche (touche `/`), favoris, notifications, fenêtres modales. |
| `assets/models/<produit>/` | Fichiers STL d'origine des produits qui partent d'un modèle existant. |
| `assets/photos/<produit>/` | Photos commerciales (`1.webp` = vignette du catalogue). |
| `tools/` | Outils d'atelier : analyse des STL (`analyse-stl.py`, `bgcode-decode.py`), `generer-pages.mjs` (pages produit, univers, catalogue, légales, 404, sitemap ; textes légaux dans `pages-legales/`), `captures-og.cjs` (images de partage et vignettes 3D). Fabrication et contrôles (voir « Générer un STL ») : `generer-stl.mjs`, `verifier-geometrie.mjs`, `references-geometrie.json` (référence figée), `lib/` (moteur Node, contrôles, rangement sur plateau, barème), `test/` (tests Node). Dépendances Node épinglées dans `tools/package.json` (three 0.170.0, manifold-3d 3.5.4 : `cd tools && npm ci`) ; la publication du site n'en a pas besoin. |
| `.github/workflows/pages.yml` | Publication automatique sur GitHub Pages. |
| `.github/workflows/geometrie.yml` | **Contrôles de géométrie** (job `geometrie`, contrôle obligatoire sur `main`) : lancé sur **chaque PR** (vert en quelques secondes si rien ne touche `assets/js/` (dont `data.js`), `assets/models/`, `tools/` ou ce workflow) et sur chaque push sur `main` qui touche ces dossiers : `cd tools && npm ci && node --test`. Ne pas remettre de filtre `paths` sur `pull_request` : une PR sans résultat resterait bloquée. |
| `.github/workflows/image-fabrication.yml` + `fabrication/` | Image Docker de tranchage (Bambu Studio en ligne de commande, profils P2S) publiée sur GHCR ; son empreinte est épinglée dans `bareme.yml`. |
| `.github/workflows/bareme.yml` | Barème des prix (`assets/js/bareme.js`) : tranche chaque produit, à lancer sur une branche (voir `docs/bareme.md`). |
| `CLAUDE.md` | Méthode pour ajouter un produit 3D à partir de fichiers STL. |

## Générer un STL

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
  `--cf=<n°>`, `--3mf` (3MF non tranché par plateau).

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
générées) et `produit.html`. Elle n'autorise que :

| Directive | Sources | Pourquoi |
|---|---|---|
| `script-src` | `'self'` `'unsafe-inline'` `'wasm-unsafe-eval'` `cdn.jsdelivr.net` `cloud.umami.is` | scripts du site + scripts inline (thème, Umami, importmap), compilation du WASM manifold-3d (servi par le site, moteur géométrique du viewer), Three.js, statistiques |
| `style-src` | `'self'` `'unsafe-inline'` `fonts.googleapis.com` | feuille du site, attributs `style`, Google Fonts |
| `font-src` | `'self'` `fonts.gstatic.com` | fichiers de polices |
| `img-src` | `'self'` `data:` `blob:` | photos, textures 3D |
| `connect-src` | `'self'` `cloud.umami.is` `gateway.umami.is` | STL locaux, envoi des stats (`gateway.umami.is/api/send`) |
| `worker-src` | `'self'` `blob:` | — |
| `object-src` / `base-uri` / `form-action` | `'none'` / `'self'` / `'self'` | durcissement (`base-uri 'self'` laisse passer le `<base href>`) |

`frame-ancestors` n'est pas pris en compte en meta. **Ajout d'un service externe** (CDN,
police, stats, API…) : ajouter son hôte à la bonne directive dans les 2 fichiers ci-dessus,
puis `node tools/generer-pages.mjs`, et vérifier dans la console qu'aucune violation CSP
n'apparaît. Les données venant du `localStorage` sont toujours échappées
(`esc()`) avant un `innerHTML`.

## 3. Où sont rangées les données ?
Il n'y a **pas de base de données** : tout le contenu est écrit directement dans les fichiers du site.

| Quoi | Où |
|---|---|
| Produits (nom, description, tailles, curseurs sur-mesure, coefficient `valeur` facultatif), univers et leurs textes | `assets/js/data.js` |
| Tarifs de tous les prix, tailles standard comprises (filament, machine, main-d’œuvre, emballage, frais fixes, lancement, prélèvements, prix minimum ; règle : `docs/prix.md`) | `assets/js/prix.js` (`EVARYSTH.tarif`) et `assets/js/data.js` (matières : €/kg, densité, taux d’échec, filière) ; masse et temps : `assets/js/bareme.js` (généré, voir `docs/bareme.md`) |
| Livraison, emballage cadeau, code promo de démonstration | `assets/js/prix.js` (`EVARYSTH.frais`, lu par le panier) |
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
   **Paramètre compte** : `{ ...param("a", "Chargeurs", 1, 2, 1), type: "compte", unite: ["chargeur", "chargeurs"] }`
   (min, max, def entiers, pas 1 ; `unite` = [singulier, pluriel]) s'affiche en boutons segmentés (radiogroup, flèches
   au clavier) au lieu du curseur, sans « mm » ; partout ailleurs (panier) la valeur
   s'écrit « 2 chargeurs » (`EVARYSTH.texteCote` de `data.js`).
   **Paramètre choix** : `choix("a", "Chargeur de montre", [["apple", "Apple Watch"], ["galaxy", "Galaxy Watch"]], "apple")`
   (fabrique de `data.js` ; défaut : 1re option) donne `{ key, label, type: "choix", options: [{ id, label }], def }`.
   - Valeur = id de l'option (chaîne : minuscules, chiffres, tirets, commence par une lettre) ; clé d'une lettre (`a`, `b`,
     `c`) comme les cotes. Les tailles standard donnent aussi une option à chaque choix (`{ a: "galaxy", b: 60 }`).
   - Fiche : boutons segmentés (radiogroup, flèches au clavier) jusqu'à 4 options aux libellés courts (≤ 12 caractères,
     28 en tout : une ligne de téléphone), sinon liste déroulante. Partout ailleurs (panier) : le libellé de
     l'option (`EVARYSTH.texteCote`) ; génération des STL : l'id.
   - Modèle 3D : reçoit l'id avec les autres valeurs (`({ a, b, jeu })`) et dessine l'option ; la caméra est cadrée à
     l'option par défaut. Contrôles (`verifier-geometrie`, tests) : aux cotes min/défaut/max avec les options par défaut,
     puis, aux cotes min et max, chaque option seule et la « diagonale » (k-ième option de chaque choix) ; pas le produit
     complet des options.
   - Prix : un point de barème par option, ajouté à la grille des cotes (`docs/prix.md`). Ajouter une option = une entrée
     dans `data.js` + sa forme dans le modèle 3D, puis le barème (workflow « Barème des prix sur-mesure ») ; aucun code
     ailleurs.
   - **Produit sans cote en mm** (seulement des comptes ou des choix, `EVARYSTH.sansCote`) : même gabarit ; les 3 tailles
     standard sont 3 configurations prédéfinies (`sizes("Configuration", [["Solo", "…", { a: …, b: … }], …])`, comme la
     station brosses à dents), le mode sur-mesure compose les options. La fiche dit « 3 configurations prêtes » /
     « À composer ».
   - **Droit de rétractation** (`EVARYSTH.horsRetractation`, CGV article 8) : un article composé uniquement de comptes et
     de choix garde les 14 jours, comme une taille standard ; seul un article sur-mesure avec au moins une cote en mm en
     est exclu (case à cocher dans le panier).
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
