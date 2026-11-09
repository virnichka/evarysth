# Evarysth — consignes pour Claude

Site vanilla HTML/CSS/JS sans build (voir README.md). Catalogue : `assets/js/data.js`.
Pages `produits/<id>/`, `univers/<id>/` et `catalogue/` **générées** depuis `index.html` + `data.js` : après toute
modification de l'un des deux, `node tools/generer-pages.mjs` (la publication échoue sinon). Liens
relatifs à la racine : `produits/<id>/`, `univers/<id>/`, `catalogue/` (jamais `#p-`, `#f-`, `#catalogue`) ;
ces pages ont un `<base href>` vers la racine.
Viewer 3D : moteur + briques communes dans `assets/js/viewer3d.js` ; un fichier par modèle dans
`assets/js/modeles/<modèle>.js` (chargé à la demande, `EVARYSTH.viewer3d.define`) : n'ouvre que celui utile. Icônes line-art : objet `SHAPES` dans `assets/js/app.js`.
Moteur géométrique unique : kit `assets/js/geo.js` (manifold-3d), dans le navigateur et sous Node (`tools/lib/moteur.mjs`,
dépendances : `cd tools && npm ci`) ; refonte close (historique et décisions : `docs/refonte-geometrie.md`).
**Contrôles** : `cd tools && node --test` (< 1 min, workflow « Contrôles de géométrie » sur chaque PR) ; détail par produit :
`node tools/verifier-geometrie.mjs [id…] [--detail]`. Changement de forme voulu : `--mettre-a-jour` (référence figée
`tools/references-geometrie.json`, à committer). Jeu par matière : `jeu` des matières de `data.js`, reçu par le modèle.

Paiement (mode test, ventes fermées) : Worker Cloudflare dans `worker/` (prix recalculés depuis `data.js`,
tests `cd worker && node --test`), front dans `cart.js` derrière `?checkout=test`. Circuit des commandes (validation sur la page /admin) : README « Paiement et commandes ».

## Économie de tokens (toujours)
- Ne lis jamais un fichier en entier : `grep -n` puis `sed -n a,bp` sur le passage utile.
- Pas d'exploration générale du dépôt : ce fichier décrit ce qu'il faut savoir.
- Images = très coûteuses. Analyse les STL en chiffres, pas en rendus.
- Si une info manque, choisis une valeur raisonnable et signale-la à la fin, sans t'arrêter pour demander.

## Ajouter un produit 3D à partir de fichiers STL
**Kit** (`m`, `kit`) : `ext`, `box`, `cyl`, `rev` (profil [rayon, hauteur] tourné autour de Y), `join`, `tray`, `overHook`,
`sideClamp` ; avec le moteur `geo.js`, chaque brique est un solide manifold-3d et `join` une vraie union (plus de faces
internes). Écris tout nouveau modèle avec ces briques, sans `BufferGeometry` brute ni concaténation de triangles.
Disponibles aussi pour les congés et jeux exacts : `k.offset(profil, delta)`, `k.conge(profil, r)`, `k.jeu(profil, j)`
(profils 2D, à passer à `k.ext`) et `k.extArrondi(profil, épaisseur, r)` (extrusion aux arêtes arrondies).
**Déclarations du modèle** (3e argument de `define`, syntaxe en tête de `tools/lib/controles.mjs`) :
- `solides: 1` (plus pour un assemblage voulu, ou fonction des valeurs) : tout écart échoue (pièce détachée, îlot) ;
- `cotes: ({ a, b, jeu }) => [{ nom, axe, en: [x, y, z], mesure: "trou" | "diametre" | "largeur" | "etendue" | "boite",
  selon?, attendu }]` : chaque cote fonctionnelle ou affichée, mesurée par coupe à ± 0,05 mm, dans le repère des pièces
  passées au dernier `join` ;
- `paroi: { min, seuil }` seulement si le défaut (1,2 mm) ne convient pas (dire pourquoi en commentaire).
**Jeu** : le modèle reçoit `jeu` (mm, matière du produit) avec les cotes ; pièce qui entre dans un trou du client :
cote − jeu ; pièce qui entoure un objet du client : cote + jeu ; une marge de conception s'ajoute au jeu, ne le remplace pas.
**Trous et cotes mesurées** : `circ`/`arc` sans `n` suivent la corde ≤ 0,5 mm (comme `cyl`) ; ne fixe `n` que pour un
contour décoratif (ou un profil découpé par indices).
Évite les pièces qui se touchent seulement par une face plane : fais-les se recouvrir (≥ 0,1 mm), l'union est bien plus rapide.
Les objets peuvent être de toute forme (pièce mécanique, support, objet organique,
assemblage de plusieurs pièces…) : adapte la méthode à l'objet, ne suppose rien.
Exemple déjà en place : `boite-rugged` (fichier
`assets/js/modeles/boite-rugged.js`, entrée `"boite-rugged"` dans `data.js`).
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
   - **reconstruction paramétrique** (comme les autres modèles, avec `m`/`kit`) : quand le
     STL est simple à redessiner ou que les autres méthodes déformeraient des détails ;
   - **combinaison** : ex. corps reconstruit + détail repris du STL et translaté.
   1 à 3 paramètres, exprimés comme l'utilisateur les mesure, en mm, avec des bornes
   qui gardent une pièce imprimable et solide.
4. **Liberté de design** : le STL fourni est une base, pas une contrainte. Tu peux :
   simplifier ou retirer des détails inutiles, ajouter des congés/chanfreins, renforcer,
   ajuster les proportions, réorganiser les pièces, ou reconstruire l'objet entièrement,
   pour coller au style Evarysth (pièce noire mate, lignes nettes, montage sans outil).
   Garde la fonction de l'objet intacte. Liste les libertés prises dans la réponse finale.
5. **Intégration** : STL dans `assets/models/<id-produit>/`, modèle dans `assets/js/modeles/<modèle>.js`,
   produit dans `data.js` (même format : 3 tailles standard + `custom.params`, univers
   le plus logique, **fiche d'impression** `impression: { matiere, orientation: POSE.…, supports, parPlateau, remarques }`
   — orientation = rotation propre du repère du modèle vers le plateau ; `pieces` pour une orientation par pièce ;
   chaque pièce doit tenir dans 256 × 256 × 256 mm aux cotes max : sinon bornes réduites ou modules), icône dans `SHAPES`
   si aucune existante ne convient. Puis
   `node tools/captures-og.cjs <id>` (image de partage) et `node tools/generer-pages.mjs`. Textes en
   français, ton du site, sans promesse invérifiable (étanche, alimentaire…).
   **Coloris : toujours 2 ou 3** dans `colors: [{ id, label, hex, roughness?, metalness? }]`,
   jamais un seul ni plus de 3 : le noir mat Evarysth + 1 ou 2 teintes qui conviennent à l'objet
   (ex. couleur des photos, teinte naturelle du sujet). Le 1er coloris est celui affiché par défaut.
6. **Vérification** : `node tools/verifier-geometrie.mjs <id> --mettre-a-jour` (ajoute sa référence ; étanche, solides,
   cotes, paroi, fiche d'impression ; temps de calcul : viser < 100 ms, 300 ms au plus), puis `cd tools && node --test`
   (tout vert), `node tools/generer-stl.mjs <id> --impression` aux cotes max, puis serveur local (`python3 -m http.server`, fiche ouverte sans drapeau) + Playwright
   (Chromium déjà installé, lancer avec `--use-gl=angle --use-angle=swiftshader`).
   Au plus 2 captures par produit, en deviceScaleFactor 1 : valeurs par défaut et
   valeurs extrêmes. Console sans erreur. Une capture de plus seulement si la forme
   ou l'assemblage paraît faux.
7. **Fin** : commit + push sur la branche de travail. Réponse courte : par produit, la
   stratégie choisie, tableau des paramètres (min/défaut/max), coloris retenus, libertés de design prises,
   points à vérifier (prix, licence du modèle d'origine).

## Photos commerciales
`assets/photos/<id-produit>/1.webp, 2.webp…` (≤ 1600 px de large, ~200 Ko). Dans `data.js` :
`photos: [{ src, alt, pos? }]` (pos = object-position du recadrage) + `photosNote` facultatif.
La 1re photo sert de vignette au catalogue (2e au survol) ; sur la fiche, la 3D reste la vue 1.
Après ajout/changement de photo : `node tools/captures-og.cjs <id>` puis `node tools/generer-pages.mjs`.
Sans photo, la vignette du catalogue = 2 rendus 3D (`assets/vignettes/<id>-1.webp`, `-2.webp` au survol),
produits par ce même `captures-og.cjs` : à relancer après toute modif d'un modèle 3D. Ne pas les ouvrir pour vérifier.

## Mise en ligne (autorisée par le propriétaire, sans redemander)
Chaque push sur `main` republie le site (GitHub Pages, `.github/workflows/pages.yml`).
Une fois le travail vérifié : push de la branche, PR vers `main`, fusion en squash, puis
contrôle que le workflow « Publier le site » réussit et que le site en ligne sert la nouvelle
version. Avant d'ouvrir la PR, se mettre à jour sur `main` (d'autres sessions publient en
parallèle) et éviter les doublons de produit. Si le déploiement échoue, corriger et republier.
