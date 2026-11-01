# Modulr Studio

Prototype front-end e-commerce — hacks d'intérieur sur-mesure imprimés en Nylon PA12 noir.

- `index.html` — accueil + catalogue par univers
- `index.html#catalogue` — catalogue : une rangée défilante par famille
- `index.html#f-<famille>` — page dédiée d'une famille
- `index.html#p-<id>` — page produit : Standard / Sur-mesure (curseurs en mm), résumé dynamique
- Panier latéral persistant (`localStorage`)

HTML/CSS/JS vanilla, aucun build. Ouvrir `index.html` ou activer GitHub Pages (branche, dossier racine).
Catalogue éditable dans `assets/js/data.js`.

Publication automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/pages.yml`).

## Fonctions de confort
Actives : thème clair/sombre, recherche (touche `/`), favoris (`#favoris`), tri par prix/nom, guide de mesure, date de livraison estimée, partage, code promo de démo `BIENVENUE10`, FAQ.
Pas encore actives (affichent « pas encore disponible ») : compte client, chat atelier, échantillon de matière, emballage cadeau, avis clients, inscription newsletter, suivi de commande, réseaux sociaux.
