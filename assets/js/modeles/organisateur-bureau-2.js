/* Modèle 3D « organisateur-bureau-2 » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Organisateur de bureau repris du STL d'origine (assets/models/organisateur-bureau-2/corps.stl), chargé comme
   solide manifold : les modifications s'y font par union et soustraction de briques du kit.
   Repère du STL : Z vers le haut, X = largeur (250), Y = profondeur (140), socle en z = 0. */
EVARYSTH.viewer3d.define("organisateur-bureau-2", ({ m, fetchSTL, circ }) => {
  const URL = "assets/models/organisateur-bureau-2/corps.stl";
  let corps = null;
  const model = m((k, v) => {
    const s = k.solid(k.fromGeometry(corps));
    /* Axe commun du coussin de montre et du bac à écouteurs : milieu du vide-poche (parois intérieures x 109 et fx(247)) */
    const X0 = Math.round((109 + fx(247)) / 2);
    /* 1. Rainure du plateau à lunettes comblée : la rainure (face avant du mur arrière, z 73,5 → 84, x > 98)
       recevait le plateau amovible. On la remplit avec une tranche du mur pris juste dessous (z 61 → 73),
       remontée de 12 mm : même profil, arrondi du bout droit compris. */
    const tranche = k.solid(s.mf.intersect(k.box(fx(256) - 97, 11, 12, (fx(256) + 97) / 2, 185.88, 67).mf)).translate(0, 0, 12);
    /* 2. Coussin de montre : barre ovale (32 de profondeur × 46 de haut, bouts arrondis) devant le bras,
       sur 56 mm de large ; le bracelet s'enroule autour du coussin et du bras, le cadran vient sur sa face avant.
       Profil dans le plan (Y, Z) extrudé selon X : rotation propre (x→y, y→z, z→x). */
    const OV = { y: 174.88, z: 163, ry: 16, rz: 23, x: X0, l: 44 };
    const ovale = Array.from({ length: 128 }, (_, i) => {
      const t = 2 * Math.PI * i / 128;
      return [OV.y + OV.ry * Math.cos(t), OV.z + OV.rz * Math.sin(t)];
    });
    const coussin = k.extArrondi(ovale, OV.l, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(OV.x, 0, 0);
    /* 3. Bac à écouteurs : étui posé debout contre le mur, sous le coussin de montre. Intérieur 72 × 32 (étuis
       AirPods, Galaxy Buds, Bose, Sony, Pixel Buds), parois 3 mm, fond à 15 mm au-dessus du vide-poche (z 8).
       Côtés 28 mm, façade 20 mm avec creux pour les doigts ; fente de câble de 5 mm dans le fond et la façade.
       Deux nervures à 45° sous les côtés : le fond s'imprime en pont, sans support. */
    const B = { x: X0, li: 72, pi: 32, e: 3, mur: 180.88, bas: 23 }, haut = B.bas + B.e + 28, hautF = B.bas + B.e + 20;
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
    /* 4. Câble des écouteurs, comme celui du téléphone : rainure sous le socle (10 × 5 mm) depuis l'arrière,
       puis trou vertical (10 × 12) dans le fond du vide-poche, sous la fente du bac ; le câble monte de 15 mm
       à l'air libre entre les nervures et entre dans le bac par la fente du fond. */
    const cable = [k.box(10, 192 - 150, 6, B.x, (150 + 192) / 2, 2), k.box(10, 12, 10, B.x, 156, 4)];
    const corpsPerce = k.solid(cable.reduce((a, c) => a.subtract(c.mf), s.mf));
    return k.join([corpsPerce, tranche, coussin, bac, ...nervures].map(p => p.rotateX(-Math.PI / 2)));  // Z vers le haut -> Y vers le haut (viewer)
  });
  /* Largeur réduite de 50 mm : deux bandes sans détail (coupe identique sur toute leur largeur, vérifiée sur le STL)
     sont comprimées, le reste est translaté. Bande 1 : x 111 → 138 (fond du vide-poche, mur), -24 mm ;
     bande 2 : x 156 → 223 (vide-poche, mur, bras de montre et sa fente), -26 mm. Largeur 250 → 200 mm. */
  const BANDES = [[111, 138, 24], [156, 223, 26]];
  const fx = x => BANDES.reduce((d, [a, b, w]) => d - (x >= b ? w : x > a ? w * (x - a) / (b - a) : 0), x);
  model.prepare = () => corps ? Promise.resolve() : fetchSTL(URL).then(g => {
    corps = g.clone();
    const p = corps.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, fx(p.getX(i)));
  });
  return model;
}, {
  solides: 1,
  /* Repère des pièces passées au join : STL tourné (Y vers le haut), x = largeur, z = -profondeur */
  cotes: () => [{ nom: "largeur hors tout (socle)", axe: "y", en: [103.49, 2, -120.88], mesure: "etendue", selon: "x", attendu: 200 }]
});
