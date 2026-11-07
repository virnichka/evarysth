/* Modèle 3D « crochet-appui-tete » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Plaque de 3 mm reconstruite d'après le STL « rear seat multifunctional hook » (vue en position d'usage,
   le STL est imprimé tête en bas). En haut, une languette pliée vers l'arrière porte un œillet qui s'enfile
   sur une tige d'appui-tête ; la plaque pend contre le dos du siège. En bas, deux grands crochets (sacs,
   mousqueton) ; au milieu, deux petits crochets où se pose la tranche d'une tablette.
   a = diamètre de la tige d'appui-tête, b = épaisseur de la tablette (avec coque),
   c = distance entre l'axe de la tige et le dos du siège. Repère : Y vers le haut, crochets vers +Z. */
EVARYSTH.viewer3d.define("crochet-appui-tete", ({ m, circ, arc }) => {
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

  return m((k, { a, b, c }) => {
    const t = 3, H = 100, W = 110, cut = 30, ym = 45;
    const rh = (a + 1) / 2, R = Math.max(18, rh + 9);       // œillet : jeu de 1 mm sur la tige, paroi ≥ 9 mm
    /* Crochet en J (profil dans le plan profondeur/hauteur, extrudé sur la largeur w, centré en x) */
    const hook = (gap, y0, leg, w, x) => {
      const ri = gap / 2, ro = ri + t, zc = t + ri, yc = y0 + ro;
      return [
        k.ext(shift(arc(ri, ro, 180, 360), zc, yc), w),
        k.ext([[zc + ri, yc], [zc + ro, yc], [zc + ro, yc + leg], [zc + ri, yc + leg]], w),
        k.ext(circ(t / 2, zc + ri + t / 2, yc + leg, 20), w)          // bout arrondi
      ].map(g => g.rotateY(-Math.PI / 2).translate(x, 0, 0));
    };
    /* Plaque vue de face : deux bras, corps, évasement vers la languette */
    const flare = Array.from({ length: 9 }, (_, i) => {
      const s = i / 8, e = (1 - Math.cos(Math.PI * s)) / 2;
      return [W / 2 - (W / 2 - R) * e, 64 + 16 * s];
    });
    const right = [[cut, 0], [W / 2, 0], ...flare, [R, H - 7]];
    const outline = [...right, ...right.slice().reverse().map(([x, y]) => [-x, y]), [-cut, ym], [cut, ym]];
    const radii = outline.map(([x, y]) => (y === 0 ? 3 : y === ym ? 5 : 0));
    const plate = k.ext(rounded(outline, radii), t).translate(0, 0, t / 2);
    /* Pli à 90° vers le siège, puis languette à œillet (plan horizontal) */
    const bend = k.ext(shift(arc(4, 4 + t, 0, 90, 12), -4, H - 7), 2 * R).rotateY(-Math.PI / 2);
    const tab = [[-R, -4], [R, -4], [R, -c], ...arc(R, R, 0, -180, 24).slice(1, 24).map(([x, y]) => [x, y - c]), [-R, -c]];
    const tongue = k.ext(tab, t, [circ(rh, 0, -c, 40)]).rotateX(Math.PI / 2).translate(0, H - t / 2, 0);
    return k.join(plate, bend, tongue,
      ...hook(15, 0, 12.5, W / 2 - cut, -(W / 2 + cut) / 2), ...hook(15, 0, 12.5, W / 2 - cut, (W / 2 + cut) / 2),
      ...hook(b, ym, 5, 20, -15), ...hook(b, ym, 5, 20, 15));
  });
});
