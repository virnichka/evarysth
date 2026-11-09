# Chaîne de fabrication (commande payée → fichier prêt à imprimer)

> **État (9 novembre 2026)** : phase 0 (cadrage) terminée. Prochaine étape : phase 1 (essai de faisabilité).
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
