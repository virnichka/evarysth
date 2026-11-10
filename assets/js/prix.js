/* Evarysth — calcul des prix (règle : docs/prix.md ; historique : docs/chaine-fabrication.md § « Prix sur-mesure »).
   Chargé après data.js (produits, matières) et bareme.js (masse et temps tranchés), dans le navigateur, les pages générées
   et le Worker (worker/src/catalogue.js) : un seul code, donc prix affiché = prix payé.
   Contrôle : node tools/rapport-prix.mjs --verifier (référence tools/references-prix.json, test bloquant). */
(function (E) {
  /* Frais de commande, communs au panier (cart.js) et au Worker (worker/src/commande.js), en euros TTC.
     promosDemo : codes de démonstration du panier hors paiement (sans ?checkout=test) ; en paiement, Stripe décide. */
  E.frais = { livraison: 4.9, cadeau: 3, messageCadeauMax: 200, promosDemo: { BIENVENUE10: 0.10 } };

  /* Tarifs (10 nov. 2026), modifiables sans retrancher :
     cout = (masse_kg × eurKg + temps_h × machineEurH) × (1 + echec de la matière) + forfait + emballage ;
     formule = euro supérieur de (cout × coefficient + stripeFixe) / (1 − stripePct) ;
     sur-mesure = base + supplément, base = max(formule, plancher), plancher = prix de la plus grande taille standard dont
     toutes les cotes sont ≤ aux cotes demandées (0 si aucune), supplément = part × base à l'euro supérieur, entre min et max.
     Standard : prix des tailles fixé dans data.js. */
  E.tarif = { machineEurH: 1.5, forfait: 3, emballage: 0.5, coefficient: 2.5, stripePct: 0.015, stripeFixe: 0.25, supplement: { part: 0.1, min: 2, max: 8 } };

  /* Matière de prix : celle de la fiche d'impression, sinon celle du produit ; jamais de valeur par défaut */
  E.matierePrix = p => {
    const k = (p.impression && p.impression.matiere) || p.matiere, m = k && E.matieres[k];
    if (!m) throw new Error(`Matière ${k ? `« ${k} » inconnue` : "absente"} pour ${p.id} : prix impossible`);
    return m;
  };

  /* Taille standard dont les cotes sont exactement celles données (null sinon) */
  E.taillePour = (p, values) => ((p.variants && p.variants.options) || [])
    .find(o => values && Object.keys(o.values).every(k => o.values[k] === values[k])) || null;

  /* Masse et temps estimés : interpolation multilinéaire dans le barème tranché. null si le barème n'est pas chargé ou ne
     connaît pas le produit. */
  E.estimation = (p, values) => {
    const b = E.bareme && E.bareme.produits[p.id];
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
    return { cm3, masse_g: cm3 * E.matierePrix(p).densite, temps_min: s / 60 };
  };

  /* Coût, formule et prix sur-mesure d'une configuration (null si le barème ne connaît pas le produit) */
  E.prixCalcule = (p, values) => {
    const e = E.estimation(p, values);
    if (!e) return null;
    const t = E.tarif, m = E.matierePrix(p);
    const cout = (e.masse_g / 1000 * m.eurKg + e.temps_min / 60 * t.machineEurH) * (1 + (m.echec || 0)) + t.forfait + t.emballage;
    const formule = Math.ceil((cout * t.coefficient + t.stripeFixe) / (1 - t.stripePct) - 1e-9);
    const tailles = (p.variants && p.variants.options) || [];
    const dessous = tailles.filter(o => p.custom.params.every(q => o.values[q.key] <= values[q.key]))
      .sort((x, y) => (x.price ?? p.price) - (y.price ?? p.price)).pop();
    const plancher = dessous ? (dessous.price ?? p.price) : 0;
    const base = Math.max(formule, plancher), sp = t.supplement;
    const supplement = Math.min(sp.max, Math.max(sp.min, Math.ceil(base * sp.part - 1e-9)));
    return { ...e, cout: Math.round(cout * 100) / 100, formule, plancher, taille: dessous ? dessous.label : null,
      supplement, prix: base + supplement };
  };

  /* Prix d'une configuration : standard = prix de la taille (data.js) ; sur-mesure = prix calculé */
  E.priceFor = (p, mode, values) => {
    if (mode !== "custom") {
      const o = E.taillePour(p, values);
      return o && o.price != null ? o.price : p.price;
    }
    const r = E.prixCalcule(p, values);
    if (!r) throw new Error(`Prix sur-mesure indisponible pour ${p.id} (barème absent)`);
    return r.prix;
  };
})(window.EVARYSTH);
