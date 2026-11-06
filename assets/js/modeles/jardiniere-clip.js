/* Modèle 3D « jardiniere-clip » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = épaisseur de rambarde (ouverture de la pince) */
EVARYSTH.viewer3d.define("jardiniere-clip", ({ m, uPts }) => {
  return m((k, { a }) => k.join(
    k.ext(uPts(a, 40, 6), 40),
    k.box(6, 126, 40, a / 2 + 3, -17, 0),
    k.box(76, 6, 40, a / 2 + 38, -77, 0),
    k.box(6, 24, 40, a / 2 + 73, -65, 0)));
});
