/* Modèle 3D « taquets-etagere » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = diamètre de la tige */
MODULR.viewer3d.define("taquets-etagere", ({ m }) => {
  return m((k, { a }) => k.join(
    k.cyl(a / 2, 10).rotateZ(Math.PI / 2).translate(-5, 0, 0),
    k.box(3, 22, 14, 1.5, 0, 0),
    k.box(20, 4, 14, 10, 9, 0)));
});
