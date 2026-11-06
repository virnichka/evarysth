/* Modèle 3D « support-tuyau » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
MODULR.viewer3d.define("support-tuyau", ({ m, arc, uPts }) => {
  return m((k, { a }) => k.join(
    k.ext(uPts(a, 40, 6), 50),
    k.box(6, 86, 50, a / 2 + 3, 3, 0),
    k.ext(arc(55, 63, 180, 360), 50).translate(a / 2 + 59, -40, 0)));
});
