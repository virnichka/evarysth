/* Modèle 3D « support-casque » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
EVARYSTH.viewer3d.define("support-casque", ({ m, arc, sideClamp }) => {
  return m((k, { a }) => k.join(
    sideClamp(k, a, 40, 5, 25),
    k.box(5, 40, 25, -20, -a / 2 - 25, 0),
    k.ext(arc(25, 30, 180, 360), 25).translate(7.5, -a / 2 - 45, 0)));
}, { solides: 1 });
