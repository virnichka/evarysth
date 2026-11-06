/* Modèle 3D « goulotte-cable » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = épaisseur du plateau, b = longueur */
EVARYSTH.viewer3d.define("goulotte-cable", ({ m, uPts, sideClamp }) => {
  return m((k, { a, b }) => k.join(
    sideClamp(k, a, 30, 4, b),
    k.ext(uPts(60, 50, 4), b).rotateZ(Math.PI).translate(20, -a / 2 - 4, 0)));
});
