/* Modèle 3D « support-telephone » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = épaisseur du téléphone (fente entre la butée et le dossier) */
EVARYSTH.viewer3d.define("support-telephone", ({ m }) => {
  return m((k, { a }) => k.join(
    k.box(a + 66, 6, 70, (a + 66) / 2, 3, 0),
    k.box(6, 20, 70, 3, 10, 0),
    k.box(6, 100, 70).rotateZ(-0.4).translate(a - 10.5, 52, 0)));
});
