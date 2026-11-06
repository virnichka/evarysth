/* Modèle 3D « separateurs-etagere » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = épaisseur de l'étagère, b = hauteur du séparateur */
MODULR.viewer3d.define("separateurs-etagere", ({ m, sideClamp }) => {
  return m((k, { a, b }) => k.join(
    sideClamp(k, a, 40, 4, 30),
    k.box(150, b, 4, 31, a / 2 + 4 + b / 2, 0)));
});
