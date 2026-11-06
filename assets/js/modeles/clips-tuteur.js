/* Modèle 3D « clips-tuteur » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = diamètre du tuteur, petit anneau fixe pour la tige */
MODULR.viewer3d.define("clips-tuteur", ({ m, arc }) => {
  return m((k, { a }) => k.join(
    k.ext(arc(a / 2, a / 2 + 2.5, 40, 320), 12),
    k.ext(arc(5, 7.5, -140, 140), 12).translate(-a / 2 - 9, 0, 0)));
});
