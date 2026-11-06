/* Modèle 3D « enrouleur-mural » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* Enrouleur mural, d'après le G-code « garden hose holder » : tout tient dans un secteur
   de 64° autour de l'axe de la selle (R 120). a = largeur d'enroulement, b = Ø du tuyau ou de la corde.
   Repère : y vers le haut, mur en z = 0, axe de la selle en (0, -R). */
MODULR.viewer3d.define("enrouleur-mural", ({ m, rad, circ, arc }) => {
  return m((k, { a, b }) => {
    const R = 120, A = 32, tp = 9, tl = 9, L = Math.max(20, 2.4 * b), cy = -R, Z = tp + a;
    const at = (r, d) => [r * Math.cos(rad(d)), cy + r * Math.sin(rad(d))];
    const band = (ri, ro, d0, d1) => k.ext(arc(ri, ro, 90 + d0, 90 + d1, 24), 1);
    const piece = (g, z0, z1) => g.scale(1, 1, z1 - z0).translate(0, cy, (z0 + z1) / 2);
    /* fenêtre en arc à bouts ronds (plaque murale) */
    const slot = (rm, rc, d0, d1) => {
      const c = d => at(rm, d), p = [];
      for (let i = 0; i <= 12; i++) p.push(at(rm + rc, d0 + (d1 - d0) * i / 12));
      for (let i = 0; i <= 10; i++) { const o = c(d1), t = rad(d1 + 180 * i / 10); p.push([o[0] + rc * Math.cos(t), o[1] + rc * Math.sin(t)]); }
      for (let i = 12; i >= 0; i--) p.push(at(rm - rc, d0 + (d1 - d0) * i / 12));
      for (let i = 0; i <= 10; i++) { const o = c(d0), t = rad(180 + d0 + 180 * i / 10); p.push([o[0] + rc * Math.cos(t), o[1] + rc * Math.sin(t)]); }
      return p;
    };
    const sector = (ri, ro, ch) => [...Array.from({ length: 33 }, (_, i) => at(ro, 90 - A + ch + (2 * A - 2 * ch) * i / 32)),
      at(ro - 3 * ch, 90 + A), ...Array.from({ length: 33 }, (_, i) => at(ri, 90 + A - 2 * A * i / 32)), at(ro - 3 * ch, 90 - A)];
    /* plaque murale : bande r 117→199, deux fenêtres, deux trous de vis Ø5 en haut */
    const plate = k.ext(sector(R - 3, R + 79, 3), tp, [slot(R + 45, 14, 69, 79), slot(R + 45, 14, 101, 111),
      circ(2.6, ...at(R + 70, 90 - 14), 20), circ(2.6, ...at(R + 70, 90 + 14), 20)]).translate(0, 0, tp / 2);
    /* selle : dessus cylindrique R 120, dessous qui s'épaissit vers l'avant (10 → 45 mm), percée de lumières */
    const ri = z => R - 10 - 35 * z / Z;
    const n = Math.max(1, Math.round((a - 12) / 26)), p = (a - 12) / n, cuts = [];
    for (let i = 0; i < n; i++) { const c = tp + 6 + p * (i + 0.5); cuts.push([c - 7, c + 7]); }
    const saddle = [], solid = (z0, z1) => {
      const m = Math.max(1, Math.ceil((z1 - z0) / 10));
      for (let j = 0; j < m; j++) { const u = z0 + (z1 - z0) * j / m, w = z0 + (z1 - z0) * (j + 1) / m;
        saddle.push(piece(band(ri((u + w) / 2), R, -A, A), u, w)); }
    };
    let z = 0;
    cuts.forEach(([c0, c1]) => {
      solid(z, c0);
      [[-A, -25], [-17, -11], [-3, 3], [11, 17], [25, A]].forEach(([d0, d1]) => saddle.push(piece(band(ri((c0 + c1) / 2), R, d0, d1), c0, c1)));
      z = c1;
    });
    solid(z, Z + 1);
    /* joue avant : bande r 55 → R + L, coins chanfreinés, un trou Ø12 en haut */
    const lip = k.ext(sector(R - 65, R + L, 3), tl, [circ(6, ...at(R + L * 0.55, 90), 24)]).translate(0, 0, Z + tl / 2);
    return k.join(plate, ...saddle, lip);
  });
});
