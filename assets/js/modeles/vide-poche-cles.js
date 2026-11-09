/* Modèle 3D « vide-poche-cles » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Reconstruit d'après le STL « cles_orga » : dosseret de 4 mm qui s'enroule en haut (rayon 30 mm) en une
   tablette avançant de 39 mm, d'où pendent des crochets en J au pas de 20 mm ; en bas, un bac de 12,5 mm
   de haut (parois de 4 mm, coins avant arrondis) qui sert de pied.
   a = largeur, b = profondeur du bac, c = hauteur totale. Le nombre de crochets suit la largeur.
   Repère : Y vers le haut, X la largeur, Z vers l'avant (dos en z = 0). */
EVARYSTH.viewer3d.define("vide-poche-cles", ({ m, circ, arc }) => {
  const shift = (pts, du, dv) => pts.map(([u, v]) => [u + du, v + dv]);
  /* Contour du bac vu de dessus (x, z) : dos droit, coins avant de rayon r */
  const footprint = (w, d, r) => [
    [-w / 2, 0], [w / 2, 0],
    ...shift(arc(r, r, 0, 90, 12).slice(0, 13), w / 2 - r, d - r),
    ...shift(arc(r, r, 90, 180, 12).slice(0, 13), -w / 2 + r, d - r)
  ];
  /* Profil (z, y) extrudé sur la largeur w, centré en x */
  const side = (k, pts, w, x = 0) => k.ext(pts, w).rotateY(-Math.PI / 2).translate(x, 0, 0);

  return m((k, { a, b, c }) => {
    const t = 4, R = 30, D = 39, hT = 12.5, fl = 3, wall = 4;
    /* Dosseret + arrondi + tablette, d'une seule pièce */
    const ob = arc(R, R, 90, 180, 16).slice(0, 17).map(([z, y]) => [z + R, y + c - R]);   // extérieur
    const ib = arc(R - t, R - t, 180, 90, 16).slice(0, 17).map(([z, y]) => [z + R, y + c - R]);
    const back = [[0, 0], [t, 0], ...ib, [D, c - t], [D, c], ...ob];
    /* Crochet en J : tige contre l'avant de la tablette, boucle vers l'avant, bout arrondi */
    const ri = 3.5, ro = ri + t, zc = D - t + ro, yc = c - 28 + ro;
    const hookPts = [
      side(k, [[D - t, yc], [D, yc], [D, c - 1], [D - t, c - 1]], 6),
      side(k, shift(arc(ri, ro, 180, 360, 20), zc, yc), 6),
      side(k, [[zc + ri, yc], [zc + ro, yc], [zc + ro, yc + 4], [zc + ri, yc + 4]], 6),
      side(k, circ(t / 2, zc + ri + t / 2, yc + 4, 20), 6)
    ];
    const n = Math.max(2, Math.floor((a - 14) / 20) + 1);
    const hooks = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * 20)
      .flatMap(x => hookPts.map(g => g.clone().translate(x, 0, 0)));
    hookPts.forEach(g => g.dispose());
    /* Bac : fond plein + paroi périphérique */
    const r = Math.min(20, a / 3, b / 3);
    const outer = footprint(a, b, r), inner = footprint(a - 2 * wall, b - 2 * wall, r - wall).map(([x, z]) => [x, z + wall]);
    const floor = k.ext(outer, fl).rotateX(Math.PI / 2).translate(0, fl / 2, 0);
    const rim = k.ext(outer, hT, [inner]).rotateX(Math.PI / 2).translate(0, hT / 2, 0);
    return k.join(side(k, back, a), floor, rim, ...hooks);
  });
}, {
  solides: 1,
  /* Aucun ajustement sur un objet du client : cotes hors tout. Repère de construction : sol en y = 0, dos en z = 0 */
  cotes: ({ a, b, c }) => [
    { nom: "largeur", axe: "y", en: [0, 6, 0], mesure: "etendue", selon: "x", attendu: a },
    { nom: "profondeur du bac", axe: "y", en: [0, 6, 0], mesure: "etendue", selon: "z", attendu: b },
    { nom: "hauteur totale", mesure: "boite", selon: "y", attendu: c }]
});
