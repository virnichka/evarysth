/* Modèle 3D « organiseur-tiroir » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = largeur, b = profondeur du tiroir */
EVARYSTH.viewer3d.define("organiseur-tiroir", ({ m, tray }) => {
  return m((k, { a, b }) => k.join(...tray(k, a, b, 50, Math.max(2, Math.round(a / 120)), Math.max(2, Math.round(b / 140)))));
}, { solides: 1 });
