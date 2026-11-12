# Chaîne de fabrication (commande payée → fichiers prêts à imprimer)

Pour chaque article payé, GitHub Actions produit automatiquement les fichiers d'impression aux cotes commandées et les
range dans Cloudflare R2. Rien n'est imprimé ni envoyé sans validation dans /admin. Vue d'ensemble du circuit de
commande : README « Paiement et commandes » ; Sheet et /admin : `docs/commandes.md` ; prix : `docs/prix.md`.

## Principe
```
 Worker evarysth-checkout ── prix (data.js + bareme.js + prix.js) ── SHA du site (version.json) → metadata Stripe
   ▼  webhook payé (idempotent)
 Sheet (Commandes CF : Génération, SHA, Masse g, Temps min, Plateaux, Motif génération)
   │  workflow_dispatch fabrication.yml { cf, produit, cotes, coloris, quantite, sha }   (jeton Actions : écriture)
   ▼
 GitHub Actions ── image ghcr.io/…/evarysth-fabrication@sha256:… (Bambu Studio CLI + Node + profils P2S)
   │  checkout du SHA → tools/fabriquer.mjs (generer-stl --impression → trancher.mjs si PLA/PETG → fiche-impression)
   │  → R2 commandes/<n° d'article>/<SHA court>/ : manifeste.json, *.stl, plateau-<n>.3mf, plateau-<n>.gcode.3mf, fiche.html
   │  POST /fabrication/retour (HMAC) { cf, sha, statut, masse, temps, plateaux, motif }
   ▼
 /admin ── fichiers prêts ? → « Valider et envoyer »
   ├── fabricant « e-mail » : liens signés /fichier/<jeton> → STL, 3MF non tranché, fiche (14 jours)
   └── fabricant « manuel » ou « atelier » (PLA/PETG) : fiche à transmettre ; « atelier » reçoit aussi le fichier tranché P2S
```

## Règles
- **Source géométrique unique** : les modèles JS (`assets/js/modeles/`, `assets/js/geo.js`, manifold-3d), exécutés sous
  Node par `tools/generer-stl.mjs --impression` (pièces posées et rangées sur un plateau de 256 × 256 × 256 mm).
- **Journaux publics** (dépôt public) : entrées du workflow et journaux limités à n° d'article, produit, cotes, coloris,
  quantité, SHA (jamais nom, adresse, e-mail, n° EV, montant) ; **aucun « artifact » d'Actions** (les fichiers vont
  directement dans R2) ; identifiants R2 en secrets d'Actions, jeton R2 limité au seul bucket.
- **Jeton GitHub du Worker** : fine-grained, ce seul dépôt, « Actions : écriture » uniquement ; son expiration est
  surveillée dans l'onglet Système de /admin (orange à J-30).
- **Moment** : génération et tranchage dès le paiement ; envoi au fabricant seulement à la validation dans /admin.
- **Idempotence** : clé = n° d'article + SHA ; `manifeste.json` présent → sortie immédiate et rappel renvoyé ;
  `concurrency` par n°. Un webhook reçu deux fois ne relance rien.
- **Fichiers figés au SHA du paiement** : un modèle modifié entre paiement et validation ne change rien ; « Régénérer au
  SHA actuel » dans /admin est une action explicite, tracée dans l'Historique.
- **N° d'article** `CF-AAAA-NNNN-<n° d'article>` (et non le n° CF fournisseur, qui n'existe pas encore au paiement et
  change avec le fabricant).
- **Matières** : la chaîne connaît les 5 matières (jeu, densité, €/kg) ; seuls **PLA et PETG** ont un profil de tranchage.
  Pour les autres, le fabricant reçoit STL + 3MF non tranché + fiche.

## Ce qui est produit (`tools/fabriquer.mjs`)
`node tools/fabriquer.mjs --cf=… --produit=… --cotes='{"a":60}' [--coloris=…] [--quantite=n] [--docker=<image>]`
- `generer-stl --impression --quantite=n --coloris --cf --3mf` : exemplaires sur un ou plusieurs plateaux, 3MF non
  tranché par plateau, manifeste (n° d'article, coloris id + hex, quantité, pièces et orientations, versions).
- `trancher.mjs` : profil par matière (PLA, PETG ; autre matière : code 3), couleur du coloris (`filament_colour`),
  complète le manifeste (masse, temps, filament, mapping AMS conseillé, versions Bambu Studio / image / profils) ; refuse
  un `.gcode.3mf` dont les pièces ne sont pas à la position du manifeste (centres comparés à ± 0,01 mm).
- `fiche-impression.mjs` : `fiche.html` autonome (matière, jeu, coloris, cotes, orientation, supports, remarques,
  pièces, plateaux, contrôles ; aucune donnée client).
- **Plateau** : `ranger()` laisse une bande avant de 10 mm (`MARGE_AVANT`, ligne de chargement de la buse de la P2S) et
  essaie deux règles d'orientation (côté long selon X puis Y). Une pièce plus profonde que la surface utile (ex.
  `boite-rugged` aux cotes max) est posée seule à Y = 0 et marquée `hors_marge_avant` : surveiller la 1re couche.
- Un SHA de paiement antérieur à `tools/fabriquer.mjs` fait échouer le run avec ce motif.

## Image de tranchage (`fabrication/`)
- `fabrication/Dockerfile` : Ubuntu 24.04 épinglé par empreinte, paquets figés (`snapshot.ubuntu.com`), Bambu Studio
  **02.08.02.61** (AppImage extraite, sha256 vérifié), Node 22. Aucun affichage nécessaire. Image ≈ 1,8 Go.
- Profils P2S autonomes : `fabrication/profils/p2s/LISEZMOI.md`.
- **Reproductibilité** : Bambu Studio n'est déterministe que sur 1 cœur et sans ASLR : le lanceur
  `fabrication/bambu-studio` impose `taskset` + `setarch -R` ; le conteneur tourne avec
  `--security-opt seccomp=unconfined`, sans réseau. Le G-code est alors identique au bit près (PETG : l'ordre entre
  exemplaires identiques peut varier de quelques secondes, sans effet).
- **Empreinte** : `image-fabrication.yml` construit, publie sur GHCR et **vérifie** l'empreinte épinglée dans
  `fabrication.yml` (GitHub interdit à un workflow de modifier un fichier de workflow : en cas d'écart, le run échoue avec
  la ligne exacte à reporter dans la PR).
- Pas de vignette dans le `.gcode.3mf` (OpenGL indisponible sans écran) : pas d'aperçu sur l'écran de la machine.
- Construction locale :
  ```
  docker buildx build --provenance=false --build-arg SOURCE_DATE_EPOCH=0 \
    --output type=docker,name=evarysth-fabrication:local,rewrite-timestamp=true fabrication/
  node tools/generer-stl.mjs passe-cable --impression --sortie=sortie-stl/passe-cable
  node tools/trancher.mjs sortie-stl/passe-cable/passe-cable-a60-impression.json --docker=evarysth-fabrication:local --deux-fois
  ```
  Derrière un proxy TLS : `--network host --build-arg https_proxy=… --build-arg APT_URI=https://snapshot.ubuntu.com
  --secret id=ca,src=<CA du proxy>` (contenu de l'image inchangé).
- Ordre de grandeur : un article = 40 s à 1 min de bout en bout sur GitHub.

## Workflows
- `fabrication.yml` (`workflow_dispatch`) : un run par article ; entrées validées par motif ; case **Essai** = génération
  et tranchage sans rien envoyer ni exiger de secret (onglet Actions → « Fabrication » → Run workflow).
- `stl-standards.yml` (push sur `main` touchant catalogue, modèles, moteur, `tools/`) : pour chaque taille standard,
  `<produit>/<taille>.stl` (`.zip` si plusieurs pièces) dans R2, clé lue par le Worker (`segmentTaille`) ; aucune
  suppression en masse ; un écart de contrôle sur une taille n'empêche pas l'envoi des autres.
- `bareme.yml` : barème des prix (ci-dessous).

## Worker (`worker/src/fabrication.js`)
- Webhook payé → un `workflow_dispatch` par article ; SHA lu dans `version.json` (publié par `pages.yml`).
- `POST /fabrication/retour` : HMAC-SHA256 de `horodatage.corps`, temps constant, ± 5 min ; 401 mauvaise signature,
  409 SHA différent de celui de l'article, 404 article introuvable.
- Colonne `Génération` : `a_declencher` (GitHub n'a pas répondu ; la tâche planifiée réessaie toutes les 10 min,
  6 fois, puis `echec`), `en_cours`, `prete`, `echec` (+ `Motif génération`), `fabrication_non_configuree`.
- Sans `GH_ACTIONS_TOKEN` ou `FABRICATION_HMAC`, rien n'est déclenché et le Journal le note une fois par commande.
- /admin : ligne « Fichiers » sous chaque article (état, masse, temps, plateaux, SHA court ; liens signés 2 jours vers
  STL — archive `stl.zip` s'il y en a plusieurs —, 3MF, fichier tranché, fiche isolée par CSP `sandbox`) ;
  « Relancer la génération » (même SHA) et « Régénérer au SHA actuel » (case de confirmation) tant que l'article n'est
  pas envoyé ; « Valider et envoyer » refusé si les fichiers ne sont pas prêts (sauf lien STL saisi à la main) ;
  Tableau de bord : alerte par génération en échec ; Système : secrets, jeton GitHub, dernier run, voyant R2.

## Barème des prix (`assets/js/bareme.js`, généré)
- `tools/generer-bareme.mjs` tranche une grille de cotes par produit (min, défaut, max et milieux : 5 points par axe pour
  1 paramètre, 4 pour 2, 3 pour 3, aucun pas > 100 mm) et stocke cm³ de filament et temps (s) d'un exemplaire. ASA, PA12,
  PA-CF : profil PETG (estimation).
- Empreinte par produit (modèle, STL d'origine, moteur, fiche d'impression, bornes des cotes, jeu, profils, image) :
  le job `geometrie` échoue si le barème est périmé.
- Mise à jour : workflow `bareme.yml` sur la branche (refuse `main`), ou `node tools/generer-bareme.mjs <id>` avec Bambu
  Studio installé. Contrôle : `node tools/generer-bareme.mjs --verifier --tableau`.

## Réglages (comptes, secrets) et dépannage
Ne jamais coller une clé ou un secret dans une conversation ni dans le dépôt.

| Où | Nom | Rôle |
|---|---|---|
| Cloudflare R2 | bucket `evarysth-stl` | STL standards et fichiers de commande (accès public désactivé, pas de règle de conservation) |
| Secrets d'Actions GitHub | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | jeton R2 « Object Read & Write », ce seul bucket |
| Variable d'Actions GitHub | `R2_ACCOUNT_ID` | identifiant du compte Cloudflare (pas un secret) |
| Secret d'Actions + secret du Worker | `FABRICATION_HMAC` | même valeur des deux côtés (64 lettres et chiffres) : signe le rappel |
| Secret du Worker | `GH_ACTIONS_TOKEN` | jeton GitHub fine-grained (`virnichka/evarysth`, Actions : Read and write), expire au bout d'un an |
| `worker/wrangler.toml` | binding R2 `STL` | sans lui, `/fichier/` répond 503 |

- **Run « Fabrication » rouge « Fabrication non configurée : Manquant … »** : le message liste ce qui manque côté GitHub ;
  rien n'a été généré.
- **« Fichiers non générés (fabrication pas encore réglée) »** dans l'historique d'une commande : un secret du Worker manque.
- **Jeton GitHub expiré** : en créer un (github.com/settings/personal-access-tokens/new, mêmes droits) et remplacer
  `GH_ACTIONS_TOKEN` (Cloudflare → Workers & Pages → evarysth-checkout → Settings → Variables and Secrets).
- **`FABRICATION_HMAC` changé** : le changer aux deux endroits. Vérification : run `fabrication.yml` avec un n° fictif
  (`CF-2000-0000-1`) : rappel **404** = signature acceptée, **401** = valeurs différentes, **503** = secret absent du Worker.
