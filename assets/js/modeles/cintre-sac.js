/* Modèle 3D « cintre-sac » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre de la tringle. Profil repris du STL (cintre à sac) : crochet sur la tringle,
   voile de 10 mm sur une face, barre courbe de 50 mm où se pose la bretelle. */
EVARYSTH.viewer3d.define("cintre-sac", ({ m, circ, arc }) => {
  return m((k, { a }) => {
    const t = 7, ri = a / 2 + 0.5, ro = ri + t, c = 13, W = 50;
    const half = [[0, -25], [4.5, -25.3], [6.9, -25.7], [10.3, -26.5], [12.6, -27.2], [15.9, -28.6], [18, -29.7],
      [17.9, -30.5], [17.6, -31.3], [16.9, -32.6], [16.3, -33.3], [15.2, -34.1], [14.3, -34.5], [12.9, -34.8],
      [12, -34.8], [10.9, -34.6], [8.8, -33.9], [6.7, -33.3], [3.6, -32.7], [1.4, -32.5], [0, -32.5]];
    const bar = [...half.slice(0, -1).map(([x, y]) => [-x, y]).reverse(), ...half.slice(1, -1).map(([x, y]) => [x, y])].reverse();
    const curve = [[-11, 0], [-10.8, -2.8], [-10.2, -5.8], [-9.2, -8.8], [-7.7, -11.8], [-5.5, -14.8], [-2.4, -17.8],
      [2.7, -20.8], [7.7, -22.2], [13.2, -23.8], [16.2, -25.2], [18, -27]];
    const web = [[-ro, c], [-ri, c],
      ...curve.map(([x, y], i) => [x + (11 - ri) * (1 - i / (curve.length - 1)), y]),
      [18, -29.7], [-ro, -29.7]];
    return k.join(
      k.ext(arc(ri, ro, 0, 180).map(([x, y]) => [x, y + c]), W),
      k.box(t, c - 3.5, W, -ri - t / 2, (c + 3.5) / 2, 0),
      k.box(t, 8.5, W, ri + t / 2, c - 4.25, 0),
      k.ext(circ(t / 2, ri + t / 2, c - 8.5, 24), W),
      k.ext(web, 10).translate(0, 0, -(W - 10) / 2),
      k.ext(bar, W));
  });
}, { solides: 1 });
