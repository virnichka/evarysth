/* Modèle 3D « support-manette » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
MODULR.viewer3d.define("support-manette", ({ m, uPts, sideClamp }) => {
  return m((k, { a }) => k.join(
    sideClamp(k, a, 40, 5, 30),
    k.box(5, 30, 30, -20, -a / 2 - 20, 0),
    k.ext(uPts(40, 20, 5), 30).rotateZ(Math.PI).translate(-20, -a / 2 - 12.5, 0)));
});
