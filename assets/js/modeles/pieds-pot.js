/* Modèle 3D « pieds-pot » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = hauteur sous le pot */
MODULR.viewer3d.define("pieds-pot", ({ m }) => {
  return m((k, { a }) => k.join(k.ext([[0, 0], [50, 0], [50, a], [20, a], [20, a + 10], [0, a + 10]], 35)));
});
