/* Modèle 3D « pince-sac-verseur » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   Reconstruction paramétrique (base : une pince à sac avec bec, librement redessinée). Trois pièces + l'axe :
   - deux bras à plat (12 mm de haut), fermés l'un contre l'autre (fente de 0,4 mm pour le film du sac), qui enserrent
     le bas du bec dans une poche en goutte ; charnière à clipser (axe à tête conique sur le bras A, bague ouverte sur
     le bras B), crochet à rampe au bout du bras B qui retient la pointe du bras A ;
   - le bec : manchon en goutte (dans le sac, sa pointe ramène le film à plat le long des bras), collerette posée sur
     les bras, goulot Ø intérieur 25 mm à filetage 2 filets au pas de 28 mm : le bouchon se ferme en un quart de tour ;
   - le bouchon strié, montré fermé.
   a = largeur du sac à plat (mm) : le film fait le tour de la goutte, le reste est pincé entre les bras ; la longueur
   de serrage (pointe de la goutte → crochet) vaut a − demi-périmètre de la goutte + 6 mm de marge.
   Repère de construction : axe du bec en x = z = 0, Y vers le haut, bras selon +x (charnière en x = XH), fente des
   bras dans le plan z = 0 (bras A côté +z) ; dessus des bras à y = −0,3, collerette à partir de y = 0. */
EVARYSTH.viewer3d.define("pince-sac-verseur", ({ m }) => {
  const G = 0.4, W = 9, H0 = -12.3, H1 = -0.3;          // fente, largeur et hauteur des bras
  const XH = -32, RP = 3.5, YK = -7.0;                   // axe de charnière, rayon de l'axe, dessus du nœud du bras A
  const RM = 15, T = 36, RT = 12.5;                      // goutte : rayon, distance de la pointe, passage Ø 25
  const C = 0.6, TP = 3.2;                               // jeu et épaisseur du crochet de fermeture
  const LEAD = 28, PAS = LEAD / 2, RR = 14.5, PROF = 1.5, JF = 0.5;   // filetage 2 filets ; JF : jeu radial bouchon
  const YF1 = 15.5, YB0 = 8.9, YB1 = 15.9;   // haut du goulot (filets dès la collerette) ; filets du bouchon (quart de tour : 7 mm / 28)

  /* Goutte (points [x, v], v = −z : profil du plan des bras, extrudé selon Y par prisme) */
  const alpha = Math.acos(RM / T), nArc = Math.ceil(RM * (2 * Math.PI - 2 * alpha) / 0.45);
  const goutte = [[T, 0], ...Array.from({ length: nArc + 1 }, (_, i) => {
    const t = alpha + (2 * Math.PI - 2 * alpha) * i / nArc; return [RM * Math.cos(t), RM * Math.sin(t)];
  })];
  const demiPerimetre = Math.sqrt(T * T - RM * RM) + RM * (Math.PI - alpha);
  const rond = (r, n = Math.max(32, Math.ceil(2 * Math.PI * r / 0.45))) =>
    Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]);
  /* Profil des dents, période 180° (un pas de 14 mm) : creux 8 mm, flancs à 45° (1,5 mm), sommet 3 mm ;
     sommets exacts aux cassures, arcs à corde ≤ 0,8 mm (surface d'aspect, aucune cote mesurée) */
  const BR = [[0, 0], [4, 0], [5.5, 1], [8.5, 1], [10, 0], [14, 0]];
  const filet = j => {
    const pts = [];
    for (let per = 0; per < 2; per++) for (let i = 0; i < BR.length - 1; i++) {
      const [u0, f0] = BR[i], [u1, f1] = BR[i + 1], a0 = Math.PI * (per + u0 / PAS), a1 = Math.PI * (per + u1 / PAS);
      const r0 = RR + PROF * f0 + j, n = f0 === f1 ? Math.max(1, Math.ceil(r0 * (a1 - a0) / 0.8)) : 1;
      for (let q = 0; q < n; q++) {
        const th = a0 + (a1 - a0) * q / n, r = r0 + PROF * (f1 - f0) * q / n;
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
      }
    }
    return pts;
  };

  return m((k, { a, jeu = 0 }) => {
    const CS = k.CrossSection, tmp = [], t = o => { tmp.push(o); return o; };
    const sec = cs => ({ isSection: true, cs });
    const poly = (...contours) => t(new CS(contours, "EvenOdd"));
    const rect = (x0, x1, z0, z1) => poly([[x0, -z0], [x1, -z0], [x1, -z1], [x0, -z1]]);
    const disque = (r, x = 0, z = 0) => t(CS.circle(r, Math.max(32, Math.ceil(2 * Math.PI * r / 0.45)))).translate([x, -z]);
    const u = (...l) => t(CS.union(l)), moins = (p, ...l) => t(p.subtract(u(...l))), inter = (p, q) => t(p.intersect(q));
    /* Prisme vertical (y0 → y1) d'un profil du plan des bras ; tw : torsion (degrés) pour les filets */
    const prisme = (cs, y0, y1, tw = 0) => k.solid(cs.extrude(y1 - y0, tw ? Math.ceil(Math.abs(tw) / 8) : 0, tw, [1, 1], false))
      .rotateX(-Math.PI / 2).translate(0, y0, 0);
    const vitesse = 360 / LEAD;   // degrés par mm de hauteur
    const helice = (cs, y0, y1) => prisme(t(cs.rotate(vitesse * y0)), y0, y1, vitesse * (y1 - y0));

    const E = 0.4 + jeu;                                  // film du sac + jeu autour du manchon
    const Lc = a - demiPerimetre + 6, LA = T + Lc - C, xP = LA + C, xQ = xP + TP, zT = G / 2 + W + 5;
    const poche = k.offset(goutte, E).cs, renflement = k.offset(goutte, E + 4.5).cs;
    const d8 = disque(8, XH), d9 = disque(9, XH);
    const blend = s => k.conge(sec(s), 10, { convexes: false }).cs;

    /* Bras A (côté +z) : nœud bas de charnière + axe à tête conique */
    const planA = k.conge(sec(blend(u(rect(XH, LA, G / 2, G / 2 + W), inter(renflement, rect(-30, 60, G / 2, 30))))),
      1.5, { concaves: false }).cs;
    const brasA = [
      prisme(moins(planA, poche, d8), H0, H1),
      prisme(u(disque(7.5, XH), inter(planA, d9)), H0, YK),
      k.rev([[0, YK - 0.5], [RP, YK - 0.5], [RP, 0.1], [5, 1.6], [0, 1.6]]).translate(XH, 0, 0)
    ];
    /* Bras B (côté −z) : bague ouverte (fente de 6,6 mm vers l'extérieur, se clipse sur l'axe Ø 7) + crochet */
    const corpsB = blend(u(rect(XH, xQ, -(G / 2 + W), -G / 2), inter(renflement, rect(-30, 60, -30, -G / 2))));
    const levre = poly([[LA - 1.6, -9.6], [xP + 0.1, -9.6], [xP + 0.1, -13.2], [LA - 1.6, -11.1]]);
    const planB = k.conge(sec(u(corpsB, rect(xP, xQ, -(G / 2 + W), zT), levre, disque(TP / 2, xP + TP / 2, zT))),
      0.8, { concaves: false }).cs;
    const s = Math.SQRT1_2, n = [s, -s], d = [-s, -s], o = [XH, 0], at = (l, m) => [o[0] + 3.3 * l * n[0] + m * d[0], -(o[1] + 3.3 * l * n[1] + m * d[1])];
    const fente = poly([at(-1, 0), at(1, 0), at(1, 12), at(-1, 12)]);
    const brasB = [
      prisme(moins(planB, poche, d8), H0, H1),
      prisme(moins(u(disque(7.5, XH), inter(planB, d9)), fente, disque(RP + jeu + 0.1, XH)), YK + 0.4, H1)
    ];
    /* Bec : manchon en goutte, collerette Ø 36 chanfreinée à 45° vers le goulot, filets */
    const bec = [
      prisme(poly(goutte, rond(RT)), -14.8, 0.2),
      k.rev([[RT, 0], [18, 0], [18, 1.6], [RR - 0.3, 5.4], [RR - 0.3, YF1], [RT, YF1]]),
      helice(poly(filet(0), rond(RR - 0.6, 48)), 3.4, YF1 - 0.3)
    ];
    /* Bouchon strié : jupe à 24 côtes, dessus chanfreiné, filets intérieurs */
    const stries = Array.from({ length: 192 }, (_, i) => {
      const th = 2 * Math.PI * i / 192, r = 19.4 + 0.45 * (1 + Math.cos(24 * th)); return [r * Math.cos(th), r * Math.sin(th)];
    });
    const rf = RR + PROF + JF;
    const bouchon = [
      prisme(poly(stries, rond(rf + 0.3, 128)), 6, YB1 + 0.1),
      k.rev([[0, YB1], [19.4, YB1], [19.4, 17.6], [18.6, 18.4], [0, 18.4]]),
      helice(poly(rond(rf + 0.6, 48), filet(JF)), YB0, YB1 + 0.1)
    ];

    /* Chaque pièce : union de ses briques ; les quatre pièces, disjointes, sont réunies par compose (même résultat
       qu'une union, sans le coût du booléen entre pièces imbriquées), puis centrées comme le fait join */
    const pieces = [brasA, brasB, bec, bouchon].map(l => k.Manifold.union(l.map(x => x.mf)));
    const r = k.solid(k.Manifold.compose(pieces)).center();
    pieces.forEach(x => x.delete());
    for (const x of tmp) x.delete();
    return r;
  });
}, {
  solides: 4,   // bras A (avec l'axe), bras B, bec, bouchon (montés : pince fermée, bouchon vissé)
  /* Repère de construction : voir l'en-tête (bec en x = z = 0, fente des bras dans z = 0) */
  cotes: ({ a }) => {
    const RM = 15, T = 36, alpha = Math.acos(RM / T), Lc = a - (Math.sqrt(T * T - RM * RM) + RM * (Math.PI - alpha)) + 6;
    return [
      { nom: "passage du bec (goulot)", axe: "y", en: [0, 12, 0], mesure: "trou", attendu: 25 },
      { nom: "passage du bec (manchon)", axe: "y", en: [0, -6, 0], mesure: "trou", attendu: 25 },
      { nom: "longueur de serrage (pointe du bec → crochet)", axe: "y", en: [T + Lc / 2, -6, 0], mesure: "largeur", selon: "x", attendu: Lc },
      { nom: "fente entre les bras fermés", axe: "y", en: [T + Lc / 2, -6, 0], mesure: "largeur", selon: "z", attendu: 0.4 }
    ];
  }
});
