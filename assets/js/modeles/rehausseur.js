/* Modèle 3D « rehausseur » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du pied, b = hauteur ajoutée */
EVARYSTH.viewer3d.define("rehausseur", ({ m }) => {
  return m((k, { a, b }) => k.join(
    k.cyl(a / 2 + 18, b - 12).translate(0, (b - 12) / 2, 0),
    k.cyl(a / 2 + 18, 12, a / 2).translate(0, b - 6, 0)));
});
