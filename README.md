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
