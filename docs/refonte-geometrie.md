# Refonte du moteur géométrique (manifold-3d)

> **État (9 novembre 2026)** : phases 0 à 3 terminées. Depuis la phase 3, le moteur manifold-3d est celui **par défaut** du site (ancien kit three.js : `?geo=ancien`, mémorisé, jusqu'à sa suppression en phase 4). Prochaine étape : phase 4, sur feu vert du propriétaire.
> Écarts phase 1 : `jardiniere-clip` → `tablette-rambarde` (index.html, tests Worker) ; « popular » ajouté à `crochet-balcon`, `passe-cable`, `vide-poche-cles` (4 mis en avant retirés + 1 conservé) ; icônes `clamp`, `clip`, `riser`, `reel`, `stand`, `handle` retirées de `SHAPES` ; fonctions du kit intactes ; `docs/traitement-commandes.md` (historique OpenSCAD) non modifié.
> Chaque phase = une session, un commit, un compte rendu court, puis pause jusqu'au feu vert suivant.
> Modèle conseillé : Opus effort élevé pour les phases 2 à 4 ; Sonnet suffit pour la phase 1.

## Décisions prises (ne pas rediscuter)
- **Abandon d'OpenSCAD.** Source de vérité géométrique unique = les modèles JS du site (`assets/js/modeles/*.js`),
  exécutés à l'identique dans le navigateur (aperçu) et sous Node (fabrication).
- **Booléens et maillage étanche par `manifold-3d`** (WASM, version épinglée), côté navigateur et côté Node.
  Un maillage non étanche fait échouer la génération (jamais de fichier silencieusement faux).
- **Atelier en mode « pull »** : aucun port ouvert ; un agent local vient chercher les travaux validés.
- **Flux d'impression hybride** : génération automatique (STL + fichier tranché + manifeste dans R2), lancement manuel
  sur la machine (Bambu Lab), suivi d'état lu par MQTT en lecture seule pour mettre `/admin` à jour.
  L'agent est écrit avec des adaptateurs (`manuel`, `bambu-mqtt`, `moonraker`) : le choix de machine reste réversible.
- **Validation humaine conservée** (« rien ne part sans validation »), à rendre rapide plutôt qu'à supprimer.
- **Les modèles sous droits de tiers sont conservés** par choix du propriétaire : `carapuce`, `chat-lord`,
  `voiture-voronoi`. Licence / propriété intellectuelle à régler avant l'ouverture des ventes (hors de ce chantier).

## Constat de départ (moteur actuel)
- Kit commun dans `assets/js/viewer3d.js` (l. 34-58 : `ext`, `box`, `cyl`, `join` ; puis `sculpt`, `tray`,
  `overHook`, `sideClamp`, `fetchSTL`, `uPts`, `arc`, `rect`, `circ`). 35 modèles sur 42 passent par `m()` + `join()`.
- **`join()` concatène des triangles sans union** : solides superposés, faces internes. C'est le défaut à corriger.
- Hors kit : `equerre` (`ExtrudeGeometry` biseautée), `support-casque-gyroide` (géométrie brute + kit),
  `support-aerosol-skadis` (géométrie brute + kit), `sculpt` (maillage déformé : `carapuce`, `chat-lord`,
  `voiture-voronoi`), STL étirés par zones (`boite-rugged`).
- Facettisation : `cyl` à 40 segments fixes ; un trou facetté est plus petit que nominal
  (flèche = r·(1 − cos(π/n))). À remplacer par un nombre de segments par longueur ou une compensation de rayon.
- Matières affichées : PLA, PETG, mais aussi ASA, PA-CF, PA12, alors que l'atelier vise PLA/PETG. **À décider**
  (hors phase 1) : garder ces matières pour les fabricants externes ou ramener le catalogue à PLA/PETG.

## Inventaire et tri (42 modèles → 16 gardés)
Critères : objet réel (photos), couverture de chaque façon de construire du kit, au moins 2 produits par univers.

| Modèle (produit) | Univers | Construction | Photos | Décision |
|---|---|---|---|---|
| boite-rugged | meubles | STL étiré par zones + kit | oui | **garder** |
| support-casque-gyroide | meubles | géométrie brute + kit | oui | **garder** |
| vide-poche-cles | meubles | kit (arc, circ, ext), reconstruit d'après STL | oui | **garder** |
| distributeur-cotons | meubles | kit (ext, join), reconstruit d'après STL | oui | **garder** |
| cintre-sac | meubles | kit (arc, circ, box) | oui | **garder** |
| support-aerosol-skadis | meubles | géométrie brute + kit (cyl) | oui | **garder** |
| organiseur-tiroir | meubles | `tray`, 2 paramètres | non | **garder** (couvre `tray`) |
| equerre (equerre-l) | meubles | `ExtrudeGeometry` biseautée, hors kit | non | **garder** (couvre three.js brut) |
| crochet-appui-tete | bureau | kit (arc, circ, ext) | oui | **garder** |
| support-casque | bureau | `sideClamp` | non | **garder** (couvre `sideClamp`) |
| passe-cable | bureau | `cyl` percé, trou fonctionnel | non | **garder** (couvre `cyl` + trous) |
| tablette-rambarde | balcon | kit (uPts, box), 2 paramètres | non | **garder** |
| crochet-balcon | balcon | `overHook` | non | **garder** (couvre `overHook`) |
| carapuce | deco | `sculpt` | oui | **garder** (choix propriétaire) |
| chat-lord | deco | `sculpt` | oui | **garder** (choix propriétaire) |
| voiture-voronoi | deco | `sculpt` + STL | oui | **garder** (choix propriétaire) |
| jardiniere-clip, pince-parasol, clip-brise-vue, clips-guirlande, pieds-pot, clips-tuteur, support-tuyau, enrouleur-mural, pinces-nappe | balcon | kit | non | retirer |
| goulotte-cable, dock-chargeur, support-portable, support-telephone, clips-cables, support-manette, support-uc, organiseur-bureau | bureau | kit | non | retirer |
| rehausseur, crochet-porte, taquets-etagere, poignee-meuble, cales-meuble, separateurs-etagere, support-tringle, embouts-pieds, penderie-etagere | meubles | kit | non | retirer |

Univers après tri : balcon 2, bureau 3, meubles 8, déco 3.

## Phases
### Phase 1 — nettoyage du catalogue
- Retirer les 26 produits : entrée `data.js`, `assets/js/modeles/<id>.js`, `assets/models/<id>/`, `assets/photos/<id>/`,
  vignettes `assets/vignettes/<id>-*.webp`, image de partage, pages générées ; puis `node tools/generer-pages.mjs`
  (sitemap compris). Icônes `SHAPES` devenues inutiles : retirer.
- Références en dur à traiter : `jardiniere-clip` dans `index.html` et `worker/test/worker.test.mjs`
  (remplacer par un produit gardé) ; chercher chaque id retiré avec `grep -rn` hors pages générées.
- Fonctions du kit qui ne servent plus : les garder si elles sont prévues pour de futurs produits, sinon retirer.
- Vérifier : site local + Playwright, console sans erreur, `cd worker && node --test` vert.
- **À décider par le propriétaire** : mise en ligne immédiate (fusion sur `main`) ou différée jusqu'à la phase 3.

### Phase 2 — moteur commun navigateur + Node
- Réécrire le kit sur manifold-3d avec la **même API** (`ext` → `CrossSection.extrude`, `box` → `Manifold.cube`,
  `cyl` → `Manifold.cylinder` à segments par longueur, `join` → `Manifold.union`), plus jeux et congés exacts
  (`CrossSection.offset`). Conversion Manifold → `BufferGeometry` pour l'aperçu.
- Viewer : chargement WASM à la demande, version épinglée ; mettre à jour la CSP (README « Sécurité du site »)
  pour la source et l'exécution WASM.
- Outil `tools/generer-stl.mjs <produit> a=… b=…` → STL + manifeste JSON (cotes, SHA git, volume, boîte englobante).
- Mettre à jour `CLAUDE.md` (méthode d'ajout de produit).
- Critère d'acceptation : aperçu et STL issus du même calcul ; maillage non étanche → erreur.

**Phase 2 terminée (9 novembre 2026).** Architecture :
- `assets/js/geo.js` (module ES, reçoit THREE + WASM) : `createKit()` → `ext` (`CrossSection` EvenOdd + `extrude`), `box`
  (`Manifold.cube`), `cyl` (`Manifold.cylinder` ; tube = anneau 2D extrudé ; segments : corde ≤ 0,5 mm, ≥ 24, multiple de 4),
  `join` (`Manifold.union` puis centrage), `tray`/`overHook`/`sideClamp` sur ces briques ; `section`, `offset`, `conge`, `jeu`
  (`CrossSection.offset`) pour la phase 3 ; `fromGeometry` (sommets fusionnés à 1e-4 mm), `toGeometry` (indexée, normales
  lissées sous 30°, arêtes plus vives dédoublées ; calcul JS, `calculateNormals` de manifold prenant 94 s sur le treillis
  gyroïde), `bilan`, `preview`, `flush` (libération des objets WASM après chaque calcul). Les solides imitent
  `BufferGeometry` (`translate`, `rotateX/Y/Z`, `scale`, `applyMatrix4`, `clone`, `center`, `dispose`).
- `viewer3d.js` : drapeau `?geo=manifold` (mémorisé `evarysth.geo`, `?geo=off`), chargement à la demande de `geo.js` et de
  `assets/vendor/manifold-3d/` (3.5.4) ; `kit()` rend le kit manifold, conversion pour l'aperçu, bilan en `console.info`.
  Sans drapeau : code et requêtes inchangés. CSP : `'wasm-unsafe-eval'`.
- Node : `tools/lib/moteur.mjs` exécute `data.js`, `viewer3d.js` et les modèles tels quels (une instance par kit) ;
  `tools/generer-stl.mjs` (STL Z en haut + manifeste) ; `tools/comparer-kits.mjs` (contrôle ci-dessous).
- `join` sur une `BufferGeometry` (hors kit) : conversion tentée ; si non étanche, repli sur la concaténation (aperçu
  intact, bilan « non étanche », `generer-stl` refuse sauf `--forcer`).

Écarts ancien/nouveau (`node tools/comparer-kits.mjs`, 189 combinaisons min/défaut/max) :

| Produit | Kit | Comb. | Δ boîte max | Vol. nouveau / ancien | Étanche | Solides |
|---|---|---|---|---|---|---|
| crochet-balcon | kit | 3 | 0 | 0,851 – 0,891 | 3/3 | 1 |
| tablette-rambarde | kit | 9 | 0 | 1,000 | 9/9 | 1 |
| support-casque | kit | 3 | 0 | 1,000 | 3/3 | 1 |
| passe-cable | kit | 3 | 0 | 0,998 – **1,003** | 3/3 | 2 (5 à a = 30) |
| crochet-appui-tete | kit | 27 | 0 | 0,948 – 0,957 | 27/27 | 1 |
| organiseur-tiroir | kit | 9 | 0 | 0,941 – 0,969 | 9/9 | 1 |
| vide-poche-cles | kit | 27 | 0 | 0,890 – 0,932 | 27/27 | 1 |
| distributeur-cotons | kit | 27 | 4e-6 | 1,000 | 27/27 | 1 |
| cintre-sac | kit | 3 | 2e-6 | 0,930 – 0,950 | 3/3 | 1 |
| equerre-l | hors kit | 27 | 0 | 1,000 | 27/27 | 1 |
| boite-rugged | hors kit | 27 | 0 | 1,000 | 27/27 | 4 (assemblage) |
| support-casque-gyroide | hors kit | 9 | 0 | 0,990 – 0,993 | 9/9 | 125 à 291 |
| support-aerosol-skadis | hors kit | 6 | 0 | **1,0002 – 1,0003** | **0/6** | — |
| carapuce | hors kit | 3 | 0 | 1,000 | 3/3 | 1 |
| chat-lord | hors kit | 3 | 0 | 1,000 | 3/3 | 2 |
| voiture-voronoi | hors kit | 3 | 0 | 1,000 | 3/3 | 4 |

- Boîte englobante : identique partout (≤ 4e-6 mm, bruit flottant). Volume : baisse = recouvrements supprimés par l'union.
- Volume en hausse, expliqué par la facettisation : `passe-cable` (pièces qui se touchent sans se recouvrir ; cylindres
  extérieurs à 0,5 mm de corde au lieu de 40 segments, +0,4 % de section) ; `support-aerosol-skadis` (même effet sur sa
  bague, non étanche donc concaténée).
- Hors kit : étanches tels quels `equerre`, `boite-rugged` (4 pièces), `carapuce`, `chat-lord` (2 coques), `voiture-voronoi`
  (4 morceaux), `support-casque-gyroide` (treillis : 125 à 291 îlots détachés). **Non étanche** : `support-aerosol-skadis`
  (paroi avant ouverte à ses extrémités, fermée seulement par recouvrement avec le dos).
- À reprendre en phase 3 : `passe-cable` (disque intérieur détaché du tube par 0,5 mm ; à a = 30 la fente le coupe en
  5 morceaux) ; pièces jointives à plat (union lente : 72 ms contre 5 ms avec recouvrement ; `passe-cable` ≈ 80 ms par
  calcul) ; `support-casque-gyroide` ≈ 1,2 s par calcul sous le drapeau (conversion du treillis de 209 000 triangles) ;
  `circ`/`arc` du kit gardent leur nombre de segments fixe (seul `cyl` suit la corde de 0,5 mm).

### Phase 3 — conversion des 16 modèles gardés
- Modèles du kit : migration directe. `equerre` : biseau → `CrossSection` + `offset` arrondi.
  `sculpt` : tester l'étanchéité aux bornes, sinon reconstruire. STL importés : valider une fois l'étanchéité du STL source.
- Vérifier, pour chaque modèle, l'écart ancien/nouveau (boîte englobante, volume) aux combinaisons min/défaut/max ;
  au plus 2 captures Playwright par produit (deviceScaleFactor 1).

**Phase 3 terminée (9 novembre 2026).** Les 16 modèles sortent étanches avec le nombre de solides déclaré, à toutes les
combinaisons min/défaut/max ; le nouveau moteur est celui par défaut du site.
- **Nombre de solides** : `define(id, factory, { solides: n })` (1 partout ; `passe-cable` 2, `boite-rugged` 4).
  `generer-stl` (manifeste : `solides`, `solides_attendus`) et `comparer-kits` refusent tout écart.
- **Facettisation** : dans le kit manifold, `circ`/`arc` sans `n` explicite suivent la règle de `cyl` (corde ≤ 0,5 mm,
  multiple de 4, jamais moins fin que les 40/32 segments d'avant) ; un `n` explicite reste fixe (contours décoratifs,
  profils découpés par indices : `arc(…, 24).slice(1, 24)`). `overHook` (geo.js) suit la même règle.
  Contrôle par coupe : `node tools/verifier-trous.mjs` (`Manifold.slice`, ± 0,05 mm) — cintre-sac (crochet de tringle,
  2 coupes), passe-cable (fût Ø a, alésage Ø a − 6), crochet-appui-tete (œillet Ø a + 1, petits crochets b) : 93 contrôles,
  écart max −0,008 mm. Avant, l'œillet (40 segments fixes) manquait la cote de 0,065 mm à a = 20.
- **Outils** : `comparer-kits --ref=<commit>` (ancien kit = fichiers d'un commit, ex. la version publiée ; colonnes
  volume, solides attendus, temps calcul + aperçu ; code 1 si non étanche ou nombre de solides faux) ;
  `verifier-trous.mjs` ; kit : `rev` (révolution d'un profil), `extArrondi` (extrusion aux arêtes arrondies).
- **Bascule** (`viewer3d.js`) : kit manifold par défaut ; `?geo=ancien` (ou `?geo=off`) → ancien kit, mémorisé
  (`evarysth.geo` = `ancien`) ; `?geo=manifold` (ou `?geo=nouveau`) efface la mémoire et logue le bilan du modèle
  après le premier rendu (diagnostic ; plus de bilan au montage, il coûtait un calcul complet de plus) ; si le WASM ne
  se charge pas, repli sur l'ancien kit avec un avertissement.

Corrections par modèle (libertés prises en *italique*) :
- `support-aerosol-skadis` : paroi avant fermée à ses deux extrémités et prolongée de 1° (≥ 0,36 mm) dans le dos ;
  fond ajouré noyé de 1 mm dans la paroi (il ne faisait que la toucher). Étanche sans `--forcer`, 1 solide. Aspect inchangé.
- `passe-cable` : le disque est **une pièce séparée voulue**, le couvercle (« le couvercle s'ouvre juste assez pour les
  câbles », data.js) → 2 solides. Bague d'un seul tenant par révolution d'un profil (`k.rev`, plus de booléen entre
  collerette et fût coaxiaux : 113 → 46 ms). *Épaulement intérieur ajouté* (Ø a − 9, 1,7 mm de haut, 0,3 mm sous le
  couvercle) : sans lui le couvercle tombait dans le fût. *Fente fermée → encoche ouverte sur le bord* (8 mm de large,
  du centre au bord) : plus de découpe en morceaux à a = 30 (la fente coupait le bord du disque), et le couvercle se pose
  câbles branchés. Cotes fonctionnelles inchangées (fût Ø a, alésage Ø a − 6, collerette Ø a + 16). Volume +2 % (épaulement).
- `support-casque-gyroide` : socle et appui bombé intégrés au champ implicite (distances exactes : mêmes formes que les
  extrusions biseautées d'avant, profil grossi de 1,5 mm et arêtes arrondies r = 1,5), donc un seul maillage « surface
  nets », sans booléen ; îlots retirés en JS (connexité par arêtes à 2 triangles : 195 à 290 fragments de 1 à 4 mm³,
  détachés ou pincés par un sommet). 1 solide ; Δ boîte 0,001 mm ; volume −0,1 % par rapport à l'union de phase 2.
  Calcul 1,5 s → 0,24 s (Node) ; le modèle ne passe plus par le kit (même géométrie dans les deux moteurs).
  *Arêtes du socle et de l'appui calculées sur la grille de 1,6 mm (arrondi au lieu de 3 facettes de biseau).*
- `equerre` (equerre-l) : `k.extArrondi(k.conge(L, 4, concaves), c, 0.8)` — profil cœur en L avec congé exact de 4 mm,
  grossi de 0,8 mm (`offset` Round), arêtes arrondies au même rayon en 2 segments (comme le biseau three.js).
  Boîte identique, volume ±0,02 %. *Congé intérieur circulaire au lieu d'une courbe quadratique (écart ≤ 0,2 mm).*
  L'`ExtrudeGeometry` ne sert plus qu'à l'ancien kit (`?geo=ancien`).
- `crochet-appui-tete` : trou de l'œillet sans `n` fixe (règle de corde). Arcs des crochets déjà sans `n`.
- `chat-lord`, `voiture-voronoi`, `carapuce` (sculpt) : les « 2 » et « 4 » solides de phase 2 étaient des débris de volume
  nul dans les STL sources (paires de triangles dos à dos : 6, 40 et 8 triangles) ; retirés une fois des fichiers
  `assets/models/*/` (même boîte, même volume). 1 solide aux bornes.
- `boite-rugged` (STL étiré) : étanche, 4 solides aux bornes (boîte, couvercle, 2 loquets). Sans changement.
- Autres modèles du kit : déclaration `{ solides: 1 }` seulement ; volumes un peu en hausse là où des arcs sont plus fins
  (`support-casque` +0,06 %).

Écarts finaux (`node tools/comparer-kits.mjs --ref=3fd2c98`, ancien kit = version publiée avant la phase 3,
189 combinaisons ; temps = calcul du modèle + aperçu, moyenne, Node) :

| Produit | Kit | Comb. | Δ boîte max (mm) | Vol. nouveau / ancien | Volume (cm³) | Étanche | Solides (attendu) | Calcul + aperçu |
|---|---|---|---|---|---|---|---|---|
| crochet-balcon | kit | 3 | 0,000 | 0,8513 – 0,8908 | 20,0 – 28,5 | 3/3 | 1 (1) | 13 ms |
| tablette-rambarde | kit | 9 | 0,000 | 1,0000 – 1,0000 | 217,7 – 517,1 | 9/9 | 1 (1) | 1 ms |
| support-casque | kit | 3 | 0,000 ↑ | 1,0005 – 1,0006 | 28,5 – 34,5 | 3/3 | 1 (1) | 7 ms |
| passe-cable | kit | 3 | 0,000 ↑ | 1,0186 – 1,0217 | 9,1 – 41,0 | 3/3 | 2 (2) | 46 ms |
| crochet-appui-tete | kit | 27 | 0,000 | 0,9482 – 0,9567 | 29,6 – 36,1 | 27/27 | 1 (1) | 19 ms |
| equerre-l | kit | 27 | 0,000 ↑ | 0,9998 – 1,0002 | 6,3 – 104,5 | 27/27 | 1 (1) | 2 ms |
| boite-rugged | hors kit | 27 | 0,000 | 1,0000 – 1,0000 | 83,6 – 825,3 | 27/27 | 4 (4) | 5 ms |
| support-casque-gyroide | hors kit | 9 | 0,001 | 0,9885 – 0,9915 | 184,3 – 384,5 | 9/9 | 1 (1) | 239 ms |
| organiseur-tiroir | kit | 9 | 0,000 | 0,9413 – 0,9686 | 148,7 – 1 559,4 | 9/9 | 1 (1) | 5 ms |
| vide-poche-cles | kit | 27 | 0,000 | 0,8901 – 0,9323 | 46,4 – 231,5 | 27/27 | 1 (1) | 14 ms |
| distributeur-cotons | kit | 27 | 0,000 | 1,0000 – 1,0000 | 68,2 – 185,8 | 27/27 | 1 (1) | 62 ms |
| cintre-sac | kit | 3 | 0,000 | 0,9304 – 0,9503 | 36,1 – 51,7 | 3/3 | 1 (1) | 7 ms |
| support-aerosol-skadis | hors kit | 6 | 0,000 | 0,9844 – 0,9940 | 43,9 – 183,3 | 6/6 | 1 (1) | 39 ms |
| chat-lord | hors kit | 3 | 0,000 | 1,0000 – 1,0000 | 55,1 – 1 145,3 | 3/3 | 1 (1) | 3 ms |
| carapuce | hors kit | 3 | 0,000 | 1,0000 – 1,0000 | 41,8 – 1 548,3 | 3/3 | 1 (1) | 3 ms |
| voiture-voronoi | hors kit | 3 | 0,000 | 1,0000 – 1,0000 | 18,5 – 255,2 | 3/3 | 1 (1) | 5 ms |

Ratio < 1 : recouvrements supprimés par l'union (ancien kit = concaténation). Hausses expliquées : `passe-cable`
(épaulement ajouté), `support-casque` et `equerre-l` (facettisation plus fine).

Poids et temps (fiche produit, cache vide, Playwright/Chromium headless, serveur local avec gzip comme GitHub Pages,
médiane de 3 chargements, temps jusqu'au canvas 3D affiché) :

| Fiche | Ancien kit | Nouveau moteur | Écart |
|---|---|---|---|
| passe-cable (sans limite de débit) | 608 ms, 686 Ko | 868 ms, 913 Ko | +0,26 s, +227 Ko |
| distributeur-cotons | 627 ms, 708 Ko | 872 ms, 936 Ko | +0,25 s |
| cintre-sac | 624 ms, 614 Ko | 709 ms, 842 Ko | +0,09 s |
| support-casque-gyroide | 1 651 ms | 1 625 ms | 0 |
| passe-cable (4G simulée : 9 Mbit/s, 40 ms) | 1 457 ms | 1 674 ms | +0,22 s |
| cintre-sac (4G simulée) | 1 415 ms | 1 575 ms | +0,16 s |

Transfert ajouté : `manifold.wasm` 541 Ko bruts, **207 Ko gzip** (GitHub Pages le compresse : `content-encoding: gzip`,
vérifié sur evarysth.fr), `manifold.js` 19 Ko, `geo.js` 5 Ko : ~231 Ko compressés. Écart sous les seuils (1 s, 300 Ko) :
bascule faite sans aperçu intermédiaire. Vérification sans drapeau (passe-cable, support-aerosol-skadis,
support-casque-gyroide, cintre-sac) : canvas présent, WASM chargé, curseur min → max qui change la vue, console vide,
aucune violation CSP ; `?geo=ancien` mémorisé puis `?geo=manifold` : conformes.

À vérifier (propriétaire) : `passe-cable` fût à Ø a exact (aucun jeu dans le trou du plateau, comme avant) et couvercle à
imprimer à part (fiche d'impression, phase 4) ; `support-casque-gyroide` mesure a − 1,5 mm de haut et `equerre-l` a + 1,6 mm
par branche (déjà le cas avant, cotes du bord arrondi).

### Phase 4 — contrôles automatiques + fiche d'impression
- Tests Node + workflow GitHub Actions : toutes les combinaisons min/défaut/max ; statut Manifold sans erreur,
  un seul solide (sauf assemblage voulu), volume > 0, cotes fonctionnelles par coupe (`slice(z)`, ±0,05 mm),
  paroi minimale (section + `offset(−e/2)`).
- Chaque modèle déclare ses contrôles de cotes ; `data.js` reçoit la fiche d'impression (orientation, matériau,
  jeu, pièces par plateau).

### Hors périmètre (chantier suivant)
Tranchage CLI dans Docker (version et profils épinglés, versionnés), stockage R2, génération à la commande depuis le
Worker, agent d'atelier (adaptateurs `manuel` / `bambu-mqtt` lecture seule), prix calculé depuis masse et temps.
