# Modulr Studio — consignes pour Claude

Site vanilla HTML/CSS/JS sans build (voir README.md). Catalogue : `assets/js/data.js`.
Viewer 3D : `assets/js/viewer3d.js`. Icônes line-art : objet `SHAPES` dans `assets/js/app.js`.

## Économie de tokens (toujours)
- Ne lis jamais un fichier en entier : `grep -n` puis `sed -n a,bp` sur le passage utile.
- Pas d'exploration générale du dépôt : ce fichier décrit ce qu'il faut savoir.
- Images = très coûteuses. Analyse les STL en chiffres, pas en rendus.
- Si une info manque, choisis une valeur raisonnable et signale-la à la fin, sans t'arrêter pour demander.

## Ajouter un produit 3D à partir de fichiers STL
Les objets peuvent être de toute forme (pièce mécanique, support, objet organique,
assemblage de plusieurs pièces…) : adapte la méthode à l'objet, ne suppose rien.
Exemple déjà en place : `boite-rugged` (bloc `const rugged = (() => {...})()` dans
`viewer3d.js` + son entrée dans `MODELS`, entrée `"boite-rugged"` dans `data.js`).
C'est un exemple de mécanique (STL chargé par `prepare()`, puis reconstruit en synchrone),
pas un gabarit de forme.

1. **Analyse** : `python3 -I tools/analyse-stl.py <fichiers.stl>` (dimensions, zones sans
   détail par axe, trous et axes cylindriques). Ne réécris pas ce script : complète-le si
   un objet en a besoin. Autre format (OBJ, 3MF…) : convertis d'abord en STL.
   G-code binaire Prusa (`.bgcode`, pas de maillage) : `tools/bgcode-decode.py`, puis lire les
   trajectoires couche par couche et reconstruire en paramétrique.
   Maillage lourd (> ~2 Mo ou > 100 000 triangles) : simplifie-le avant de l'intégrer.
2. **Comprendre l'objet** : à quoi il sert, ce qui s'ajuste à l'utilisateur (ce qu'il
   mesure chez lui), quels détails sont fonctionnels (clips, trous, charnières,
   filetages, épaisseurs). S'il y a plusieurs pièces, décide de les montrer assemblées
   ou côte à côte ; pour assembler, aligne les axes et surfaces qui se correspondent,
   rotations propres uniquement (déterminant +1, sinon les faces s'inversent).
3. **Choisir la stratégie de paramétrage** selon l'objet :
   - **étirement par zones** (comme la boîte) : on étire seulement une bande sans détail,
     au-delà on translate ; les détails gardent leurs cotes. Idéal pour les formes
     prismatiques. Min ≈ nominal − largeur de la bande + 2 mm ;
   - **mise à l'échelle** (uniforme ou par axe) : pour les formes organiques ou sans
     détail fonctionnel critique ;
   - **reconstruction paramétrique** (comme les autres `MODELS`, avec `kit`) : quand le
     STL est simple à redessiner ou que les autres méthodes déformeraient des détails ;
   - **combinaison** : ex. corps reconstruit + détail repris du STL et translaté.
   1 à 3 paramètres, exprimés comme l'utilisateur les mesure, en mm, avec des bornes
   qui gardent une pièce imprimable et solide.
4. **Liberté de design** : le STL fourni est une base, pas une contrainte. Tu peux :
   simplifier ou retirer des détails inutiles, ajouter des congés/chanfreins, renforcer,
   ajuster les proportions, réorganiser les pièces, ou reconstruire l'objet entièrement,
   pour coller au style Modulr (pièce noire mate, lignes nettes, montage sans outil).
   Garde la fonction de l'objet intacte. Liste les libertés prises dans la réponse finale.
5. **Intégration** : STL dans `assets/models/<id-produit>/`, modèle dans `MODELS`,
   produit dans `data.js` (même format : 3 tailles standard + `custom.params`, univers
   le plus logique), icône dans `SHAPES` si aucune existante ne convient. Textes en
   français, ton du site, sans promesse invérifiable (étanche, alimentaire…).
6. **Vérification** : serveur local (`python3 -m http.server`) + Playwright
   (Chromium déjà installé, lancer avec `--use-gl=angle --use-angle=swiftshader`).
   Au plus 2 captures par produit, en deviceScaleFactor 1 : valeurs par défaut et
   valeurs extrêmes. Console sans erreur. Une capture de plus seulement si la forme
   ou l'assemblage paraît faux.
7. **Fin** : commit + push sur la branche de travail. Réponse courte : par produit, la
   stratégie choisie, tableau des paramètres (min/défaut/max), libertés de design prises,
   points à vérifier (prix, licence du modèle d'origine).

## Photos commerciales
`assets/photos/<id-produit>/1.webp, 2.webp…` (≤ 1600 px de large, ~200 Ko). Dans `data.js` :
`photos: [{ src, alt, pos? }]` (pos = object-position du recadrage) + `photosNote` facultatif.
La 1re photo sert de vignette au catalogue (2e au survol) ; sur la fiche, la 3D reste la vue 1.
