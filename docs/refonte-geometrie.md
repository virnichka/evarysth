# Refonte du moteur géométrique (manifold-3d)

> **État (9 novembre 2026)** : phase 0 terminée (ce document). Prochaine étape : phase 1, sur feu vert du propriétaire.
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

### Phase 3 — conversion des 16 modèles gardés
- Modèles du kit : migration directe. `equerre` : biseau → `CrossSection` + `offset` arrondi.
  `sculpt` : tester l'étanchéité aux bornes, sinon reconstruire. STL importés : valider une fois l'étanchéité du STL source.
- Vérifier, pour chaque modèle, l'écart ancien/nouveau (boîte englobante, volume) aux combinaisons min/défaut/max ;
  au plus 2 captures Playwright par produit (deviceScaleFactor 1).

### Phase 4 — contrôles automatiques + fiche d'impression
- Tests Node + workflow GitHub Actions : toutes les combinaisons min/défaut/max ; statut Manifold sans erreur,
  un seul solide (sauf assemblage voulu), volume > 0, cotes fonctionnelles par coupe (`slice(z)`, ±0,05 mm),
  paroi minimale (section + `offset(−e/2)`).
- Chaque modèle déclare ses contrôles de cotes ; `data.js` reçoit la fiche d'impression (orientation, matériau,
  jeu, pièces par plateau).

### Hors périmètre (chantier suivant)
Tranchage CLI dans Docker (version et profils épinglés, versionnés), stockage R2, génération à la commande depuis le
Worker, agent d'atelier (adaptateurs `manuel` / `bambu-mqtt` lecture seule), prix calculé depuis masse et temps.
