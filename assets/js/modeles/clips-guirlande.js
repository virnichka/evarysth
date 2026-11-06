/* Modèle 3D « clips-guirlande » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
EVARYSTH.viewer3d.define("clips-guirlande", ({ m, arc }) => {
  return m((k, { a }) => k.join(
    k.ext(arc(a / 2, a / 2 + 3, 40, 320), 10),
    k.ext(arc(2.5, 5, 120, 420), 10).translate(0, a / 2 + 7, 0)));
});
