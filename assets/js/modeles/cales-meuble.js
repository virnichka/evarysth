/* Modèle 3D « cales-meuble » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = épaisseur de la cale (cale en fer à cheval) */
MODULR.viewer3d.define("cales-meuble", ({ m, uPts }) => {
  return m((k, { a }) => k.join(k.ext(uPts(12, 35, 14), a).rotateX(Math.PI / 2)));
});
