/* Modèle 3D « support-portable » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = épaisseur de l'ordinateur (largeur de la fente) */
MODULR.viewer3d.define("support-portable", ({ m }) => {
  return m((k, { a }) => k.join(
    k.box(a + 60, 12, 90, 0, 6, 0),
    k.box(15, 60, 90, -a / 2 - 7.5, 42, 0),
    k.box(15, 60, 90, a / 2 + 7.5, 42, 0)));
});
