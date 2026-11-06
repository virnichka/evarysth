/* Modèle 3D « dock-chargeur » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = largeur, b = épaisseur du chargeur */
EVARYSTH.viewer3d.define("dock-chargeur", ({ m, rect }) => {
  return m((k, { a, b }) => k.join(
    k.ext(rect(a + 8, b + 8), 70, [rect(a, b)]),
    k.box(a + 30, 3, 70, 0, b / 2 + 5.5, 0)));
});
