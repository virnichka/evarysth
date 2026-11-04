# Modulr Studio — guide pour Claude

Site e-commerce statique en HTML/CSS/JS vanilla. Aucun build, aucune dépendance, pas de tests.
Publication automatique sur GitHub Pages à chaque push sur `main`.

## Règle d'économie
Ne pas explorer tout le dépôt. Lire seulement le fichier et la section concernés
(`grep -n` sur le titre de section, puis lecture ciblée). Ne pas lire `style.css` en entier.

## Fichiers
- `index.html` : seule vraie page. Contient les vues `#home-view`, `#catalogue-view`,
  `#family-view`, `#product-root`, plus l'en-tête, la FAQ et le pied de page (textes en dur).
- `produit.html` : redirection vers `index.html#p-<id>` (ne pas modifier).
- `assets/js/data.js` : catalogue (30 produits, 10 par univers : Balcon, Bureau, Meubles)
  et fonction de calcul du prix en fin de fichier. Les produits et prix se modifient ici.
- `assets/js/ui.js` : fonctions transverses (notifications, modale, thème, favoris, partage,
  guide de mesure, recherche, newsletter de démo).
- `assets/js/app.js` : rendu des pages (`renderHome`, `renderCatalogue`, `renderFamily`,
  `renderFavorites`, `renderProduct`) et routage par hash (`route()` / `show()`).
- `assets/js/cart.js` : panier latéral, persistant dans `localStorage`.
- `assets/css/style.css` : variables de design dans `:root` en haut du fichier, puis une
  section par composant, repérable par `/* ---------- Nom ---------- */`
  (En-tête, Boutons, Héros, Carrousel, Cartes produit, Fiche produit, Panier, Modale,
  Responsive…).

## Conventions
- Scripts chargés dans l'ordre data → ui → app → cart, et partagés via `window.MODULR`.
- Routes : `#catalogue`, `#f-<famille>`, `#p-<id>`, `#favoris`.
- Design « atelier clair » : fond papier, pièces noires, une seule couleur d'accent orange
  (`--accent`), une teinte douce par univers. Polices Bricolage Grotesque, Inter, JetBrains Mono.
  Toujours utiliser les variables CSS existantes plutôt que des couleurs en dur.
- Thème sombre géré via `data-theme` sur `<html>` : toute nouvelle couleur doit avoir sa
  valeur dans les deux thèmes.
- Textes du site en français.

## Vérification
Pour un simple changement de contenu (texte, prix), aucune vérification visuelle n'est nécessaire.
Pour un changement de mise en page : ouvrir `index.html` dans le navigateur (Playwright est disponible).
