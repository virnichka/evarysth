# Modulr Studio

Prototype front-end e-commerce — hacks d'intérieur sur-mesure imprimés en Nylon PA12 noir.

- `index.html` — accueil : héros, carrousel des univers à balayer, hacks les plus demandés
- `index.html#catalogue` — catalogue : une rangée défilante par famille
- `index.html#f-<famille>` — page dédiée d'une famille
- `index.html#p-<id>` — page produit : Standard / Sur-mesure (curseurs en mm), résumé dynamique
- `index.html#p-equerre-l` — premier produit avec viewer 3D interactif (Three.js) : la pièce tourne au doigt et se redessine en direct quand on bouge les curseurs
- Panier latéral persistant (`localStorage`)

HTML/CSS/JS vanilla, aucun build. Ouvrir `index.html` ou activer GitHub Pages (branche, dossier racine).
Catalogue éditable dans `assets/js/data.js` : 31 hacks répartis en 3 univers (Balcon, Bureau, Meubles).

Design « atelier clair » : fond papier, pièces noires, accent orange, une teinte douce par univers. Polices Bricolage Grotesque (titres), Inter (texte), JetBrains Mono (cotes).

Publication automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/pages.yml`).

## Fonctions de confort
Actives : thème clair/sombre, recherche (touche `/`), favoris (`#favoris`), tri par prix/nom, guide de mesure, date de livraison estimée, partage, code promo de démo `BIENVENUE10`, FAQ.
Pas encore actives (affichent « pas encore disponible ») : compte client, chat atelier, échantillon de matière, emballage cadeau, avis clients, inscription newsletter, suivi de commande, réseaux sociaux.

## Viewer 3D
`assets/js/viewer3d.js` charge Three.js à la demande (importmap dans `index.html`, version fixée sur jsDelivr) uniquement sur les fiches qui ont un champ `model`. Pour rendre un autre produit en 3D : ajouter une fonction dans `MODELS` (valeurs en mm → géométrie) et `model: "<nom>"` sur le produit dans `data.js`. Sans WebGL ou sans réseau, l'illustration SVG reste affichée.
