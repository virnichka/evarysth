/* Modèle 3D « embouts-pieds » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du pied */
EVARYSTH.viewer3d.define("embouts-pieds", ({ m }) => {
  return m((k, { a }) => k.join(
    k.cyl(a / 2 + 5, 4).translate(0, 2, 0),
    k.cyl(a / 2 + 3, 16, a / 2).translate(0, 12, 0)));
});
