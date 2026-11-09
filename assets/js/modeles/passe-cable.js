/* Modèle 3D « passe-cable » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du trou du plateau (= diamètre extérieur du fût). Deux pièces voulues : la bague (collerette + fût)
   et le couvercle amovible, encoché pour laisser sortir les câbles. Le couvercle repose sur un épaulement intérieur
   (1 mm d'appui, jeu de 0,5 mm au rayon et 0,3 mm dessous), affleurant au dessus de la collerette. */
EVARYSTH.viewer3d.define("passe-cable", ({ m, arc }) => {
  return m((k, { a }) => {
    const rc = a / 2 - 3.5, h = 4, x0 = a * 0.025;          // couvercle : rayon, demi-largeur et fond de l'encoche
    const th = Math.asin(h / rc) * 180 / Math.PI, bord = arc(rc, rc, th, 360 - th);
    const couvercle = [...bord.slice(0, bord.length / 2), [x0, -h], [x0, h]];
    /* Bague d'un seul tenant, profil [rayon, hauteur] tourné autour de l'axe : fût (y de -19,5 à -1,5, Ø a),
       collerette (y de -1,5 à 1,5, Ø a + 16), alésage Ø a - 6, épaulement (y de -2,5 à -0,8, Ø a - 9) */
    const ri = a / 2 - 3;
    const bague = k.rev([[ri, -19.5], [a / 2, -19.5], [a / 2, -1.5], [a / 2 + 8, -1.5], [a / 2 + 8, 1.5], [ri, 1.5],
      [ri, -0.8], [ri - 1.5, -0.8], [ri - 1.5, -2.5], [ri, -2.5]]);
    return k.join(bague, k.ext(couvercle, 2).rotateX(Math.PI / 2).translate(0, 0.5, 0));
  });
}, { solides: 2 });
