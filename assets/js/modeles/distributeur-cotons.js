/* Modèle 3D « distributeur-cotons » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   Reconstruction paramétrique d'après le STL d'origine (assets/models/distributeur-cotons/) :
   tube à disques avec fente frontale en U + pot à cotons-tiges accolé, raccord arrondi.
   a = diamètre des disques de coton, b = hauteur du distributeur, c = hauteur du pot. */
EVARYSTH.viewer3d.define("distributeur-cotons", ({ m, rad }) => {
  const T = 3, FLOOR = 3, RC = 26, RF = 8;           // paroi, fond, rayon ext. du pot, congé du raccord
  const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  /* Arc de a0 à a1 (radians), n segments par tour, extrémités incluses */
  const arcPts = (cx, cy, r, a0, a1, per = 96) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (2 * Math.PI) * per));
    return Array.from({ length: n + 1 }, (_, i) => pt(cx, cy, r, a0 + (a1 - a0) * i / n));
  };
  /* Retire les points confondus (jonctions d'arcs, fermeture) */
  const clean = pts => pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  return m((k, { a, b, c }) => {
    const ri = a / 2 + 2.5, ro = ri + T;              // tube : jeu de 2,5 mm autour des disques
    const d = ro + RC - 12;                           // entraxe tube / pot (recouvrement 12 mm)
    const w = Math.min(28, Math.max(18, 0.42 * a));   // largeur de la fente
    /* Raccord arrondi entre les deux cercles extérieurs */
    const p = ro + RF, q = RC + RF, fx = (d * d + p * p - q * q) / (2 * d), fy = Math.sqrt(p * p - fx * fx);
    const th1 = Math.atan2(fy, fx), th2 = Math.atan2(fy, fx - d);
    const fa1 = Math.atan2(-fy, -fx), fa2 = Math.atan2(-fy, d - fx); // directions depuis le centre du congé (haut)
    /* Contour extérieur (tube + pot), sens trigo ; la fente (angle -90°) est une encoche de demi-largeur s */
    const outline = s => {
      const pts = [];
      if (s > 0) {
        const doo = Math.asin(s / ro), di = Math.asin(s / ri), mid = rad(270);
        pts.push(...arcPts(0, 0, ro, th1, mid - doo));
        pts.push(...arcPts(0, 0, ri, mid - di, mid + di - 2 * Math.PI));
        pts.push(...arcPts(0, 0, ro, mid + doo, 2 * Math.PI - th1));
      } else pts.push(...arcPts(0, 0, ro, th1, 2 * Math.PI - th1));
      pts.push(...arcPts(fx, -fy, RF, -fa1, -fa2, 48));             // congé bas
      pts.push(...arcPts(d, 0, RC, -th2, th2));                      // pot
      pts.push(...arcPts(fx, fy, RF, fa2, fa1, 48));                 // congé haut
      return pts;
    };
    /* Tube seul (au-dessus du pot) */
    const tubeOnly = s => {
      const doo = Math.asin(s / ro), di = Math.asin(s / ri), mid = rad(270);
      return [...arcPts(0, 0, ro, mid + doo - 2 * Math.PI, mid - doo), ...arcPts(0, 0, ri, mid - di, mid + di - 2 * Math.PI)];
    };
    /* Cavité du pot : intérieur du pot moins le tube (cloison = paroi du tube) */
    const rci = RC - T, ix = (d * d + ro * ro - rci * rci) / (2 * d), iy = Math.sqrt(ro * ro - ix * ix);
    const gc = Math.atan2(iy, ix - d), gt = Math.atan2(iy, ix);
    const cupHole = clean([...arcPts(d, 0, rci, -gc, gc), ...arcPts(0, 0, ro, gt, -gt)]);
    const tubeHole = arcPts(0, 0, ri, 0, 2 * Math.PI).slice(0, -1);
    const layer = (pts0, z0, z1, holes = []) => k.ext(clean(pts0), z1 - z0, holes).translate(0, 0, (z0 + z1) / 2).rotateX(-Math.PI / 2);
    const zs = FLOOR + 3, r = w / 2, N = 14, parts = [];
    parts.push(layer(outline(0), 0, FLOOR));                                  // fond plein
    parts.push(layer(outline(0), FLOOR, zs, [tubeHole, cupHole]));            // sous la fente
    /* Fond de fente arrondi : petits secteurs de paroi empilés, de part et d'autre de la fente */
    const mid = rad(270), sector = (s, sg) => {
      const A = [...arcPts(0, 0, ro, mid + sg * Math.asin(r / ro), mid + sg * Math.asin(s / ro), 24),
        ...arcPts(0, 0, ri, mid + sg * Math.asin(s / ri), mid + sg * Math.asin(r / ri), 24)];
      return sg < 0 ? A : A.reverse();
    };
    for (let i = 0; i < N; i++) {
      const z0 = zs + r * i / N, z1 = zs + r * (i + 1) / N, h = r - (z0 + z1) / 2 + zs;
      const sw = Math.sqrt(Math.max(0, r * r - h * h));
      if (r - sw > 0.05) parts.push(layer(sector(sw, -1), z0, z1), layer(sector(sw, 1), z0, z1));
    }
    parts.push(layer(outline(r), zs, c, [cupHole]));                     // hauteur du pot
    parts.push(layer(tubeOnly(r), c, b));                                     // tube seul
    return k.join(...parts).rotateY(0.55);              // fente tournée vers la vue par défaut
  });
}, { solides: 1 });
