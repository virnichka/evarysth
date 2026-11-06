/* Modèle 3D « pinces-nappe » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = épaisseur du plateau de table */
MODULR.viewer3d.define("pinces-nappe", ({ m, sideClamp }) => {
  return m((k, { a }) => k.join(sideClamp(k, a, 25, 4, 20), k.box(4, a + 16, 20, -31, 0, 0)));
});
