/* Modèle 3D « organisateur-bureau-2 » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Organisateur de bureau repris du STL d'origine (assets/models/organisateur-bureau-2/corps.stl), chargé comme
   solide manifold : les modifications s'y font par union et soustraction de briques du kit.
   Repère du STL : Z vers le haut, X = largeur (250), Y = profondeur (140), socle en z = 0. */
EVARYSTH.viewer3d.define("organisateur-bureau-2", ({ m, fetchSTL }) => {
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
    return k.join([s, tranche, coussin].map(p => p.rotateX(-Math.PI / 2)));  // Z vers le haut -> Y vers le haut (viewer)
  });
  model.prepare = () => corps ? Promise.resolve() : fetchSTL(URL).then(g => { corps = g; });
  return model;
}, {
  solides: 1,
  /* Repère des pièces passées au join : STL tourné (Y vers le haut), x = largeur, z = -profondeur */
  cotes: () => [{ nom: "largeur hors tout (socle)", axe: "y", en: [128.49, 2, -120.88], mesure: "etendue", selon: "x", attendu: 250 }]
});
