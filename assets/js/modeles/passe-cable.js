/* Modèle 3D « passe-cable » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = diamètre du trou du plateau ; le fût y entre avec le jeu de la matière (Ø a − jeu). Deux pièces voulues : la bague (collerette + fût)
   et le couvercle amovible, encoché pour laisser sortir les câbles. Le couvercle repose sur un épaulement intérieur
   (1 mm d'appui, jeu de 0,5 mm au rayon et 0,3 mm dessous), affleurant au dessus de la collerette. */
EVARYSTH.viewer3d.define("passe-cable", ({ m, arc }) => {
  return m((k, { a, jeu = 0 }) => {
    const rc = a / 2 - 3.5, h = 4, x0 = a * 0.025;          // couvercle : rayon, demi-largeur et fond de l'encoche
    const th = Math.asin(h / rc) * 180 / Math.PI, bord = arc(rc, rc, th, 360 - th);
    const couvercle = [...bord.slice(0, bord.length / 2), [x0, -h], [x0, h]];
    /* Bague d'un seul tenant, profil [rayon, hauteur] tourné autour de l'axe : fût (y de -19,5 à -1,5, Ø a - jeu),
       collerette (y de -1,5 à 1,5, Ø a + 16), alésage Ø a - 6, épaulement (y de -2,5 à -0,8, Ø a - 9) */
    const ri = a / 2 - 3, rf = (a - jeu) / 2;
    const bague = k.rev([[ri, -19.5], [rf, -19.5], [rf, -1.5], [a / 2 + 8, -1.5], [a / 2 + 8, 1.5], [ri, 1.5],
      [ri, -0.8], [ri - 1.5, -0.8], [ri - 1.5, -2.5], [ri, -2.5]]);
    return k.join(bague, k.ext(couvercle, 2).rotateX(Math.PI / 2).translate(0, 0.5, 0));
  });
}, {
  solides: 2,
  /* Repère de construction : axe du fût = Y, dessus de la collerette en y = 1,5 */
  cotes: ({ a, jeu }) => [
    { nom: "fût dans le trou du plateau (Ø a − jeu)", axe: "y", en: [0, -10, 0], mesure: "diametre", attendu: a - jeu },
    { nom: "passage des câbles", axe: "y", en: [0, -10, 0], mesure: "trou", attendu: a - 6 },
    { nom: "collerette qui cache le bord du trou", axe: "y", en: [0, 0, 0], mesure: "diametre", attendu: a + 16 }]
});
