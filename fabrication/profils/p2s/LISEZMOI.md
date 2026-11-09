# Profils P2S autonomes (Fabrication · phases 1a et 2a)

Profils de tranchage de l'atelier pour la **Bambu Lab P2S, buse 0,4 mm**, lus par `tools/trancher.mjs` et copiés
dans l'image `fabrication/Dockerfile` (`/opt/evarysth/profils/p2s`).

| Fichier | Nom du profil | Profil système d'origine |
|---|---|---|
| `machine.json` | Evarysth P2S 0.4 nozzle | `Bambu Lab P2S 0.4 nozzle` |
| `process-0.20mm.json` | Evarysth 0.20mm Standard P2S | `0.20mm Standard @BBL P2S` |
| `filament-pla.json` | Evarysth Generic PLA P2S | `Generic PLA @BBL P2S` |
| `filament-petg.json` | Evarysth Generic PETG P2S | `Generic PETG @BBL P2S` (ajouté en Fabrication · phase 2a) |

- **Version** : Bambu Studio **02.08.02.61** (AppImage `BambuStudio_ubuntu24.04-v02.08.02.61-20260820225108.AppImage`,
  sha256 `d501b103…81a7fd`), ensemble de profils `BBL` **02.08.00.05**.
- **Origine** : `resources/profiles/BBL/{machine,process,filament}/` de cette AppImage. Chaque profil est **aplati** :
  toute la chaîne `inherits` (et les modèles `include` de G-code de la machine) est résolue, puis `inherits` est vidé.
  Chaîne exacte par fichier : `origine.json`. Aucun profil système n'est lu au tranchage.
- **Seules modifications** par rapport aux profils système :
  - noms « Evarysth … », `compatible_printers` = `["Evarysth P2S 0.4 nozzle"]` (process et filament) ;
  - `from: "system"` : la ligne de commande ne valide la paire machine ↔ process que par le nom « système » de la machine
    (sinon erreur « process not compatible with printer ») ; aucun fichier système n'est chargé pour autant ;
  - `curr_bed_type: "Textured PEI Plate"` (plateau par défaut du modèle P2S) : sans elle, la ligne de commande prend
    « Cool Plate », que la P2S ne prend pas en charge ;
  - clés de structure retirées : `inherits`, `include`, `setting_id`, `instantiation`, `base_id`, `renamed_from`.
- **Régénérer** (seulement en changeant de version de Bambu Studio, puis committer et noter la version ici) :
  `docker run --rm -u "$(id -u)" -v "$PWD:/travail" <image> node fabrication/aplatir-profils.mjs /opt/bambu-studio/resources/profiles/BBL`
- **Matière → profil** (`tools/trancher.mjs`) : PLA → `filament-pla.json`, PETG → `filament-petg.json` ; toute autre
  matière n'est pas tranchée (fabricant externe : STL + 3MF non tranché + fiche).
- **Coloris** : `trancher.mjs` copie le profil filament de l'article en y mettant `filament_colour` = couleur du coloris
  (`data.js`, hex), contrôlée dans `slice_info.config` du `.gcode.3mf` ; la P2S associe un emplacement de l'AMS chargé
  du même type et de la même couleur. Le manifeste note le mapping AMS (filament 1 → coloris, emplacement conseillé A1).
- PETG ajouté en Fabrication · phase 2a avec la même commande de régénération : `machine.json`, `process-0.20mm.json`
  et `filament-pla.json` ressortent identiques à l'octet. Écart observé : en PETG, avec plusieurs exemplaires identiques
  sur un plateau, l'ordre d'impression entre objets varie parfois d'un tranchage à l'autre (temps ± 11 s sur 52 min,
  masse identique) ; le PLA reste identique au bit près. Sans effet : la clé d'idempotence est n° d'article + SHA.
