/* Modèle 3D « tablette-rambarde » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = rambarde, b = largeur de la tablette */
MODULR.viewer3d.define("tablette-rambarde", ({ m, uPts }) => {
  return m((k, { a, b }) => k.join(
    k.ext(uPts(a, 40, 6), 60),
    k.box(140, 8, b, 0, 50, 0)));
});
