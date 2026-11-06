/* Modèle 3D « penderie-etagere » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = étagère, b = barre */
EVARYSTH.viewer3d.define("penderie-etagere", ({ m, arc, sideClamp }) => {
  return m((k, { a, b }) => k.join(
    sideClamp(k, a, 50, 5, 25),
    k.box(5, 60, 25, -30, -a / 2 - 35, 0),
    k.ext(arc(b / 2, b / 2 + 5, 30, 330), 25).translate(-30, -a / 2 - 65 - b / 2 - 3, 0)));
});
