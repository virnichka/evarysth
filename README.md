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
| `assets/js/cart.js` | Le panier latéral : ajout, quantités, code promo de démo `BIENVENUE10`, total ; mémorisé dans le navigateur. |
| `assets/js/ui.js` | Le confort : thème clair/sombre, recherche (touche `/`), favoris, notifications, fenêtres modales. |
| `assets/models/<produit>/` | Fichiers STL d'origine des produits qui partent d'un modèle existant. |
| `assets/photos/<produit>/` | Photos commerciales (`1.webp` = vignette du catalogue). |
| `tools/` | Outils d'atelier : analyse des STL (Python), `generer-pages.mjs` (pages produit, sitemap), `captures-og.cjs` (images de partage). |
| `.github/workflows/pages.yml` | Publication automatique sur GitHub Pages. |
| `CLAUDE.md` | Méthode pour ajouter un produit 3D à partir de fichiers STL. |

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
