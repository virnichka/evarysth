/* Modèle 3D « organisateur-bureau-2 » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Organisateur de bureau repris du STL d'origine (assets/models/organisateur-bureau-2/corps.stl), chargé comme
   solide manifold : les modifications s'y font par union et soustraction de briques du kit.
   Repère du STL : Z vers le haut, X = largeur (250), Y = profondeur (140), socle en z = 0. */
EVARYSTH.viewer3d.define("organisateur-bureau-2", ({ m, fetchSTL, circ }) => {
  const URL = "assets/models/organisateur-bureau-2/corps.stl";
  let corps = null;
  const model = m((k, v) => {
    const s = k.solid(k.fromGeometry(corps));
    /* 1. Rainure du plateau à lunettes comblée : la rainure (face avant du mur arrière, z 73,5 → 84, x > 98)
       recevait le plateau amovible. On la remplit avec une tranche du mur pris juste dessous (z 61 → 73),
       remontée de 12 mm : même profil, arrondi du bout droit compris. */
    const tranche = k.solid(s.mf.intersect(k.box(158, 11, 12, 175.5, 185.88, 67).mf)).translate(0, 0, 12);
    /* 2. Coussin de montre : barre ovale (32 de profondeur × 46 de haut, bouts arrondis) devant le bras,
       sur 56 mm de large ; le bracelet s'enroule autour du coussin et du bras, le cadran vient sur sa face avant.
       Profil dans le plan (Y, Z) extrudé selon X : rotation propre (x→y, y→z, z→x). */
    const OV = { y: 174.88, z: 163, ry: 16, rz: 23, x: 190, l: 56 };
    const ovale = Array.from({ length: 128 }, (_, i) => {
      const t = 2 * Math.PI * i / 128;
      return [OV.y + OV.ry * Math.cos(t), OV.z + OV.rz * Math.sin(t)];
    });
    const coussin = k.extArrondi(ovale, OV.l, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(OV.x, 0, 0);
    /* 3. Bac à écouteurs : étui posé debout contre le mur, sous le coussin de montre. Intérieur 72 × 32 (étuis
       AirPods, Galaxy Buds, Bose, Sony, Pixel Buds), parois 3 mm, fond à 15 mm au-dessus du vide-poche (z 8).
       Côtés 28 mm, façade 20 mm avec creux pour les doigts ; fente de câble de 5 mm dans le fond et la façade.
       Deux nervures à 45° sous les côtés : le fond s'imprime en pont, sans support. */
    const B = { x: 190, li: 72, pi: 32, e: 3, mur: 180.88, bas: 23 }, haut = B.bas + B.e + 28, hautF = B.bas + B.e + 20;
    const av = B.mur - B.pi - B.e, L = B.li + 2 * B.e;
    /* Profil dans le plan (Y, Z) extrudé selon X sur la longueur l, centré en x */
    const selonX = (pts, l, x) => k.ext(pts, l).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(x, 0, 0);
    const plein = k.box(L, B.mur + 0.1 - av, haut - B.bas, B.x, (av + B.mur + 0.1) / 2, (B.bas + haut) / 2);
    const creux = [
      k.box(B.li, B.pi + 2, 40, B.x, B.mur - B.pi / 2 + 1, B.bas + B.e + 20),           // intérieur (le mur ferme l'arrière)
      k.box(L + 2, B.e + 2, 20, B.x, av + B.e / 2, hautF + 10),                         // façade abaissée
      k.ext(circ(12, B.x, hautF), B.e + 2).rotateX(Math.PI / 2).translate(0, av + B.e / 2, 0),  // creux pour les doigts
      k.box(5, B.pi * 0.7 + B.e + 1, B.e + 2, B.x, av + (B.pi * 0.7 + B.e) / 2 - 0.5, B.bas + B.e / 2),  // fente du fond
      k.box(5, B.e + 2, 40, B.x, av + B.e / 2, B.bas + 20)                              // fente de la façade
    ];
    const bac = k.solid(creux.reduce((a, c) => a.subtract(c.mf), plein.mf));
    const nervure = [[av, B.bas + 0.1], [B.mur + 0.1, B.bas + 0.1], [B.mur + 0.1, 7], [av + B.bas - 7, 7]];
    const nervures = [-1, 1].map(c => selonX(nervure, B.e, B.x + c * (B.li + B.e) / 2));
    return k.join([s, tranche, coussin, bac, ...nervures].map(p => p.rotateX(-Math.PI / 2)));  // Z vers le haut -> Y vers le haut (viewer)
  });
  model.prepare = () => corps ? Promise.resolve() : fetchSTL(URL).then(g => { corps = g; });
  return model;
}, {
  solides: 1,
  /* Repère des pièces passées au join : STL tourné (Y vers le haut), x = largeur, z = -profondeur */
  cotes: () => [{ nom: "largeur hors tout (socle)", axe: "y", en: [128.49, 2, -120.88], mesure: "etendue", selon: "x", attendu: 250 }]
});
