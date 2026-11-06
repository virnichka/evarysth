/* Modèle 3D « poignee-meuble » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = entraxe des vis */
EVARYSTH.viewer3d.define("poignee-meuble", ({ m }) => {
  return m((k, { a }) => k.join(
    k.cyl(6, a + 30).rotateZ(Math.PI / 2).translate(0, 28, 0),
    k.cyl(5, 28).translate(-a / 2, 14, 0),
    k.cyl(5, 28).translate(a / 2, 14, 0)));
});
