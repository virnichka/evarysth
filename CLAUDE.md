# Evarysth — consignes pour Claude

Site vanilla HTML/CSS/JS sans build (voir README.md). Catalogue : `assets/js/data.js`.
Pages `produits/<id>/`, `univers/<id>/` et `catalogue/` **générées** depuis `index.html` + `data.js` : après toute
modification de l'un des deux, `node tools/generer-pages.mjs` (la publication échoue sinon). Liens
relatifs à la racine : `produits/<id>/`, `univers/<id>/`, `catalogue/` (jamais `#p-`, `#f-`, `#catalogue`) ;
ces pages ont un `<base href>` vers la racine.
Viewer 3D : moteur + briques communes dans `assets/js/viewer3d.js` ; un fichier par modèle dans
`assets/js/modeles/<modèle>.js` (chargé à la demande, `EVARYSTH.viewer3d.define`) : n'ouvre que celui utile. Icônes line-art : objet `SHAPES` dans `assets/js/app.js`.
Moteur géométrique unique : kit `assets/js/geo.js` (manifold-3d), dans le navigateur et sous Node (`tools/lib/moteur.mjs`,
dépendances : `cd tools && npm ci`).
**Contrôles** : `cd tools && node --test` (< 1 min, workflow « Contrôles de géométrie » sur chaque PR) ; détail par produit :
`node tools/verifier-geometrie.mjs [id…] [--detail]`. Changement de forme voulu : `--mettre-a-jour` (référence figée
`tools/references-geometrie.json`, à committer). Jeu par matière : `jeu` des matières de `data.js`, reçu par le modèle.
**Barème des prix** (`assets/js/bareme.js`, généré, jamais à la main) : périmé dès qu'une forme, une fiche d'impression,
des bornes de cotes ou un profil change (`geometrie` rouge) → workflow « Barème des prix sur-mesure » (`bareme.yml`) sur la
branche, ou `node tools/generer-bareme.mjs <id>` si Bambu Studio est installé ; tarifs : `EVARYSTH.tarif` de `assets/js/prix.js`.
Il fixe **tous les prix**, tailles standard comprises (site et Worker, `priceFor`) : nouveau produit = son barème avant la PR.
**Prix** : tout le calcul dans `assets/js/prix.js` (après `bareme.js` ; `data.js` = données), règle dans `docs/prix.md`,
livraison / cadeau / code de démo dans `EVARYSTH.frais`. Rapport : `node tools/rapport-prix.mjs` ; tout prix changé
fait échouer `tools/test/prix.test.mjs` : si voulu, `--mettre-a-jour` (référence `tools/references-prix.json`, à committer).

Paiement (mode test, ventes fermées) : Worker Cloudflare dans `worker/` (prix recalculés depuis `data.js` et `prix.js`,
tests `cd worker && node --test`), front dans `cart.js` derrière `?checkout=test`. Circuit des commandes (validation sur la page /admin) : README « Paiement et commandes », détail (Sheet, /admin) : `docs/commandes.md`.
Fiche produit (`renderProduct`, `app.js`) : une information = un seul endroit. Même gabarit pour tous les produits (pas de cas par type d'objet ; pas de bloc « Comment mesurer ? », le guide
reste dans `ui.js` si on le rebranche). Statut « boutique en préparation » : constante `BOUTIQUE_OUVERTE` en tête de `app.js`.
Chaîne de fabrication (commande payée → fichiers d'impression dans R2, tranchage, barème) : `docs/fabrication.md`.
**Docs** : décrire l'état actuel au présent ; pas de journal de chantier, de phases ni de plans dans le dépôt (git garde l'historique).

## Économie de tokens (toujours)
- Ne lis jamais un fichier en entier : `grep -n` puis `sed -n a,bp` sur le passage utile.
- Pas d'exploration générale du dépôt : ce fichier décrit ce qu'il faut savoir.
- Images = très coûteuses. Analyse les STL en chiffres, pas en rendus.
- Si une info manque, choisis une valeur raisonnable et signale-la à la fin, sans t'arrêter pour demander.

## Ajouter un produit (STL, modèle 3D, photos)
Lire d'abord `docs/ajout-produit.md` (méthode, kit `geo.js`, déclarations `solides`/`cotes`/`paroi`, jeu, fiche
d'impression, coloris 2 ou 3, vérifications, photos). Ne l'ouvrir que pour cette tâche.

## Mise en ligne (autorisée par le propriétaire, sans redemander)
Chaque push sur `main` republie le site (GitHub Pages, `.github/workflows/pages.yml`).
Une fois le travail vérifié : push de la branche, PR vers `main`, fusion en squash, puis
contrôle que le workflow « Publier le site » réussit et que le site en ligne sert la nouvelle
version. Après la fusion d'une PR, supprimer sa branche de travail (sur GitHub). Avant d'ouvrir la PR, se mettre à jour sur `main` (d'autres sessions publient en
parallèle) et éviter les doublons de produit. Si le déploiement échoue, corriger et republier.
Le contrôle `geometrie` (workflow « Contrôles de géométrie ») est obligatoire pour fusionner sur `main` : il doit être
vert sur la PR. Ne jamais remettre de filtre `paths` sur son déclencheur `pull_request` (une PR resterait bloquée).
