# Chaîne de fabrication (commande payée → fichier prêt à imprimer)

> **État (9 novembre 2026)** : **Fabrication · phase 2b faite en grande partie** : R2 branché au Worker, STL standards
> remplis par workflow, run réel dans R2 vérifié (voir § « Résultats Fabrication · phase 2b »). **Reste** : l'étape 6 du
> guide (secrets du Worker `GH_ACTIONS_TOKEN` et `FABRICATION_HMAC`, par le propriétaire) puis la commande test de bout
> en bout (critères d'acceptation de la phase 2 non encore tous contrôlés). Fabrication · phase 1a terminée (tranchage
> sans écran **oui** ; points machine B1 oui probable, B2 et B3 incertains).
> Prochaine étape : étape 6 + commande test, puis clôture de la phase 2b ; ensuite Fabrication · phase 3.
> Fabrication · phase 1b à l'achat de la machine.
> Chaque phase = une session, un commit, un compte rendu court, puis pause jusqu'au feu vert suivant.
> Chantier précédent (clos) : `docs/refonte-geometrie.md`. Circuit de commande actuel : README « Paiement et commandes ».

## Décisions prises (ne pas rediscuter)
- **Source géométrique unique** : modèles JS (`assets/js/modeles/`, `assets/js/geo.js`, manifold-3d) exécutés sous Node
  par `tools/generer-stl.mjs --impression` (pièces posées et rangées sur un plateau de 256 × 256 × 256 mm + manifeste JSON).
  Contrôles de géométrie obligatoires sur `main`, jeu par matière, fiches d'impression dans `data.js` : acquis.
- **Machine de l'atelier** : Bambu Lab **P2S avec AMS** (pas encore achetée). L'AMS sert au changement de coloris
  (mapping dans le fichier) et au relais en fin de bobine. Variante sans AMS prévue si le budget bloque : le manifeste
  garde toujours le mapping AMS, l'opérateur change la bobine à la main.
- **Réseau de la machine** : mode cloud Bambu conservé (appli Handy) ; l'agent lit l'état en **MQTT local, lecture
  seule**. Non confirmé sur le firmware actuel : premier point vérifié (phase 1), sur documentation avant l'achat.
- **Trancheur** : **Bambu Studio en ligne de commande**, dans une **image Docker figée** (version de Bambu Studio et
  empreinte `sha256` de l'image épinglées, profils versionnés dans le dépôt). Repli si la phase 1 échoue : OrcaSlicer.
- **Lieu du tranchage** : **GitHub Actions** (dépôt public, minutes gratuites), déclenché par le Worker. La même image
  tourne sur le mini-PC de l'atelier en secours.
- **Journaux publics acceptés, sous trois conditions** :
  - entrées du workflow et journaux limités à : n° CF, id produit, cotes, coloris, SHA (jamais nom, adresse, e-mail,
    n° EV, montant) ;
  - **aucun « artifact » d'Actions** : les fichiers vont directement dans R2 ;
  - identifiants R2 = secrets d'Actions, jeton R2 limité au seul bucket.
- **Jeton GitHub du Worker** : fine-grained, ce seul dépôt, « Actions : écriture » uniquement ; il expire → alerte
  d'expiration dans l'onglet Système de /admin.
- **Moment** : génération + tranchage **dès le paiement** (webhook Stripe) ; envoi au fabricant **seulement à la
  validation** dans /admin (« rien ne part sans validation » inchangé).
  - Idempotence : clé = **n° CF + SHA** ; un webhook reçu deux fois ne relance rien.
  - Fichiers **figés au SHA du paiement** : un modèle modifié entre paiement et validation ne change rien ; une
    régénération au SHA courant passe par une action explicite dans /admin (tracée dans l'Historique).
  - Statuts visibles dans /admin : génération en cours / prête / en échec (motif), bouton « Relancer la génération ».
- **Matières** : la chaîne gère les 5 matières (jeu, densité, €/kg) ; l'atelier n'a de profils que **PLA et PETG** ;
  les autres partent chez un fabricant externe (STL + 3MF non tranché + fiche d'impression). Décision catalogue
  (ASA, PA-CF, PA12) ouverte ; les produits balcon en ASA sont vendus « tient dehors » : passer en PETG changerait
  cette promesse.
- **Prix sur-mesure** : calculé depuis masse et temps estimés, lus dans un **barème par produit** produit par la CI
  (tranchage d'une grille de cotes) et interpolé. **Un seul fichier** (`assets/js/bareme.js`), lu par le site (prix en
  direct au curseur) et par le Worker (prix payé), comme `data.js`. Formule et valeurs : § « Prix sur-mesure ».
- **Ordre des phases** : faisabilité d'abord ; si le tranchage sans écran ou le MQTT en mode cloud échoue, on revoit
  l'architecture (OrcaSlicer, mode LAN) avant d'écrire le reste. Puis R2 + déclenchement, /admin, agent, prix.

## Architecture cible
```
 Client ── fiche produit (data.js + bareme.js : prix en direct)
   │  panier : produit, taille | cotes, coloris, quantité
   ▼
 Worker evarysth-checkout ── priceFor (mêmes data.js + bareme.js) ── SHA du site (version.json) → metadata Stripe
   │                                                               ▼
   │                                                        Stripe Checkout
   ▼  webhook payé (idempotent)
 Sheet (Commandes EV / CF : Génération, SHA, Masse, Temps, Plateaux)
   │  workflow_dispatch fabrication.yml { cf, produit, cotes, coloris, quantite, sha }   (jeton Actions:écriture)
   ▼
 GitHub Actions ── image ghcr.io/…/evarysth-fabrication@sha256:… (Bambu Studio CLI + Node + profils)
   │  checkout du SHA → generer-stl --impression --quantite → trancher.mjs (si matière atelier)
   │  → R2 commandes/<CF>/<SHA>/ : manifeste.json, *.stl, plateau-<n>.3mf (non tranché),
   │                               plateau-<n>.gcode.3mf (PLA/PETG), fiche.html
   │  POST /fabrication/retour (HMAC) { cf, sha, statut, masse, temps, plateaux, motif }
   ▼
 /admin (Access) ── génération prête ? → « Valider et envoyer »
   ├── fabricant externe : e-mail, liens signés /fichier/<jeton> → STL, 3MF, fiche (R2)
   └── fabricant « atelier » : travail mis en file (Sheet)
                                   ▲  sortant uniquement (aucun port ouvert)
 Agent d'atelier (mini-PC) ── GET /atelier/travaux · GET fichier · POST /atelier/etat (jeton)
   ├── adaptateur manuel     : affiche le travail, l'opérateur déclare imprimé / échec
   ├── adaptateur bambu-mqtt : dépose le .gcode.3mf sur la machine (si permis), lit l'état MQTT local (lecture seule)
   └── adaptateur moonraker  : réservé (machine Klipper), non développé
   P2S + AMS : lancement MANUEL à l'écran ; agent → /admin : en impression, terminé, échec ; bobines chargées
```

Clés R2 (bucket unique `evarysth-stl`, déjà prévu dans `wrangler.toml`) :
- `<produit>/<taille>.stl` : STL standards (clés existantes du Worker, `fichier.js`) ;
- `commandes/<CF>/<SHA court>/…` : fichiers d'un article. Règle de cycle de vie : 24 mois (valeur choisie, à confirmer).

Manifeste par article (`manifeste.json`, étend celui de `generer-stl`) : n° CF, produit, cotes, taille, coloris
(id + hex), quantité, matière, jeu, SHA, versions (Node, manifold-3d, Bambu Studio, empreinte de l'image, profils),
plateaux (pièces, positions, masse g, temps min, filament, **mapping AMS** : coloris → emplacement conseillé),
contrôles, statut.

## Prix sur-mesure
- `cout = masse_kg × €/kg(matière) + temps_h × €/h machine + forfait`
- `prix = arrondi à l'euro supérieur de ((cout × coefficient + 0,25) / (1 − 0,015))` (frais Stripe ≈ 1,5 % + 0,25 €)
- **Plancher** : prix de la taille standard la plus proche (distance des cotes normalisée par les bornes).
- **Plafond** par produit (`custom.plafond` dans `data.js`) : prix affiché = min(formule, plafond) ; au-delà, l'article
  est marqué « prix plafonné » dans /admin (alerte). *Interprétation choisie, à confirmer.*
- Valeurs de départ (acceptées) : PLA 25 €/kg, PETG 25, ASA 30, PA12 60, PA-CF 70 ; machine 1,5 €/h ; forfait 3 € ;
  coefficient 2,5. Rangées dans `data.js` (`EVARYSTH.tarif`, `densite` et `eurKg` par matière) : changer un tarif ne
  demande pas de retrancher.
- Barème (`assets/js/bareme.js`, généré, jamais édité à la main) : par produit, grille de cotes (au moins min / défaut /
  max par paramètre) → masse (g) et temps (min) tranchés ; interpolation multilinéaire ; empreinte des entrées (modèle,
  `geo.js`, profils, image) pour détecter un barème périmé. Matières hors atelier : profil générique de la même famille,
  seulement pour estimer.
- Prix standards : inchangés (fixés à la main) ; la CI signale (avertissement) un prix standard sous le coût formule.

## Phases

### Phase 1 — essai de faisabilité (aucun développement du circuit)
- **1a (sans machine)** :
  - image Docker avec Bambu Studio CLI (version épinglée, AppImage extraite, `xvfb-run` si un affichage est exigé) ;
  - profils P2S autonomes (machine, process 0,20 mm, filament PLA générique), sans héritage vers les profils système ;
  - tranche le `--impression` de 2 produits : un simple (ex. `crochet-balcon`) et un en plusieurs pièces (`passe-cable`),
    sort masse, temps et `.gcode.3mf` par plateau ; positions du plateau respectées (pas de réarrangement) ;
  - recherche documentaire (firmware P2S actuel, retours communauté) : MQTT local en lecture seule en mode cloud ;
    dépôt d'un fichier sur la machine (FTPS local) en mode cloud ; choix des emplacements AMS à l'écran pour un fichier
    lancé depuis la machine. Sources citées, verdict oui / non / incertain par point.
- **1b (machine achetée)** : imprimer le `.gcode.3mf` depuis l'écran de la P2S, lire l'état en MQTT local en mode cloud
  (script jetable), noter les champs utiles (état, progression, couche, erreur, AMS).
- Fichiers : `fabrication/Dockerfile`, `fabrication/profils/p2s/` (+ `LISEZMOI.md` : version Bambu Studio, origine des
  profils), `tools/trancher.mjs`, `fabrication/essais/` (scripts jetables : MQTT), `docs/chaine-fabrication.md` (résultats).
- Résultat : verdict go / no-go par point, avec les commandes exactes ; décision d'achat éclairée.
- Acceptation :
  - `docker build` reproductible ; deux tranchages du même STL → masse et temps identiques, G-code identique hors
    lignes d'horodatage ;
  - `.gcode.3mf` ouvert sans erreur par Bambu Studio (interface) avec plateau P2S, bonne position des pièces ;
  - temps de tranchage noté (cible < 2 min par plateau sur un runner GitHub) ; taille de l'image notée ;
  - 1b : impression réussie depuis l'écran, état MQTT lu sans aucune commande envoyée.
- Échec → note dans ce document et proposition de repli (OrcaSlicer CLI, mode LAN + mode développeur) avant la phase 2.
- **Toi** : 1a rien ; **avant l'achat**, lire le verdict documentaire ; 1b acheter la P2S + AMS (ou sans AMS), compte
  Bambu, Wi-Fi, relever le code d'accès LAN et le n° de série, une bobine PLA.

#### Résultats Fabrication · phase 1a (9 novembre 2026, sans machine)
**Verdicts**
| Point | Verdict | Preuve |
|---|---|---|
| A. Tranchage automatique, sans écran, reproductible, fichier P2S | **oui** | 2 produits tranchés en ligne de commande dans l'image ; masse, temps et G-code identiques au bit près (2 passes × 2 images) ; `printer_model = Bambu Lab P2S`, `printer_model_id = N7`, positions à ± 0,01 mm |
| B1. MQTT local en lecture seule, machine en mode cloud | **oui (probable)** | Bambu : l'état poussé en MQTT n'est pas soumis à autorisation ; 2 sources P2S en mode cloud lisent le MQTT local (code d'accès LAN) ; 1 source contraire non argumentée |
| B2. Dépôt d'un fichier sur la machine (FTPS local), mode cloud | **incertain** | FTPS joignable en mode cloud (sources P2S), mais sur P2S / H2 il n'écrit que sur la **clé USB** (sans clé : refus 553) ; écriture en mode cloud non documentée |
| B3. Choix des emplacements AMS à l'écran pour un fichier lancé depuis la machine | **incertain** | P1 : correspondance automatique couleur ↔ emplacement, sans choix ; H2C (même génération d'interface) : page « Suivant » de choix filament à l'écran ; rien de publié pour la P2S |

**Image** (`fabrication/Dockerfile`) : Ubuntu 24.04 épinglé par empreinte, paquets figés (`snapshot.ubuntu.com`,
instantané `20261101T000000Z`), Bambu Studio **02.08.02.61** (release publique du 21/08/2026 ; la 2.9.1 du 03/11/2026
a moins de 2 semaines) en AppImage extraite, sha256 vérifié, Node 22.21.1 (sha256 vérifié).
- Reproductible : deux constructions sans cache → **même manifeste linux/amd64**
  `sha256:3424d0816d8addc119ae195180358a654ac79d34ab01cb5e7a3a212d61fdd954` (couches identiques fichier par fichier ;
  seule l'attestation de provenance, horodatée, différait ; avec `--provenance=false`, l'ID d'image est ce manifeste).
  Il a fallu vider `machine-id` et les caches fontconfig.
- Taille : **1,84 Go** décompressée (1 843 817 481 octets), ~478 Mo de couches compressées. Construction : 2 min 10 à
  2 min 30 sans cache (4 vCPU).
- **Aucun affichage nécessaire** : la CLI tranche sans écran ; `xvfb-run` retiré (la GLFW embarquée ne connaît que Wayland).
- Ajout dans l'image : `machine_full/Bambu Lab P2S.json` (copie du descripteur livré), lu par la CLI pour écrire
  `printer_model_id = N7` dans le `.gcode.3mf` (dossier généré chez Bambu, absent de l'AppImage).

**Reproductibilité du tranchage** : Bambu Studio n'est **pas déterministe** par défaut (temps estimé ± 3 s, quelques
ralentissements de surplomb et déplacements déplacés). Déterministe **seulement sur 1 cœur et sans ASLR** : le lanceur
`fabrication/bambu-studio` impose `taskset` + `setarch -R` ; le conteneur doit tourner avec
`--security-opt seccomp=unconfined` (sinon arrêt explicite, code 70), sans réseau. Coût : ~× 2,5 sur le temps de tranchage.
Le G-code est alors identique au bit près ; l'archive `.gcode.3mf` ne l'est pas (dates zip, UUID de
`model_settings.config`) : sans effet, la clé d'idempotence reste n° CF + SHA.

**Mesures** (`tools/trancher.mjs --deux-fois`, profils P2S 0,4 / 0,20 mm / PLA générique, 1 plateau chacun) :
| Produit (cotes) | Pièces | Masse | Temps estimé | Tranchage (conteneur compris) |
|---|---|---|---|---|
| `crochet-balcon` (a = 42) | 1 | 13,67 g | 29 min (1 737 s) | 1,3 à 1,4 s |
| `crochet-balcon` (a = 100, max) | 1 | 17,47 g | 35 min | 1,4 à 1,5 s |
| `passe-cable` (a = 60) | 2 (bague + couvercle) | 18,44 g | 42 min (2 524 s) | 4,6 à 4,9 s |
| `passe-cable` (a = 100, max) | 2 | 38,05 g | 1 h 11 | 7,0 à 7,3 s |
Cible < 2 min par plateau : tenue avec une marge × 16 (mesuré dans la session, 4 vCPU comparables à un runner
standard ; la mesure sur runner viendra avec `fabrication.yml` en phase 2). `crochet-balcon` est en ASA au catalogue :
tranché ici en PLA (seul profil de l'essai), masse indicative.

**Contrôle du `.gcode.3mf`** (automatique dans `trancher.mjs`) : entrées 3MF attendues présentes (`3D/3dmodel.model`,
`Metadata/plate_1.gcode` + `.md5` cohérent, `plate_1.json`, `slice_info.config`, `project_settings.config`) ; en-tête
G-code `; printer_model = Bambu Lab P2S` ; `printer_model_id = N7` ; plateau « Textured PEI Plate » ; boîte de chaque
pièce dans `plate_1.json` = position du manifeste de `generer-stl` (± 0,01 mm, aucun réarrangement).
Contrôle visuel facultatif (propriétaire, Bambu Studio ≥ 2.8.2 sur ordinateur) : Fichier › Ouvrir un projet › le
`.gcode.3mf` ; vérifier imprimante P2S, plateau texturé PEI, pièces dans le coin avant gauche aux positions du manifeste,
onglet Aperçu : trajectoires présentes, 42 min / 18,44 g pour `passe-cable`.

**Points d'attention pour la suite** (aucun ne bloque) :
- **Pas de vignette** (`plate_1.png`) : OpenGL indisponible sans écran (GLEW échoue en contexte OSMesa, même sous un
  compositeur Wayland sans écran). Effet attendu : pas d'aperçu sur l'écran de la P2S (à confirmer en 1b). Piste : vignette
  produite par nos outils et ajoutée à l'archive.
- **Ligne de chargement de la buse** (G-code de démarrage P2S) : X 100 → 140 à Y ≈ −0,2, au ras du bord avant ; `ranger()`
  pose les pièces dès Y = 0. Prévoir une marge avant sur le plateau (phase 2, réglage de `ranger()`).
- Profils : `from: system` et `curr_bed_type` ajoutés (voir `fabrication/profils/p2s/LISEZMOI.md`) ; couleur du filament
  par défaut (`#00AE42`) tant que le coloris n'est pas passé (phase 2) ; profil PETG à ajouter de la même façon.

**Commandes exactes**
```
docker buildx build --provenance=false --build-arg SOURCE_DATE_EPOCH=0 \
  --output type=docker,name=evarysth-fabrication:p1a,rewrite-timestamp=true fabrication/
node tools/generer-stl.mjs passe-cable --impression --sortie=sortie-stl/passe-cable
node tools/trancher.mjs sortie-stl/passe-cable/passe-cable-a60-impression.json --docker=evarysth-fabrication:p1a --deux-fois
# profils (seulement en changeant de version de Bambu Studio) :
docker run --rm -u "$(id -u)" -v "$PWD:/travail" evarysth-fabrication:p1a \
  node fabrication/aplatir-profils.mjs /opt/bambu-studio/resources/profiles/BBL
```
Session derrière un proxy TLS : ajouter `--network host --build-arg https_proxy=… --build-arg
APT_URI=https://snapshot.ubuntu.com --secret id=ca,src=<CA du proxy>` (contenu de l'image inchangé). Le workflow
GitHub Actions de secours n'a pas été nécessaire (Docker et téléchargements fonctionnaient).

**Recherche documentaire (question B)** — firmware P2S actuel : **01.03.00.00** (page officielle : 12/10/2026 ; un
traqueur tiers indique le 21/09/2026) ; historique : 01.02.00.00 (09/04/2026), 01.01.03.00 (09/02/2026). Aucune note de
version P2S consultée ne touche au réseau, au MQTT ou au FTPS. Wiki Bambu et page officielle des firmwares
inaccessibles d'ici (402 / 403) : dates relevées via moteur de recherche.
- [Bambu Lab, « Firmware Update Introducing New Authorization Control System »](https://blog.bambulab.com/firmware-update-introducing-new-authorization-control-system-2/)
  (16/01/2025, mis à jour le 20/01/2025) : soumis à autorisation : lancer une impression (LAN ou cloud), commandes de
  mouvement / température / AMS, mises à jour ; **non soumis** : « l'envoi d'informations d'état (push MQTT pour Home
  Assistant) », l'impression depuis la carte SD. Tous les modèles futurs intègrent ce contrôle.
- [Printer Tools, connecter une P2S en LAN en gardant Bambu Handy](https://printertools.app/blog/guides/connect-bambu-lab-p2s-lan)
  (10/08/2026) : P2S en mode normal (cloud), sans mode LAN seul ni mode développeur : MQTT local TLS (état, progression,
  couche, températures, alertes HMS, AMS), parcours FTPS, caméra ; commandes de mouvement : mode LAN + développeur exigés.
- [bambuddy #36](https://github.com/maziggy/bambuddy/issues/36) (30/12/2025) : utilisateur P2S en mode cloud (Handy) :
  MQTT et FTPS accessibles sans mode LAN seul.
- [BambuHelper](https://github.com/Keralots/BambuHelper) (README consulté le 09/11/2026) : classe la P2S « cloud seulement »
  pour son boîtier ESP32, sans explication : seule source contraire pour B1.
- [OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI) (`mqtt.md`, `ftp.md`) : MQTT local `{IP}:8883` TLS, utilisateur
  `bblp`, mot de passe = code d'accès LAN ; FTPS implicite `{IP}:990`, mêmes identifiants.
- [bambuddy #2762](https://github.com/maziggy/bambuddy/issues/2762) (04/08/2026 ; essais sur 2 P2S en 01.03.00.00 le
  27/10/2026, mode LAN + développeur) : sur H2 et P2S, le FTPS n'expose que le stockage externe ; sans clé USB, tout envoi
  échoue (553) ; Bambu Studio écrit dans la mémoire interne par un tunnel propriétaire (port 6000), non documenté.
- [FAQ H2S](https://bambulab.com/en-us/h2s/faq) (consultée le 09/11/2026) : sans clé USB, « l'impression ne peut pas
  être lancée par le LAN ».
- [Wiki Bambu, AMS multicolore (série P1)](https://wiki.bambulab.com/en/p1/manual/connect-AMS-multi-color-printing) :
  relancé depuis l'écran, un fichier envoyé en LAN voit ses couleurs associées automatiquement aux emplacements.
- [Forum Bambu, H2C, choix filament ↔ buse](https://forum.bambulab.com/t/manual-mapping-for-filament-to-hotend-allocation/241156)
  (13/03/2026) : au lancement depuis l'écran, page « Suivant » où l'on choisit buse / filament ; choix non mémorisé.

**Replis si 1b infirme un point** (aucun n'est appliqué maintenant) :
- B1 non → **mode LAN seul + mode développeur** : MQTT local complet, mais plus de cloud ni de Bambu Handy (suivi à
  distance par /admin seulement), mode non pris en charge par Bambu ; réglage à refaire après certaines mises à jour.
- B2 non ou incertain → **clé USB laissée dans la P2S** et dépôt FTPS dessus (à tester en 1b, mode cloud) ; sinon
  adaptateur **manuel** : l'opérateur télécharge le `.gcode.3mf` depuis /admin et le copie sur la clé (une manipulation
  par travail) ; le mode LAN + développeur ne lève pas la contrainte de la clé USB.
- B3 non → **correspondance automatique** : le fichier porte le type et la couleur du coloris (manifeste) ; l'opérateur
  charge la bobine indiquée, la machine associe ; ou variante sans AMS (bobine changée à la main, déjà prévue). Lancer
  par MQTT avec `ams_mapping` exigerait le mode LAN + développeur et contredirait le lancement manuel à l'écran : à
  éviter.
- A aurait échoué → OrcaSlicer en ligne de commande (repli prévu) : sans objet.

**Recommandation** : passer à **Fabrication · phase 2**. Le tranchage (seule condition bloquante pour R2 et la
génération) est acquis ; B1, B2 et B3 ne concernent que l'agent d'atelier (phase 4) et se confirment en
Fabrication · phase 1b, machine en main, avant la phase 4.

### Phase 2 — R2 + génération déclenchée au paiement
- Image publiée sur GHCR par `.github/workflows/image-fabrication.yml` (sur changement de `fabrication/**`), empreinte
  reportée dans `fabrication.yml`.
- `.github/workflows/fabrication.yml` (`workflow_dispatch`, entrées limitées : cf, produit, cotes, coloris, quantité,
  sha) : checkout du SHA, `generer-stl --impression --quantite=n`, tranchage si matière atelier, 3MF non tranché,
  `fiche.html`, envoi dans R2 (S3, jeton limité au bucket), rappel `POST /fabrication/retour` signé HMAC. Aucun artifact.
  Idempotent : `manifeste.json` présent pour CF + SHA → sortie sans rien refaire. `concurrency` par n° CF.
- `pages.yml` publie `version.json` (SHA du site) ; le Worker le lit à la création du paiement → metadata Stripe.
- Worker : binding R2 `STL` activé ; webhook payé → `workflow_dispatch` par article ; route `/fabrication/retour` ;
  colonnes Sheet `Génération`, `SHA`, `Masse g`, `Temps min`, `Plateaux`, `Motif génération` ; échec de dispatch rejoué
  par la tâche planifiée. Même workflow pour les STL standards (push sur `main`), qui remplit `<produit>/<taille>.stl`.
- Fichiers : `tools/generer-stl.mjs` (`--quantite`, manifeste enrichi), `tools/trancher.mjs`, `tools/fiche-impression.mjs`,
  `.github/workflows/{fabrication,image-fabrication,pages}.yml`, `worker/wrangler.toml`, `worker/src/{index,sheet,planifie,fabrication}.js`
  (`fabrication.js` nouveau), tests `worker/test/`, `tools/test/`.
- Acceptation : commande test payée → fichiers dans R2 en < 10 min et Sheet à « prete » ; webhook rejoué → aucun second
  run ; journal du run sans donnée client ; aucun artifact ; mauvaise signature sur `/fabrication/retour` → 401 ;
  `cd worker && node --test` et `cd tools && node --test` verts.
- **Toi** : moyen de paiement sur le compte Cloudflare ; `npx wrangler r2 bucket create evarysth-stl` ; jeton R2 (lecture
  + écriture, ce seul bucket) → secrets d'Actions `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (+ variable `R2_ACCOUNT_ID`) ;
  jeton GitHub fine-grained (ce dépôt, Actions : écriture, expiration 1 an) → secret Worker `GH_ACTIONS_TOKEN` ;
  secret partagé `FABRICATION_HMAC` (Worker + Actions) ; colonnes ajoutées au Sheet (`Commandes CF`).

#### Résultats Fabrication · phase 2a (9 novembre 2026, code éteint en production)
**Prêt** (rien ne change pour les clients tant que les réglages ne sont pas faits) :
- Outils : `ranger()` laisse une **bande avant de 10 mm** (`MARGE_AVANT`) ; `generer-stl --quantite=n --coloris --cf --3mf`
  (exemplaires sur plusieurs plateaux, 3MF non tranché par plateau, manifeste enrichi : n° d'article, coloris id + hex,
  quantité, pièces et orientations, versions Node / manifold-3d) ; `trancher.mjs` choisit le profil par matière (PLA,
  PETG ; autre matière : code 3, fabricant externe), passe la **couleur du coloris** (`filament_colour`, contrôlée dans
  `slice_info.config`) et complète le manifeste (masse, temps, filament, **mapping AMS** : filament 1 → coloris,
  emplacement conseillé A1, versions Bambu Studio / image / profils) ; `tools/fiche-impression.mjs` (fiche.html autonome :
  matière, jeu, coloris, cotes, orientation, supports, remarques, pièces, plateaux, contrôles ; aucune donnée client) ;
  `tools/fabriquer.mjs` enchaîne le tout dans un dossier prêt pour R2 + `bilan.json` (rappel). Profil
  `filament-petg.json` (même méthode que le PLA ; les 3 autres profils ressortent identiques à l'octet).
- Workflows : `fabrication.yml` (`workflow_dispatch`, entrées cf, produit, cotes, coloris, quantité, sha + `essai` ;
  entrées validées par motif ; idempotent : `manifeste.json` présent → sortie immédiate et rappel renvoyé ; `concurrency`
  par n° ; aucun artifact ; journal sans donnée client ; échec net si les secrets R2 / HMAC manquent ; rappel signé HMAC,
  y compris en cas d'échec avec motif) ; `image-fabrication.yml` (construction reproductible, publication GHCR,
  vérification de l'empreinte épinglée) ; `pages.yml` publie `version.json`. Actions épinglées par SHA ; aucun de ces
  workflows n'est un contrôle obligatoire.
- Worker (`worker/src/fabrication.js`) : SHA de `version.json` dans les metadata Stripe (`sha`, absent si le site ne répond
  pas : paiement inchangé) ; webhook payé → un `workflow_dispatch` par article ; `POST /fabrication/retour` (HMAC-SHA256
  de `horodatage.corps`, temps constant, ± 5 min, 401 sinon ; 409 si le SHA diffère de celui de l'article) ; colonnes
  `Génération` (`en_cours`, `a_declencher`, `prete`, `echec`), `SHA`, `Masse g`, `Temps min`, `Plateaux`,
  `Motif génération`, lues et écrites par leur nom, ignorées si absentes ; tâche planifiée : nouvel essai des
  `a_declencher` (6 déclenchements au plus, puis `echec`).

**Éteint en attendant les réglages** : binding R2 commenté dans `wrangler.toml` ; sans `GH_ACTIONS_TOKEN` ou
`FABRICATION_HMAC`, le Worker ne déclenche rien et note « fabrication_non_configuree » au Journal (une fois par
commande, libellé « Fichiers non générés (fabrication pas encore réglée) » dans /admin) ; sans secrets R2, un run non
essai échoue avec la liste de ce qui manque ; sans colonnes, rien n'est écrit.

**Écarts et choix** (à valider) :
- **N° d'article `CF-AAAA-NNNN-<n° d'article>`** passé au workflow (entrée `cf`), et non le n° CF fournisseur : au paiement
  le n° CF n'existe pas encore (attribué au choix du fabricant, il change si le fabricant change). Même information que
  le n° CF (n° de commande + suffixe), aucune donnée client ; suffixe en chiffres, sans confusion avec la lettre du n° CF.
  Clés R2 : `commandes/<n° d'article>/<SHA court 12>/`.
- **Empreinte de l'image** : GitHub interdit à un workflow de modifier un fichier de workflow avec `GITHUB_TOKEN`.
  L'empreinte est donc calculée avant la fusion (construction reproductible, en local) et inscrite dans la PR ;
  `image-fabrication.yml` publie l'image et **vérifie** l'égalité (écart → échec avec la ligne exacte à reporter).
- **Entrée `essai`** ajoutée (génération + tranchage, rien d'envoyé, aucun secret requis), pour éprouver le workflow.
- **Grandes pièces** : `boite-rugged` aux cotes max (252,8 × 253,8 mm) ne tient pas avec la bande avant de 10 mm. Plutôt
  que réduire ses bornes (changement visible des clients), une pièce plus profonde que la surface utile est posée **seule
  à Y = 0** et marquée `hors_marge_avant` (manifeste, fiche, avertissement). **Décision du propriétaire (9 novembre 2026)** : bornes
  inchangées, la 1re couche de ces plateaux est surveillée (ligne de chargement au ras de la pièce). `ranger()` essaie aussi deux règles d'orientation (côté long selon X, puis Y) et garde
  la moins gourmande : `boite-rugged` (défaut) et `organiseur-tiroir` gardent leurs plateaux déclarés malgré la marge.
- **Contrôle de position** du `.gcode.3mf` : compare désormais les centres (une base chanfreinée donne une 1re couche
  plus petite, sans déplacement : faux positif vu sur `equerre-l`).
- **PETG** : avec plusieurs exemplaires identiques sur un plateau, l'ordre d'impression entre objets varie parfois d'un
  tranchage à l'autre (temps ± 11 s sur 52 min, masse identique) ; PLA identique au bit près. Sans effet (idempotence
  par n° + SHA).
- **Non fait en 2a** : remplissage de `<produit>/<taille>.stl` sur push de `main` ; fait en 2b (`stl-standards.yml`).
- Un SHA de paiement antérieur à cette phase n'a pas `tools/fabriquer.mjs` : le run échoue avec ce motif.

**Temps mesurés** (session, 4 vCPU, image locale) : `fabriquer.mjs` passe-cable a = 60 × 3 (1 plateau, 6 pièces) :
20 s dont tranchage 19 s ; 1 exemplaire : tranchage 6,5 s ; `equerre-l` × 2 (PETG) : 1,4 s ; image : 1,84 Go, construite
en 3 min 35 sans cache.

**Runs sur GitHub** (9 novembre 2026, `ubuntu-latest`, entrée `essai`, rien d'envoyé) :
| Run | Article | Résultat | Image tirée | Génération + tranchage | Job | De bout en bout |
|---|---|---|---|---|---|---|
| [42638437376](https://github.com/virnichka/evarysth/actions/runs/42638437376) | `passe-cable` a = 60, Bleu nuit, × 3 (PLA, 6 pièces, 1 plateau) | 55,33 g, 1 h 47 (identiques au tranchage local) | ~20 s | 0,8 s + 17,7 s | 44 s | **58 s** |
| [42638442693](https://github.com/virnichka/evarysth/actions/runs/42638442693) | `equerre-l` 100 × 100 × 20, × 2 (PETG) | prête | ~20 s | ~3 s | 32 s | **38 s** |
Cible « fichiers dans R2 en < 10 min » : large marge (envoi R2 et rappel non mesurés, sans secrets). Run non essai sans
secrets : échec net à l'étape « Configuration R2 et rappel » (« Fabrication non configurée : Manquant … »), rien généré.

**Image publiée** : `image-fabrication.yml` construit et publie (≈ 3 min). Le 1er run a révélé un défaut hérité de la
phase 1a : sans proxy, `snapshot.ubuntu.com` redirige vers HTTPS et l'image de base n'a pas de certificats ; corrigé en
prêtant le bundle CA du runner en secret de construction (contenu inchangé). L'empreinte obtenue sur GitHub
(`sha256:b1fe84f8…`) diffère de la construction locale (`sha256:dbb8b63d…`, exportateur `docker` contre registre) :
celle de GitHub est épinglée dans `fabrication.yml` ; une reconstruction sur GitHub redonne la même (vérifié : 2e construction,
run 42639135218, même empreinte).

#### Résultats Fabrication · phase 2b (9 novembre 2026)
**Réglages du propriétaire vus depuis GitHub** (aucun secret lu) : R2 actif, bucket `evarysth-stl` (Standard, WEUR, accès
public désactivé, **aucune règle de conservation** pour l'instant : les 24 mois restent une proposition), secrets
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `FABRICATION_HMAC` et variable `R2_ACCOUNT_ID` présents et acceptés.

**Run réel dans R2** (`fabrication.yml`, sans `essai`, article fictif `CF-2000-0000-1`, `passe-cable` a = 60, SHA de `main`
`4488183`) : [run 42653573878](https://github.com/virnichka/evarysth/actions/runs/42653573878), 42 s de bout en bout
(génération 0,6 s, tranchage 6 s, 18,44 g, 42 min, 1 plateau). Envoyé : `commandes/CF-2000-0000-1/448818330ea9/`
(6 fichiers : manifeste, fiche, 2 STL, 3MF, `.gcode.3mf`). Rappel au Worker : **503 « Fabrication non configurée »** =
attendu, l'étape 6 n'est pas faite (le run est donc rouge à cette seule étape). Preuve de l'égalité de `FABRICATION_HMAC`
des deux côtés : pas encore (404 attendu une fois l'étape 6 faite, 401 = valeurs différentes).

**Activé** : binding R2 `STL` décommenté dans `worker/wrangler.toml` (déployé par `worker.yml` à la fusion).

**STL standards** : `tools/stl-standards.mjs` + `.github/workflows/stl-standards.yml` (push sur `main` touchant le
catalogue, un modèle, le moteur, `tools/` ou le workflow ; ou à la main). Pour chaque taille standard de `data.js` :
`generer-stl --impression` (mêmes contrôles), **1 pièce → `<produit>/<taille>.stl`, plusieurs → `.zip`** des pièces,
taille écrite comme le Worker la lit (`segmentTaille`). 48 fichiers (16 produits × 3 tailles, 72 Mo) en 27 s en local.
Aucune suppression en masse (le bucket contient aussi `commandes/`) ; un `.stl` devenu `.zip` (ou l'inverse) retire
l'ancienne clé. Un écart de contrôle sur une taille n'empêche pas l'envoi des autres, le run échoue à la fin. Test :
`tools/test/standards.test.mjs` (clés uniques et lisibles par le Worker).

**Image** : l'empreinte reproductible est confirmée (deux constructions sur GitHub, même empreinte `sha256:b1fe84f8…`,
run 42639135218 pour la seconde) ; il n'y avait plus de « à confirmer » à retirer dans la doc.

**Reste à faire pour clore la phase 2** (propriétaire, guide étape 6, puis commande test) : acceptation = fichiers dans R2
en < 10 min et Sheet à « prete » ; webhook rejoué → aucun second run ; journal sans donnée client ; aucun artifact ;
mauvaise signature sur `/fabrication/retour` → 401 ; tests `worker` et `tools` verts (119 et 237 : verts à la fusion).

### Phase 3 — /admin : génération, validation, envoi des fichiers
- Fiche commande : statut de génération (en cours / prête / échec + motif), masse, temps, plateaux, liens des fichiers,
  « Relancer la génération » (même SHA) et « Régénérer au SHA actuel » (explicite, case de confirmation, Historique).
  « Valider et envoyer » refusé tant que la génération n'est pas prête (sauf lien STL saisi à la main, comme aujourd'hui).
- E-mail fabricant externe : liens signés vers STL, 3MF non tranché, fiche (fini le lien STL à coller pour un sur-mesure).
- Fabricant « atelier » (colonne `Envoi` = `atelier`, matières PLA/PETG) : proposé seulement si la matière a un profil.
- Onglet Système : expiration du jeton GitHub (en-tête `github-authentication-token-expiration`, alerte à J-30),
  dernier run de fabrication, voyant R2. Tableau de bord : générations en échec, prix plafonnés (phase 5).
- Fichiers : `worker/src/{admin,fournisseur,email,fichier,jeton,fabrication}.js`, tests.
- Acceptation : parcours complet en mode test (paiement → prête → validation → e-mail avec 3 liens valides 14 jours) ;
  échec simulé → motif affiché, relance OK ; atelier refusé pour un article en ASA ; tests verts.
- **Toi** : ligne « Atelier » dans l'onglet `Fabricants` du Sheet ; sinon rien.

### Phase 4 — agent d'atelier
- Programme Node sans dépendance lourde (`atelier/agent/`), service systemd ; interroge le Worker toutes les 30 s
  (sortant uniquement) ; adaptateurs `manuel`, `bambu-mqtt` (lecture seule ; dépôt du fichier sur la machine si la phase
  1 l'a validé), `moonraker` (interface seule) ; configuration locale hors dépôt (IP, n° de série, code d'accès).
- Worker : routes `/atelier/travaux`, `/atelier/fichier/<id>`, `/atelier/etat` (jeton `ATELIER_TOKEN`, temps constant) ;
  statuts Sheet en impression / imprimé / échec ; /admin affiche la file atelier triée par coloris chargé dans l'AMS
  (bobines lues par MQTT) et prévient si le coloris manque (« changer de bobine » sans AMS).
- Fichiers : `atelier/agent/**`, `atelier/LISEZMOI.md`, `worker/src/{atelier,admin,sheet}.js`, tests (MQTT simulé par
  messages enregistrés en phase 1b).
- Acceptation : travail validé visible sur l'agent en < 1 min ; impression lancée à la main → /admin passe « en
  impression » puis « imprimé » ; aucun message MQTT de commande émis (test) ; agent coupé → /admin le signale ;
  redémarrage du mini-PC → reprise sans doublon.
- **Toi** : acheter le mini-PC (x86 type N100, pour faire tourner aussi l'image de tranchage en secours ; ~150 €) ;
  installer Debian/Ubuntu + Docker ; secret Worker `ATELIER_TOKEN` et même valeur dans la configuration locale ;
  réseau local avec la P2S.

### Phase 5 — prix sur-mesure calculé
- `tools/generer-bareme.mjs` (dans l'image) : grille par produit, tranchage, `assets/js/bareme.js` ; workflow
  `bareme.yml` (`workflow_dispatch` avec branche, matrice par produit, commit sur la branche) ; le job `geometrie` vérifie
  que l'empreinte du barème correspond aux entrées (rapide, sans trancher).
- `data.js` : `EVARYSTH.tarif`, `densite` et `eurKg` par matière, `custom.plafond` ; `priceFor` lit le barème (surcharge
  et `pricePerUnit` retirés) ; `index.html` charge `bareme.js` ; Worker l'importe (`catalogue.js`) ; `worker.yml`
  redéploie sur changement de `bareme.js` ; pages régénérées.
- Fichiers : `tools/generer-bareme.mjs`, `assets/js/{bareme,data}.js`, `index.html`, `worker/src/{catalogue,commande,admin}.js`,
  `.github/workflows/{bareme,worker,geometrie}.yml`, tests.
- Acceptation : prix du curseur = prix payé (test Worker sur 100 cotes tirées au hasard) ; écart interpolé / tranché
  < 10 % en masse et en temps sur des points hors grille ; plancher et plafond testés ; avertissement CI des prix
  standards sous le coût ; barème périmé → `geometrie` rouge.
- **Toi** : confirmer les valeurs du tarif et les plafonds par produit.

## Points ouverts (propriétaire)
- Catalogue ASA / PA-CF / PA12 : garder (fabricant externe) ou passer des fiches en PETG (promesse « tient dehors »).
- Marge sur fabricant externe : son tarif n'est pas le coût machine ; sujet à part, hors de ce chantier.
- Plafond : prix plafonné + alerte (interprétation retenue) ou blocage de la commande au-delà ?
- Rétention R2 des fichiers de commande (24 mois proposé).
- Jeux ASA, PA-CF, PA12 et orientations / supports des fiches : à confirmer au premier tranchage (hérité du chantier
  précédent).
- Licence des modèles sous droits de tiers (carapuce, chat-lord, voiture-voronoi) : avant l'ouverture des ventes.
