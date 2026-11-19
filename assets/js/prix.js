/* Evarysth — calcul des prix (règle : docs/prix.md).
   Chargé après data.js (produits, matières) et bareme.js (masse et temps tranchés, bruts), dans le navigateur, les pages
   générées et les outils (tools/) : un seul code.
   Un seul calcul pour les tailles standard et le sur-mesure : une taille n'est qu'un préréglage de cotes.
   Contrôle : node tools/rapport-prix.mjs --verifier (référence tools/references-prix.json, invariants bloquants). */
(function (E) {
  /* Frais de commande, du panier (cart.js), en euros TTC.
     livraison : en point relais, une fois par commande, selon la masse du colis (E.livraison) ; paliers [masse max en g,
     prix], auDela au-delà du dernier palier ; carton_g ajouté à la masse des pièces.
     promosDemo : codes de démonstration du panier. */
  E.frais = {
    livraison: { paliers: [[500, 4.5], [1000, 6.5], [3000, 8.5]], auDela: 11.5, carton_g: 100 },
    cadeau: 3, messageCadeauMax: 200, promosDemo: { BIENVENUE10: 0.10 }
  };

  /* Tarifs (11 nov. 2026), en euros ; g = masse estimée (g), h = temps estimé (h), r = taux d'échec de la matière.
     V (coût d'une pièce) = Mat + Mach + Vm + MO + emballage + fixes ;
     prix unitaire pour n pièces identiques d'une ligne = max(prixMinimum, (n × V + lancement) / n / (1 − prelevements))
     × coefficient valeur du produit (p.valeur, 1 par défaut), arrondi à l'euro supérieur. */
  E.tarif = {
    filamentCoef: 2,        // Mat = filamentCoef × g/1000 × €/kg × (1 + r) : filament (pertes, purges, stock compris)
    usureEurH: 0.6,         // Mach = h × usureEurH × (1 + r) : électricité, usure, pièces d'imprimante
    occupation: { eurH: 1, seuil: 8, eurHApres: 0.4 },  // Vm = min(h, 8) × 1 + max(0, h − 8) × 0,40 : plateau occupé
    mainOeuvre: { eurMin: 0.4, minutes: 6, gParMinute: 50 },  // MO = 0,40 × (6 + g/50) : préparation, finition, contrôle
    emballage: 0.3,         // carton, calage, étiquette
    fixes: 4,               // part des frais fixes (site, logiciels, assurance, échantillons)
    lancement: 2,           // une fois par ligne de commande (préparation du fichier, réglage), réparti sur n pièces
    prelevements: 0.149,    // Stripe 1,5 % + URSSAF 12,3 % + CFP 0,1 % + versement libératoire 1 %
    prixMinimum: 9          // aucune pièce vendue sous ce prix
  };

  /* Matière de prix : celle de la fiche d'impression, sinon celle du produit ; jamais de valeur par défaut */
  E.matierePrix = p => {
    const k = (p.impression && p.impression.matiere) || p.matiere, m = k && E.matieres[k];
    if (!m) throw new Error(`Matière ${k ? `« ${k} » inconnue` : "absente"} pour ${p.id} : prix impossible`);
    return m;
  };

  /* Barème lissé (copie ; bareme.js reste brut) : sur chaque axe, masse et temps remplacés par leur maximum cumulé, pour
     qu'aucune estimation ne baisse quand une cote augmente (le tranchage n'est pas monotone à quelques % près).
     Calculé une fois par jeu de points. */
  const lisses = new WeakMap();
  E.baremeLisse = p => {
    const b = E.bareme && E.bareme.produits[p.id];
    if (!b) return null;
    if (!lisses.has(b.points)) {
      const dims = Object.keys(b.axes).map(k => b.axes[k].length), pts = b.points.map(x => x.slice());
      let pas = 1;
      for (let d = dims.length - 1; d >= 0; d--) {
        for (let i = 0; i < pts.length; i++)
          if (Math.floor(i / pas) % dims[d]) pts[i] = pts[i].map((v, c) => Math.max(v, pts[i - pas][c]));
        pas *= dims[d];
      }
      lisses.set(b.points, { ...b, points: pts });
    }
    return lisses.get(b.points);
  };

  /* Masse et temps estimés : interpolation multilinéaire dans le barème lissé (cotes et comptes ; cotes hors grille
     ramenées aux bornes), plus, pour chaque paramètre choix, le supplément de l'option retenue sur l'option par défaut
     (options du barème, tranchées aux autres valeurs par défaut ; supplément négatif possible). null si le barème n'est
     pas chargé, ne connaît pas le produit ou pas l'option. */
  E.estimation = (p, values) => {
    const b = E.baremeLisse(p);
    if (!b) return null;
    const cles = Object.keys(b.axes), pos = cles.map(k => {
      const ax = b.axes[k], v = Math.min(ax[ax.length - 1], Math.max(ax[0], Number(values[k])));
      let i = 0;
      while (i < ax.length - 2 && v > ax[i + 1]) i++;
      return { i, t: ax.length > 1 ? (v - ax[i]) / (ax[i + 1] - ax[i]) : 0, n: ax.length };
    });
    let cm3 = 0, s = 0;
    for (let c = 0; c < 1 << cles.length; c++) {
      let w = 1, idx = 0;
      pos.forEach((q, d) => {
        const haut = (c >> d) & 1;
        w *= haut ? q.t : 1 - q.t;
        idx = idx * q.n + Math.min(q.i + haut, q.n - 1);
      });
      if (w) { cm3 += w * b.points[idx][0]; s += w * b.points[idx][1]; }
    }
    for (const [k, o] of Object.entries(b.options || {})) {
      const prm = p.custom.params.find(q => q.key === k), x = o[values[k]], ref = prm && o[prm.def];
      if (!x || !ref) return null;
      cm3 += x[0] - ref[0]; s += x[1] - ref[1];
    }
    cm3 = Math.max(0, cm3); s = Math.max(0, s);
    return { cm3, masse_g: cm3 * E.matierePrix(p).densite, temps_min: s / 60 };
  };

  /* Décomposition du prix unitaire d'une configuration commandée en n exemplaires (null si barème absent) */
  E.prixDetail = (p, values, n = 1) => {
    const e = E.estimation(p, values);
    if (!e) return null;
    const t = E.tarif, m = E.matierePrix(p), r = m.echec || 0, g = e.masse_g, h = e.temps_min / 60, oc = t.occupation;
    n = Math.max(1, Math.floor(n) || 1);
    const d = {
      mat: t.filamentCoef * g / 1000 * m.eurKg * (1 + r),
      mach: h * t.usureEurH * (1 + r),
      vm: Math.min(h, oc.seuil) * oc.eurH + Math.max(0, h - oc.seuil) * oc.eurHApres,
      mo: t.mainOeuvre.eurMin * (t.mainOeuvre.minutes + g / t.mainOeuvre.gParMinute),
      emballage: t.emballage, fixes: t.fixes
    };
    const V = d.mat + d.mach + d.vm + d.mo + d.emballage + d.fixes, lancement = t.lancement / n;
    const brut = (V + lancement) / (1 - t.prelevements), valeur = p.valeur || 1;
    const prix = Math.ceil(Math.max(t.prixMinimum, brut) * valeur - 1e-9);
    return { ...e, heures: h, n, filiere: m.filiere, ...d, V, lancement, prelevements: brut - V - lancement, valeur, prix };
  };

  /* Prix unitaire d'une configuration (mode gardé pour compatibilité : standard et sur-mesure ont le même calcul) */
  E.priceFor = (p, mode, values, n = 1) => {
    const r = E.prixDetail(p, values, n);
    if (!r) throw new Error(`Prix indisponible pour ${p.id} (barème absent)`);
    return r.prix;
  };

  /* Livraison d'un colis de masse_g grammes (carton compris) */
  E.livraison = masse_g => {
    const l = E.frais.livraison, palier = l.paliers.find(([max]) => masse_g <= max);
    return palier ? palier[1] : l.auDela;
  };
  /* Masse du colis : lignes [{ masse_g (d'une pièce), qty }] + carton */
  E.masseColis = lignes => lignes.reduce((s, l) => s + l.masse_g * l.qty, 0) + E.frais.livraison.carton_g;

  /* Totaux du panier, en euros : lignes [{ prix (unitaire, déjà dégressif), masse_g (d'une pièce), qty }] ;
     cadeau : emballage choisi ; remise : { rate, amount } ou null. La remise porte sur les articles et
     l'emballage, pas sur la livraison. */
  E.totalPanier = (lignes, { cadeau = false, remise = null } = {}) => {
    const c = x => Math.round(x * 100) / 100, vide = !lignes.length;
    const articles = c(lignes.reduce((s, l) => s + l.prix * l.qty, 0)), emballage = !vide && cadeau ? E.frais.cadeau : 0;
    const base = articles + emballage;
    const reduction = remise ? Math.min(base, c(base * (remise.rate || 0) + (remise.amount || 0))) : 0;
    const masse_g = vide ? 0 : E.masseColis(lignes), livraison = vide ? 0 : E.livraison(masse_g);
    return { articles, emballage, remise: reduction, masse_g, livraison, total: c(base - reduction + livraison) };
  };

  /* « Dès » : prix aux cotes minimales des curseurs (le prix ne baisse jamais quand une cote augmente), au moins cher des
     choix (toutes leurs combinaisons : les options n'ont pas d'ordre) ; sans sur-mesure, plus petit prix des tailles standard */
  E.prixDes = p => {
    const prm = p.custom && p.custom.params;
    if (prm && prm.length) return Math.min(...prm.reduce((acc, q) => acc.flatMap(c =>
      (E.estChoix(q) ? q.options.map(o => o.id) : [q.min]).map(x => ({ ...c, [q.key]: x }))), [{}]).map(v => E.priceFor(p, "custom", v)));
    return Math.min(...p.variants.options.map(o => E.priceFor(p, "standard", o.values)));
  };
})(window.EVARYSTH);
