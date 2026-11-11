/* Modèle 3D « support-accessoires-aspirateur » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Reconstruit d'après le STL « dyson supletorio » : tablette murale à claire-voie de 25 mm de haut, trois anneaux
   de 27 mm où l'on enfile l'embout des accessoires d'un aspirateur balai, deux vis horizontales dans le dos.
   a = diamètre extérieur de l'embout des accessoires (anneau : Ø a + jeu), b = longueur du support,
   c = distance du mur à l'axe des anneaux. Anneaux également répartis, celui du milieu en x = 0.
   Chaque anneau est fendu à l'avant sur toute sa hauteur (14 mm) : le bouton de déverrouillage de l'accessoire
   y passe (dans le STL : une cuvette de 1,45 mm dans la paroi, que l'embout devait franchir en forçant).
   Repère : Y vers le haut (0 = dessous), X la longueur, dos contre le mur en z = 0, anneaux vers +z. */
EVARYSTH.viewer3d.define("support-accessoires-aspirateur", ({ m, circ, rect }) => {
  const H = 25, HA = 27, T = 3.45, FENTE = 14, DOS = 5, NERF = 3.5, VIS = 4.5, TOURNEVIS = 9;
  const geo = ({ a, b, c, jeu = 0 }) => {
    const ri = (a + jeu) / 2, ro = ri + T, s = (b - 2 * ro) / 2;   // s : entraxe des anneaux
    const zb = c - ri - 0.5;                                        // face avant de la barre (hors de l'alésage)
    return { ri, ro, s, zb, zm: (DOS + zb) / 2 - NERF };              // zm : arrière de la lisse intermédiaire, centrée
  };
  /* Profil vu de dessus (x, z) extrudé sur la hauteur h à partir de y0 */
  const dessus = (k, pts, h, y0 = 0) => k.ext(pts, h).rotateX(Math.PI / 2).translate(0, y0 + h / 2, 0);
  /* Lisse vue de face (x, y), épaisseur e, face arrière en z0, percée aux vis */
  const lisse = (k, L, e, z0, r, xs) => k.ext(rect(L, H, 0, H / 2), e, xs.map(x => circ(r, x, H / 2))).translate(0, 0, z0 + e / 2);

  return m((k, v) => {
    const { b, c } = v, { ri, ro, s, zb, zm } = geo(v), xs = [-s, 0, s], vis = [-s / 2, s / 2];
    /* Anneau fendu sur toute sa hauteur (fente de FENTE mm côté intérieur), d'une seule révolution : bord du haut
       arrondi à l'extérieur (r = 1,5) et chanfreiné à l'intérieur (1 mm) pour guider l'embout */
    const arr = Array.from({ length: 7 }, (_, i) => {
      const f = Math.PI / 2 * i / 6;
      return [ro - 1.5 + 1.5 * Math.cos(f), HA - 1.5 + 1.5 * Math.sin(f)];
    });
    const anneau = k.rev([[ri, 0], [ro, 0], ...arr, [ri + 1, HA], [ri, HA - 1]], 360 - 2 * Math.asin(FENTE / 2 / ri) * 180 / Math.PI)
      .translate(0, 0, c);
    const anneaux = xs.map(x => anneau.clone().translate(x, 0, 0));
    /* Joues : du dos jusqu'à l'anneau d'extrémité, dont elles épousent le galbe (recouvrement 0,3 mm) */
    const joue = sg => {
      const cx = sg * s, x0 = sg * (b / 2 - 0.3), x1 = sg * (b / 2 - 5.3), rr = ro - 0.3;
      const f0 = Math.acos((ro - 5.3) / rr), n = 24;
      const galbe = Array.from({ length: n + 1 }, (_, i) => {
        const f = f0 * (1 - i / n);
        return [cx + sg * rr * Math.cos(f), c - rr * Math.sin(f)];
      });
      return dessus(k, [[x0, 0], [x1, 0], ...galbe], H);
    };
    return k.join(
      ...anneaux,
      lisse(k, b - 0.6, DOS, 0, VIS / 2, vis),                         // dos vissé au mur
      lisse(k, b - 2, NERF, zm, TOURNEVIS / 2, vis),                    // lisse intermédiaire (passage du tournevis)
      lisse(k, 2 * s, NERF, zb - NERF, TOURNEVIS / 2, vis),             // barre qui tient les anneaux
      ...xs.map(x => k.box(4, H, zb - DOS, x, H / 2, (DOS + zb) / 2 - 0.5)),   // nervures dans l'axe des anneaux
      joue(-1), joue(1));
  });
}, {
  solides: 1,
  /* Repère de construction : dessous en y = 0, dos en z = 0, anneau du milieu centré en x = 0, axe en z = c */
  cotes: ({ a, b, c, jeu }) => [
    { nom: "anneau autour de l'embout", axe: "y", en: [0, 4, c], mesure: "trou", attendu: a + jeu },
    { nom: "longueur du support", axe: "y", en: [0, 4, c], mesure: "boite", selon: "x", attendu: b },
    /* Saillie : axe des anneaux à c du mur, avant de l'anneau au bord de la fente (faces radiales) */
    { nom: "saillie (mur → bord avant de l'anneau)", axe: "y", en: [0, 4, c], mesure: "boite", selon: "z",
      attendu: c + ((a + jeu) / 2 + 3.45) * Math.cos(Math.asin(7 / ((a + jeu) / 2))) }]
});
