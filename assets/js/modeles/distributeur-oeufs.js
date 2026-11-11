/* Modèle 3D « distributeur-oeufs » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   Reconstruit d'après le STL « eggs dispenser v21 » (assets/models/distributeur-oeufs/) : distributeur à deux étages.
   On pose les œufs couchés sur la rampe haute, ils roulent vers la gauche, font demi-tour dans le tambour et
   redescendent par la rampe basse jusqu'à la butée de sortie, à droite, où l'on prend le premier.
   Chaque rampe est une paire de rebords en V (pente 30° vers l'intérieur) : l'œuf repose par ses deux bouts sur les
   arêtes d'appui, centré entre les flasques ; les rampes descendent de 2,9° (5 %), en sens opposés.
   a = longueur des œufs (flasques écartées de a + 4 mm + jeu), b = longueur du distributeur.
   Repère : X la longueur (tambour à gauche, x = 0 ; sortie à droite, x = b), Y vers le haut (0 = dessous),
   Z la profondeur (flasques de z = 0 à 3 et de W + 3 à W + 6). Imprimable debout, sans support : dessous des
   rampes hautes et haut du tambour à 45°. */
(() => {
  const T = 3, PENTE = 0.05, BORD = 2, SOL = 3, P = 5, FIN = 10, STOP = 14;  // flasque, pente, épaisseur à l'arête, plancher, montants, butées
  const T30 = Math.tan(Math.PI / 6), C45 = Math.SQRT1_2;
  /* Cotes dérivées, communes au modèle et aux contrôles */
  const geo = ({ a, b, jeu = 0 }) => {
    const D = 0.8 * a;                                   // diamètre d'œuf pris en compte (≈ a / 1,3, plus une marge)
    const W = a + 4 + jeu, e = 0.3 * a;                  // écartement intérieur des flasques, largeur d'un rebord
    const ray = d => d >= a / 2 ? 0 : D / 2 * Math.sqrt(1 - (2 * d / a) ** 2);   // rayon de l'œuf à d de son centre
    const re = ray(W / 2 - e);                           // hauteur du centre de l'œuf au-dessus des arêtes d'appui
    /* Écart vertical des centres d'œuf entre les deux rampes, à gauche : deux œufs superposés ne se touchent pas,
       et l'œuf du bas passe sous le dessous (45°) des rebords hauts avec 2,5 mm de marge */
    let dc = D + 3;
    for (let u = 0; u <= e; u += 0.5) dc = Math.max(dc, re + BORD + (e - u) + ray(W / 2 - u) + 2.5);
    const Rc = dc / 2, Rd = Rc + D / 2 + 1.5, xu = Rd + T;   // trajectoire du centre au demi-tour, tambour, axe
    const yLf = Math.max(8, SOL + 2 + D / 2 - re);           // arête basse à la sortie : l'œuf ne touche pas le plancher
    const yL0 = yLf + PENTE * (b - xu), cy = yL0 + re + Rc;  // arête basse à l'axe du tambour, centre du tambour
    const yU0 = cy + Rc - re, xUe = b - D - 12;              // arête haute à l'axe, fin de la rampe haute (sortie dégagée)
    return { D, W, Wt: W + 2 * T, e, re, Rd, xu, yLf, yL0, cy, yU0, xUe,
      yL: x => yL0 - PENTE * (x - xu), yU: x => yU0 + PENTE * (x - xu) };
  };
EVARYSTH.viewer3d.define("distributeur-oeufs", ({ m }) => {
  /* Arc de cercle (degrés), nombre de segments pair : la corde suit la règle de cyl(), le milieu est un sommet */
  const arcPts = (k, cx, cy, r, a0, a1) => {
    const n = Math.max(8, 2 * Math.ceil(k.segments(r) * Math.abs(a1 - a0) / 720));
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    });
  };

  return m((k, v) => {
    const { b } = v, g = geo(v), { W, Wt, e, Rd, xu, cy, xUe, yL, yU } = g, Ro = Rd + T;
    /* Rebord (profil [u, v] : u vers l'intérieur depuis la face interne de la flasque, v depuis l'arête d'appui),
       extrudé selon X de x0 à x1 sur la pente, côté z = 0 (s = 0) ou z = Wt (s = 1) */
    const rebord = (prof, x0, x1, yArete, pente, s) => {
      const pts = prof.map(([u, w]) => [s ? Wt - T - u : T + u, w]), ang = Math.atan(pente), xm = (x0 + x1) / 2;
      return k.ext(s ? pts.reverse() : pts, (x1 - x0) / Math.cos(ang)).rotateY(-Math.PI / 2).rotateZ(ang)
        .translate(xm, yArete(xm), 0);
    };
    const haut = [[-T, -BORD - e - T], [e, -BORD], [e, 0], [0, e * T30], [-T, e * T30]];   // dessous à 45°
    const bas = [[-T, -80], [0, -80], [0, -BORD - e], [e, -BORD], [e, 0], [0, e * T30], [-T, e * T30]];
    const sol = r => k.solid(r.mf.trimByPlane([0, 1, 0], 0));                             // arasé au plateau
    const rampes = [0, 1].flatMap(s => [
      sol(rebord(bas, xu - 15, b - 1.5, yL, -PENTE, s)),
      rebord(haut, xu, xUe, yU, PENTE, s)]);

    /* Tambour du demi-tour (toute la largeur) : arc de 135° à 270°, haut intérieur droit à 45°, talon jusqu'au sol */
    const ytop = cy + Rd, i135 = [xu - C45 * Rd, cy + C45 * Rd], o135 = [xu - C45 * Ro, cy + C45 * Ro];
    const o225 = [xu - C45 * Ro, cy - C45 * Ro], xo0 = Math.min(xu - 2, o225[0] + o225[1]);
    const exterieur = [[xo0, 0], ...arcPts(k, xu, cy, Ro, 225, 135), [o135[0] + ytop - o135[1], ytop]];
    const tambour = k.ext([[i135[0] + ytop - i135[1], ytop], ...arcPts(k, xu, cy, Rd, 135, 270), [xu, 0], ...exterieur], Wt)
      .translate(0, 0, Wt / 2);
    /* Flasques du tambour (pleines), prolongées jusqu'à x = xu + 2 */
    const flasque = [...exterieur, [xu + 2, ytop], [xu + 2, 0]];
    const flasques = [T / 2, Wt - T / 2].map(z => k.ext(flasque, T).translate(0, 0, z));

    /* Montants et butée arrière de la rampe haute, butée de sortie, plancher ajouré */
    const hU = yU(xUe) + STOP, xb = xUe - P / 2;
    const butees = [0, 1].flatMap(s => {
      const z0 = s ? Wt - T - e - 0.5 : 0, z1 = s ? Wt : T + e + 0.5, y0 = yU(xUe) - 1.5;
      return [k.box(P, hU, T, xb, hU / 2, s ? Wt - T / 2 : T / 2),
        k.box(P, hU - y0, z1 - z0, xb, (hU + y0) / 2, (z0 + z1) / 2)];
    });
    const hS = yL(b) + FIN, sortie = k.box(P, hS, Wt, b - P / 2, hS / 2, Wt / 2);
    const x0 = xu - 1, x1 = b - P + 0.5, l = W - 16, r = l / 2, xa = xu + 12 + r, xz = b - P - 12 - r;
    const fente = [...arcPts(k, xz, 0, r, -90, 90), ...arcPts(k, xa, 0, r, 90, 270)];
    const plancher = k.ext([[x0, -W / 2 - 0.5], [x1, -W / 2 - 0.5], [x1, W / 2 + 0.5], [x0, W / 2 + 0.5]], SOL, xz > xa ? [fente] : [])
      .rotateX(Math.PI / 2).translate(0, SOL / 2, Wt / 2);

    return k.join(tambour, ...flasques, ...rampes, ...butees, sortie, plancher);
  });
}, {
  solides: 1,
  /* Repère de construction : dessous en y = 0, tambour à gauche (x = 0), flasques de z = 0 à 3 et de W + 3 à W + 6.
     Écartement mesuré dans le tambour, à mi-hauteur. */
  cotes: v => {
    const { W, xu, cy } = geo(v), en = [xu - 5, cy, T + W / 2];
    return [
      { nom: "écartement des flasques (longueur d'œuf + 4 mm)", axe: "y", en, mesure: "largeur", selon: "z", attendu: W },
      { nom: "longueur du distributeur", axe: "y", en, mesure: "boite", selon: "x", attendu: v.b }];
  }
});
})();
