/* Modèle 3D « organiseur-bureau » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = longueur */
EVARYSTH.viewer3d.define("organiseur-bureau", ({ m, tray }) => {
  return m((k, { a }) => k.join(...tray(k, a, 80, 40, Math.max(2, Math.round(a / 80)), 1)));
});
