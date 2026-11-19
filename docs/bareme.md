# Barème des prix (`assets/js/bareme.js`, généré)

Les prix (tailles standard comprises) partent de la masse de filament et du temps d'impression estimés en tranchant
chaque produit avec Bambu Studio. Règle de prix : `docs/prix.md`.

## Principe
- **Source géométrique unique** : les modèles JS (`assets/js/modeles/`, `assets/js/geo.js`, manifold-3d), exécutés sous
  Node par `tools/generer-stl.mjs --impression` (pièces posées et rangées sur un plateau de 256 × 256 × 256 mm).
- **Plateau** : `ranger()` laisse une bande avant de 10 mm (`MARGE_AVANT`, ligne de chargement de la buse de la P2S) et
  essaie deux règles d'orientation (côté long selon X puis Y). Une pièce plus profonde que la surface utile (ex.
  `boite-rugged` aux cotes max) est posée seule à Y = 0 et marquée `hors_marge_avant`.
- `tools/trancher.mjs` tranche les plateaux d'un manifeste `generer-stl` (profil PLA ou PETG) et lit masse et temps.
- `tools/generer-bareme.mjs` tranche une grille de cotes par produit (min, défaut, max et milieux : 5 points par axe pour
  1 paramètre, 4 pour 2, 3 pour 3, aucun pas > 100 mm) et stocke cm³ de filament et temps (s) d'un exemplaire. ASA, PA12,
  PA-CF : profil PETG (estimation). Paramètres choix : la grille est tranchée à leur option par défaut, puis chaque
  autre option une fois, les autres paramètres à leur valeur par défaut (`options` du barème ; règle : `docs/prix.md`).
- Empreinte par produit (modèle, STL d'origine, moteur, fiche d'impression, bornes des cotes, ids et défaut des options,
  jeu, profils, image ; pas les libellés) : le job `geometrie` échoue si le barème est périmé.
- Mise à jour : workflow `bareme.yml` sur la branche (refuse `main`), ou `node tools/generer-bareme.mjs <id>` avec Bambu
  Studio installé. Contrôle : `node tools/generer-bareme.mjs --verifier --tableau`.

## Image de tranchage (`fabrication/`)
- `fabrication/Dockerfile` : Ubuntu 24.04 épinglé par empreinte, paquets figés (`snapshot.ubuntu.com`), Bambu Studio
  **02.08.02.61** (AppImage extraite, sha256 vérifié), Node 22. Aucun affichage nécessaire. Image ≈ 1,8 Go.
- Profils P2S autonomes : `fabrication/profils/p2s/LISEZMOI.md`.
- **Reproductibilité** : Bambu Studio n'est déterministe que sur 1 cœur et sans ASLR : le lanceur
  `fabrication/bambu-studio` impose `taskset` + `setarch -R` ; le conteneur tourne avec
  `--security-opt seccomp=unconfined`, sans réseau.
- **Empreinte** : `image-fabrication.yml` construit, publie sur GHCR et **vérifie** l'empreinte épinglée dans
  `bareme.yml` (GitHub interdit à un workflow de modifier un fichier de workflow : en cas d'écart, le run échoue avec
  la ligne exacte à reporter dans la PR).
- Construction locale :
  ```
  docker buildx build --provenance=false --build-arg SOURCE_DATE_EPOCH=0 \
    --output type=docker,name=evarysth-fabrication:local,rewrite-timestamp=true fabrication/
  node tools/generer-stl.mjs passe-cable --impression --sortie=sortie-stl/passe-cable
  node tools/trancher.mjs sortie-stl/passe-cable/passe-cable-a60-impression.json --docker=evarysth-fabrication:local --deux-fois
  ```
  Derrière un proxy TLS : `--network host --build-arg https_proxy=… --build-arg APT_URI=https://snapshot.ubuntu.com
  --secret id=ca,src=<CA du proxy>` (contenu de l'image inchangé).
