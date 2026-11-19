# Prix — règle en vigueur (11 nov. 2026, telle que codée dans `assets/js/prix.js`)
- **Où** : `assets/js/prix.js` (tarifs commentés dans `EVARYSTH.tarif`), chargé après `data.js` et `bareme.js` (généré) sur le site, les pages générées et le Worker : prix affiché = prix payé. Aucun prix saisi à la main.
- **Un seul calcul** pour tailles standard et sur-mesure : une taille n'est qu'un préréglage de cotes. API : `priceFor(p, mode, values, n = 1)` (mode sans effet), `prixDetail(p, values, n)` (décomposition, rapport et /admin), `prixDes(p)` (« Dès » = prix aux cotes minimales, à l'option la moins chère de chaque choix : toutes les combinaisons d'options).
- **Estimation** : g = masse (cm³ du barème × densité), h = heures, par interpolation multilinéaire du barème **lissé** (copie : sur chaque axe, masse et temps remplacés par leur maximum cumulé ; `bareme.js` reste brut). Cotes hors grille ramenées aux bornes ; barème absent → pas de prix, commande refusée.
- **Paramètres choix** (`type: "choix"`, README « Paramètre choix ») : pas d'axe dans la grille (les options n'ont pas
  d'ordre). Le barème garde, par paramètre choix, le point tranché de chaque option (`options`), les autres paramètres à
  leur valeur par défaut ; l'estimation ajoute à la grille (tranchée aux options par défaut) le supplément de l'option
  retenue sur l'option par défaut, en cm³ et en temps (négatif pour une option plus légère ; total jamais sous 0). Option
  absente du barème → pas de prix.
  - Pourquoi un supplément par option plutôt que chaque combinaison : 1 + Σ (options − 1) tranchages au lieu du produit
    des options (organiseur 5 × 4 × 3 : 10 au lieu de 60), et une grille de cotes n'est pas multipliée par les combinaisons
    (2 cotes, 16 points : 25 tranchages au lieu de 960 avec les mêmes choix). Une option change une zone de la pièce
    (logement, emplacement) : son effet sur la masse et le temps s'additionne à celui des autres ; il est exact pour une
    option seule aux valeurs par défaut, estimé pour un mélange ou d'autres cotes.
- **Matière** : celle de la fiche d'impression (sinon `matiere`), r = taux d'échec (5 % PLA/PETG, 15 % ASA/PA12/PA-CF). `filiere` : « atelier » (PLA, PETG, matières avec profil de tranchage) ou « externe » (ASA, PA12, PA-CF) ; même calcul, prix marqué « provisoire » pour « externe » dans le rapport et /admin.
- **Coût d'une pièce** V = Mat + Mach + Vm + MO + emballage + fixes :
  - Mat = 2 × g/1000 × €/kg × (1 + r) ; Mach = h × 0,60 × (1 + r) ;
  - Vm (occupation machine) = min(h, 8) × 1,00 + max(0, h − 8) × 0,40 ; MO = 0,40 × (6 + g/50) ;
  - emballage 0,30 ; fixes 4,00.
- **Prix unitaire** pour n pièces identiques d'une ligne = euro supérieur de max(9, (n × V + 2,00) / n / (1 − 0,149)) × `valeur`.
  - 2,00 € de lancement par ligne ; 0,149 = Stripe 1,5 % + URSSAF 12,3 % + CFP 0,1 % + versement libératoire 1 %.
  - `valeur` : coefficient facultatif du produit dans `data.js`, 1 par défaut, appliqué avant l'arrondi.
- **Panier** : prix unitaire d'une ligne = `priceFor(p, mode, values, qty)` (dégressif, « prix dégressif » affiché quand qty > 1) ; Stripe reçoit ce prix unitaire et la quantité. Totaux : `EVARYSTH.totalPanier` (site), `totalCommande` en centimes (Worker), égaux au centime (`worker/test/panier.test.mjs`, 200 paniers).
- **Livraison** en point relais, une fois par commande : `E.livraison(masse_g)` = 4,50 € jusqu'à 500 g, 6,50 € jusqu'à 1 kg, 8,50 € jusqu'à 3 kg, 11,50 € au-delà ; masse = Σ masse estimée × quantité + 100 g de carton (`E.masseColis`) ; même fonction dans le panier et le Worker (`shipping_rate_data` par commande).
- **Frais** (`EVARYSTH.frais`, communs au panier et au Worker) : paliers de livraison ; emballage cadeau 3 €, message ≤ 200 caractères ; code de démonstration `BIENVENUE10` (−10 %) hors paiement, Stripe décide des codes en paiement. Remise : sur les articles et l'emballage, pas sur la livraison. TVA non applicable, art. 293 B du CGI.
- **Contrôle** : `node tools/rapport-prix.mjs` (tableau ; `--json`) ; référence figée `tools/references-prix.json` (`--mettre-a-jour` si changement voulu).
- **Rapport** : balayage de toutes les options de chaque choix ; repères min / défaut / max aux options par défaut.
- **Invariants bloquants** (`--verifier`, `tools/test/prix.test.mjs`) : aucune baisse quand une cote augmente (pas de sens
  entre les options d'un choix : aucun contrôle sur cet axe) ; hausse ≤ 1 € par mm de curseur (arrondie à l'euro supérieur ; un paramètre « compte » n'y est pas soumis, un cran ajoutant un élément entier) ; même prix en standard et en sur-mesure aux mêmes cotes ; « Dès » = minimum réel du balayage ; aucun prix sous 9 € ; prix unitaire jamais plus haut pour n + 1 pièces que pour n.
