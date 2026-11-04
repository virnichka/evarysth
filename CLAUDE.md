# Modulr Studio — consignes pour Claude

Site vanilla HTML/CSS/JS sans build (voir README.md). Catalogue : `assets/js/data.js`.
Viewer 3D : `assets/js/viewer3d.js`. Icônes line-art : objet `SHAPES` dans `assets/js/app.js`.

## Économie de tokens (toujours)
- Ne lis jamais un fichier en entier : `grep -n` puis `sed -n a,bp` sur le passage utile.
- Pas d'exploration générale du dépôt : ce fichier décrit ce qu'il faut savoir.
- Images = très coûteuses. Analyse les STL en chiffres, pas en rendus.
- Si une info manque, choisis une valeur raisonnable et signale-la à la fin, sans t'arrêter pour demander.

## Ajouter un produit 3D à partir de fichiers STL
Patron à suivre : le produit `boite-rugged` (bloc `const rugged = (() => {...})()` dans
`viewer3d.js` + son entrée dans `MODELS`, entrée `"boite-rugged"` dans `data.js`).

1. **Analyse** : `python3 -I tools/analyse-stl.py <fichiers.stl>` (dimensions, zones libres
   par axe, trous et axes de charnière). Ne réécris pas ce script : améliore-le si besoin.
2. **Assemblage** (si plusieurs pièces) : aligne les axes de trous donnés par le script ;
   rotations propres uniquement (déterminant +1, sinon les faces s'inversent).
   Repère d'assemblage : Z vers le haut, centré en X/Y.
3. **Paramètres** : redimensionnement « par zones » : on étire seulement une bande
   sans détail (au-delà on translate). Les détails fonctionnels (charnières, clips,
   trous, épaisseurs de paroi) gardent leurs vraies cotes.
   Min d'un paramètre ≈ nominal − largeur de la bande + 2 mm. Cotes exprimées comme
   l'utilisateur les mesure (souvent les cotes intérieures ou l'objet à accueillir).
4. **Liberté de design** : le STL fourni est une base, pas une contrainte. Tu peux :
   simplifier ou retirer des détails inutiles, ajouter des congés/chanfreins, renforcer,
   ajuster les proportions, réorganiser les pièces, ou même reconstruire l'objet en
   géométrie paramétrique (comme les autres `MODELS`) si c'est plus propre, pour
   coller au style Modulr (pièce noire mate, lignes nettes, montage sans outil).
   Garde la fonction de l'objet intacte. Liste les libertés prises dans la réponse finale.
5. **Intégration** : STL dans `assets/models/<id-produit>/`, modèle dans `MODELS`,
   produit dans `data.js` (même format, 3 tailles standard + `custom.params`),
   icône dans `SHAPES` si aucune existante ne convient. Textes en français, ton du site.
6. **Vérification** : serveur local (`python3 -m http.server`) + Playwright
   (Chromium déjà installé, lancer avec `--use-gl=angle --use-angle=swiftshader`).
   Au plus 2 captures par produit, en deviceScaleFactor 1 : valeurs par défaut et
   valeurs max. Console sans erreur. Une capture de plus seulement si l'assemblage paraît faux.
7. **Fin** : commit + push sur la branche de travail. Réponse courte : tableau des
   paramètres (min/défaut/max), libertés de design prises, points à vérifier (prix, licence).
