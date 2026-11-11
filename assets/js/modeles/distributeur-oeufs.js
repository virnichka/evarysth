/* Modèle 3D « distributeur-oeufs » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   D'après le STL « eggs dispenser v21 » (assets/models/distributeur-oeufs/) et les photos du produit : deux bacs à
   fond plat superposés, reliés à gauche par une boucle (forme de trombone), arêtes arrondies.
   On pose les œufs couchés dans le bac du haut : ils roulent vers la gauche, font demi-tour dans la boucle et
   redescendent par le bac du bas jusqu'à son bout arrondi, à droite, où l'on prend le premier. Pente des bacs : 5 %.
   a = longueur des œufs (bacs larges de a + 4 mm + jeu à l'intérieur), b = longueur du distributeur.
   Repère : X la longueur (boucle à gauche, x = 0 ; sortie à droite, x = b), Y vers le haut (0 = dessous),
   Z la profondeur (flancs de z = 0 à 5 et de W + 5 à W + 10).
   Flancs : un seul contour par côté (bord du bac bas, anneau de la boucle, bord du bac haut, talon), congé de 6 mm
   sur tous ses angles, puis extrudé aux arêtes arrondies (bords épais et ronds, comme sur les photos). */
(() => {
  const T = 5, RB = 2.4, TB = 4, TU = 3, PENTE = 0.05, RCAP = 16, CONGE = 6;   // flanc, arrondi des bords, boucle, fond haut, pente, coins des bouts, congé
  /* Cotes dérivées, communes au modèle et aux contrôles */
  const geo = ({ a, b, jeu = 0 }) => {
    const D = 0.8 * a, W = a + 4 + jeu, h = D / 2;            // diamètre d'œuf pris en compte (≈ a / 1,3 + marge), largeur, hauteur des bords
    const Rc = (D + 2 + TU) / 2, Rd = Rc + D / 2, Ro = Rd + TB; // trajectoire du centre de l'œuf dans la boucle, boucle int. / ext.
    const xu = Ro, yL0 = 3 + PENTE * (b - xu);                  // axe de la boucle ; fond bas à l'axe (3 mm de fond à la sortie)
    const cy = yL0 + D / 2 + Rc, yU0 = yL0 + D + 2 + TU;        // centre de la boucle ; fond haut à l'axe (2 mm au-dessus des œufs du bas)
    return { D, W, Wt: W + 2 * T, h, Rc, Rd, Ro, xu, yL0, cy, yU0, xUe: b - 0.9 * D - 10,
      yL: x => yL0 - PENTE * (x - xu), yU: x => yU0 + PENTE * (x - xu) };
  };
  /* Arc de cercle (degrés), nombre de segments pair (le milieu est un sommet) : corde de cyl(), ou corde donnée
     (contours décoratifs, sans cote déclarée : flancs 3 mm, boucle 1,5 mm, bouts 1 mm ; calcul < 300 ms) */
  const arcPts = (k, cx, cy, r, a0, a1, corde) => {
    const n = corde ? Math.max(8, 2 * Math.ceil(r * Math.abs(a1 - a0) * Math.PI / 180 / corde / 2))
      : Math.max(8, 2 * Math.ceil(k.segments(r) * Math.abs(a1 - a0) / 720));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    });
  };

  EVARYSTH.viewer3d.define("distributeur-oeufs", ({ m }) => m((k, v) => {
    const { b } = v, { D, W, Wt, h, Rc, Rd, Ro, xu, yL0, cy, yU0, xUe, yL, yU } = geo(v);
    const zIn = W + 4, zMid = Wt / 2;                           // pièces entre les flancs : 2 mm noyés dans chaque flanc

    /* Talon sous la boucle (dessous à 45°, jusqu'au sol) */
    const q = [xu - Math.SQRT1_2 * Ro, cy - Math.SQRT1_2 * Ro], xh = Math.min(xu - 2, q[0] + q[1]);
    const talon = c => [q, [xh, 0], [xu + 1, 0], ...arcPts(k, xu, cy, Ro - 0.5, 270, 225, c)];

    /* Union de contours 2D moins des trous, puis congé de rayon r sur tous les angles (Section du kit) */
    const unir = (polys, r, trous = []) => {
      const cs = [...polys, ...trous].map(p => new k.CrossSection([p], "EvenOdd"));
      const u = k.CrossSection.union(cs.slice(0, polys.length)), f = trous.length ? u.subtract(k.CrossSection.union(cs.slice(polys.length))) : u;
      const s = k.conge({ isSection: true, cs: f }, r);
      cs.forEach(c => c.delete()); if (f !== u) f.delete(); u.delete();
      return s;
    };

    /* Extrusion aux arêtes arrondies (rayon RB) d'un contour décoratif, simplifié à 0,1 mm près (calcul rapide) */
    const arrondi = (src, d) => {
      const c = k.offset(src, -RB).cs.simplify(0.1);
      const s = k.extArrondi({ isSection: true, cs: c, polygons: () => c.toPolygons().map(p => p.map(([x, y]) => [x, y])) }, d, RB, 2);
      c.delete();
      return s;
    };

    /* Flanc : boucle pleine, bord du bac bas, bord du bac haut (qui descend du haut de la boucle sur une longueur
       d'œuf), talon ; moins la fenêtre entre les deux bacs, terminée en demi-cercle dans la boucle (comme sur les
       photos : la boucle reste un anneau d'environ 0,4 D de large) ; congé, extrusion aux arêtes arrondies */
    const xe1 = b - RCAP + 3, xe2 = xUe - RCAP + 3, haut = cy + Ro;
    /* Bord du bac haut : descend du haut de la boucle à sa hauteur courante en S (demi-cosinus) sur 1,2 D */
    const descente = Array.from({ length: 25 }, (_, i) => {
      const t = 1 - i / 24, x = xu + 1.2 * D * t;
      return [x, yU(x) + h + (haut - yU(xu) - h) * (1 + Math.cos(Math.PI * t)) / 2];
    });
    const jour = x => yU(x) - TU - yL(x) - h, xc = 0.4 * D + jour(0.4 * D) / 2, rw = jour(xc) / 2;
    const fenetre = [[xc, yL(xc) + h], [b + 10, yL(b + 10) + h], [b + 10, yU(b + 10) - TU], [xc, yU(xc) - TU],
      ...arcPts(k, xc, yL(xc) + h + rw, rw, 90, 270, 1)];
    const profil = unir([
      [...arcPts(k, xu, cy, Ro, 90, 270, 3), [xu + 1, cy - Ro], [xu + 1, haut]],
      [[xu - 1, 0], [xe1, 0], [xe1, yL(xe1) + h], [xu - 1, yL(xu - 1) + h]],
      [[xu - 1, yU(xu - 1) - TU], [xe2, yU(xe2) - TU], [xe2, yU(xe2) + h], ...descente, [xu - 1, haut]],
      talon(3)], CONGE, [fenetre]);
    const flanc = arrondi(profil, T);
    const flancs = [flanc.clone().translate(0, 0, T / 2), flanc.translate(0, 0, Wt - T / 2)];

    /* Entre les flancs, une seule extrusion : boucle, talon, fond bas (dessous au sol), fond haut (3 mm, bout gauche
       à l'axe de la boucle) ; congé de 1,5 mm (bord d'où l'œuf bascule dans la boucle) */
    const xb1 = b - RCAP - 2, xf = xUe - RCAP - 2;
    const interieur = k.ext(unir([
      [...arcPts(k, xu, cy, Ro, 90, 270, 1.5), ...arcPts(k, xu, cy, Rd, 270, 90, 1.5)],
      talon(1.5),
      [[xu - 1, 0], [xb1, 0], [xb1, yL(xb1)], [xu - 1, yL(xu - 1)]],
      [[xu, yU(xu) - TU], [xf, yU(xf) - TU], [xf, yU(xf)], [xu, yU(xu)]]], 1.5), zIn).translate(0, 0, zMid);

    /* Bouts arrondis des bacs (vus de dessus : coins de rayon RCAP), bord et fond */
    /* Bout d'un bac (fin à xe) : bord en U et fond, posés horizontalement (fond à yF au pivot xp = xe − RCAP,
       bord jusqu'à yF + h, dessous à yF − dessous), puis cisaillés à la pente du bac (x inchangé : longueur exacte) */
    const bout = (xe, yF, dessous, pente) => {
      const x0 = xe - RCAP - 8, ri = RCAP - T, xp = xe - RCAP;
      const ext = [[x0, 0], ...arcPts(k, xe - RCAP, RCAP, RCAP, 270, 360, 1), ...arcPts(k, xe - RCAP, Wt - RCAP, RCAP, 0, 90, 1), [x0, Wt]];
      const int = [[x0 - 1, Wt - T], ...arcPts(k, xe - RCAP, Wt - RCAP, ri, 90, 0, 1), ...arcPts(k, xe - RCAP, RCAP, ri, 360, 270, 1), [x0 - 1, T]];
      const pose = (s, y0, y1) => k.solid(s.rotateX(Math.PI / 2).translate(0, (y0 + y1) / 2, 0).mf.warp(q => { q[1] += pente * (q[0] - xp); }));
      return [pose(arrondi([...ext, ...int], h + dessous), yF - dessous, yF + h), pose(k.ext(k.offset(ext, -RB), dessous), yF - dessous, yF)];
    };
    const boutBas = bout(b, yL(b - RCAP), yL(b - RCAP) + 2, -PENTE).map(s => k.solid(s.mf.trimByPlane([0, 1, 0], 0)));
    const boutHaut = bout(xUe, yU(xUe - RCAP), TU, PENTE);

    return k.join(...flancs, interieur, ...boutBas, ...boutHaut);
  }), {
    solides: 1,
    /* La coupe médiane horizontale du contrôle frôle l'arête arrondie (r = 2,4) du haut de la fenêtre, en pente de 5 % :
       elle y prend une bande de quelques dixièmes de millimètre (≈ 2,4 mm² perdus), alors que le flanc fait 5 mm */
    paroi: { min: 1.2, seuil: 3 },
    /* Repère de construction : dessous en y = 0, boucle à gauche (x = 0), flancs de z = 0 à 5 et de W + 5 à W + 10.
       Largeur intérieure mesurée dans la boucle, à mi-hauteur, entre l'anneau du flanc et la boucle. */
    cotes: v => {
      const { W, Rc, Rd, xu, cy } = geo(v), en = [xu - (Rc + Rd) / 2, cy, T + W / 2];
      return [
        { nom: "largeur intérieure (longueur d'œuf + 4 mm)", axe: "y", en, mesure: "largeur", selon: "z", attendu: W },
        { nom: "longueur du distributeur", axe: "y", en, mesure: "boite", selon: "x", attendu: v.b }];
    }
  });
})();
