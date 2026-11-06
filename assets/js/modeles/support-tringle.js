/* Modèle 3D « support-tringle » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = cadre, b = tringle */
EVARYSTH.viewer3d.define("support-tringle", ({ m, arc, uPts }) => {
  return m((k, { a, b }) => k.join(
    k.ext(uPts(a, 30, 5), 30),
    k.box(55, 8, 30, a / 2 + 32.5, 31, 0),
    k.ext(arc(b / 2, b / 2 + 5, 120, 420), 30).translate(a / 2 + 58 + b / 2, 31, 0)));
});
