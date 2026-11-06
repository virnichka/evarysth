/* Modèle 3D « passe-cable » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du trou */
EVARYSTH.viewer3d.define("passe-cable", ({ m, circ, rect }) => {
  return m((k, { a }) => k.join(
    k.cyl(a / 2 + 8, 3, a / 2 - 3),
    k.cyl(a / 2, 18, a / 2 - 3).translate(0, -10.5, 0),
    k.ext(circ(a / 2 - 3.5), 2, [rect(a * 0.35, 8, a * 0.2, 0)]).rotateX(Math.PI / 2).translate(0, 0.5, 0)));
});
