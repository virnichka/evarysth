/* Modèle 3D « clips-cables » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = plateau, b = diamètre du câble */
EVARYSTH.viewer3d.define("clips-cables", ({ m, arc, sideClamp }) => {
  return m((k, { a, b }) => k.join(
    sideClamp(k, a, 20, 4, 12),
    k.ext(arc(b / 2, b / 2 + 2.5, 120, 420), 12).translate(-12, a / 2 + b / 2 + 5, 0)));
});
