/* Modèle 3D « crochet-appui-tete-double » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Variante à deux tiges du « crochet-appui-tete » : même plaque de 3 mm (deux grands crochets en bas, deux petits
   crochets pour la tranche d'une tablette), mais la languette à œillet devient une barre symétrique posée sur le haut
   du dossier. Ses deux extrémités se relèvent vers le dos du siège (en « lèvres ») : chaque tige d'appui-tête
   s'appuie contre le bord de la barre, à l'intérieur de sa lèvre. Plus d'œillet : on pose la pièce sans sortir
   l'appui-tête.
   a = écartement extérieur des tiges (bord extérieur d'une tige au bord extérieur de l'autre ; lèvres : a + 1 mm + jeu),
   b = épaisseur de la tablette (avec coque ; petits crochets : b + jeu),
   c = distance du dos du siège au bord avant de la tige (côté pare-brise ; la barre se place à c + 1 mm + jeu).
   Repère : Y vers le haut, crochets vers +Z, barre vers −Z (comme crochet-appui-tete). */
EVARYSTH.viewer3d.define("crochet-appui-tete-double", ({ m, circ, arc }) => {
  /* Polygone aux angles arrondis (rayon r, ou r[i] par sommet) */
  const rounded = (pts, r, n = 6) => pts.flatMap((p, i) => {
    const ri = Array.isArray(r) ? r[i] : r;
    if (!ri) return [p];
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
    const u = (q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); const k = Math.min(d, l / 2) / l; return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; };
    const s = u(a, ri), e = u(b, ri);
    return Array.from({ length: n + 1 }, (_, j) => {
      const t = j / n, w = 1 - t;
      return [w * w * s[0] + 2 * w * t * p[0] + t * t * e[0], w * w * s[1] + 2 * w * t * p[1] + t * t * e[1]];
    });
  });
  const shift = (pts, du, dv) => pts.map(([u, v]) => [u + du, v + dv]);

  return m((k, { a, b, c, jeu = 0 }) => {
    const t = 3, H = 100, W = 110, cut = 30, ym = 45;
    const R = 20;                          // demi-largeur du pli, au départ de la barre
    const tl = 8, hl = 18, wa = 14;        // lèvre : épaisseur et hauteur (vers le siège) ; barre : largeur
    const xi = (a + 1 + jeu) / 2;          // face intérieure des lèvres, de part et d'autre de l'axe
    const zr = -(c + 1 + jeu);             // bord de la barre contre lequel s'appuient les tiges
    /* Crochet en J (profil dans le plan profondeur/hauteur, extrudé sur la largeur w, centré en x) */
    const hook = (gap, y0, leg, w, x) => {
      const ri = gap / 2, ro = ri + t, zc = t + ri, yc = y0 + ro;
      return [
        k.ext(shift(arc(ri, ro, 180, 360), zc, yc), w),
        k.ext([[zc + ri, yc], [zc + ro, yc], [zc + ro, yc + leg], [zc + ri, yc + leg]], w),
        k.ext(circ(t / 2, zc + ri + t / 2, yc + leg, 20), w)          // bout arrondi
      ].map(g => g.rotateY(-Math.PI / 2).translate(x, 0, 0));
    };
    /* Plaque vue de face : deux bras, corps, évasement vers le pli */
    const flare = Array.from({ length: 9 }, (_, i) => {
      const s = i / 8, e = (1 - Math.cos(Math.PI * s)) / 2;
      return [W / 2 - (W / 2 - R) * e, 64 + 16 * s];
    });
    const right = [[cut, 0], [W / 2, 0], ...flare, [R, H - 7]];
    const outline = [...right, ...right.slice().reverse().map(([x, y]) => [-x, y]), [-cut, ym], [cut, ym]];
    const radii = outline.map(([x, y]) => (y === 0 ? 3 : y === ym ? 5 : 0));
    const plate = k.ext(rounded(outline, radii), t).translate(0, 0, t / 2);
    /* Pli à 90° vers le siège, puis barre à lèvres (plan horizontal, profil en (x, z)) */
    const bend = k.ext(shift(arc(4, 4 + t, 0, 90, 12), -4, H - 7), 2 * R).rotateY(-Math.PI / 2);
    const half = [[R, -4], [R, zr], [xi, zr], [xi, zr + hl], [xi + tl, zr + hl], [xi + tl, zr - wa]];
    const bar = [...half, ...half.slice().reverse().map(([x, z]) => [-x, z])];
    const barR = [0, 8, 3, tl / 2, tl / 2, 3];
    const bone = k.ext(rounded(bar, [...barR, ...barR.slice().reverse()]), t).rotateX(Math.PI / 2).translate(0, H - t / 2, 0);
    return k.join(plate, bend, bone,
      ...hook(15, 0, 12.5, W / 2 - cut, -(W / 2 + cut) / 2), ...hook(15, 0, 12.5, W / 2 - cut, (W / 2 + cut) / 2),
      ...hook(b + jeu, ym, 5, 20, -15), ...hook(b + jeu, ym, 5, 20, 15));
  });
}, {
  solides: 1,
  /* Repère de construction : plaque en z de 0 à 3, crochets vers +z, barre vers −z à la hauteur y = H = 100 */
  cotes: ({ a, b, c, jeu }) => [
    { nom: "écart des lèvres (tiges)", axe: "y", en: [(20 + (a + 1 + jeu) / 2) / 2, 98.5, -(c + 1 + jeu) + 10], mesure: "largeur", selon: "x", attendu: (a + 1 + jeu) / 2 - 20 },
    { nom: "largeur de la barre", axe: "y", en: [(20 + (a + 1 + jeu) / 2) / 2, 98.5, -(c + 1 + jeu) - 7], mesure: "largeur", selon: "z", attendu: 14 },
    { nom: "largeur hors tout", axe: "x", en: [0, 98.5, -(c + 1 + jeu) - 7], mesure: "boite", selon: "x", attendu: a + 1 + jeu + 16 },
    ...[-15, 15].map(x => ({ nom: `petit crochet x = ${x} (tablette)`, axe: "x", en: [x, 48 + (b + jeu) / 2, 3 + (b + jeu) / 2], mesure: "trou", attendu: b + jeu }))]
});
