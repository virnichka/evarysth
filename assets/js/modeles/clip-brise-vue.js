/* Modèle 3D « clip-brise-vue » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du barreau */
EVARYSTH.viewer3d.define("clip-brise-vue", ({ m, arc }) => {
  return m((k, { a }) => k.join(
    k.ext(arc(a / 2, a / 2 + 3, 40, 320), 14),
    k.box(22, 3, 14, -a / 2 - 12, 0, 0)));
});
