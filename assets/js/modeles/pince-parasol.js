/* Modèle 3D « pince-parasol » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = rambarde, b = mât */
EVARYSTH.viewer3d.define("pince-parasol", ({ m, uPts }) => {
  return m((k, { a, b }) => k.join(
    k.ext(uPts(a, 40, 6), 50),
    k.cyl(b / 2 + 5, 50, b / 2).translate(a / 2 + b / 2 + 9, 23, 0)));
});
