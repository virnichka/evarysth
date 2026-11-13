/* Modèle 3D « distributeur-oeufs-boucle » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   Forme d'origine du STL « eggs dispenser v21 », gardée telle quelle (allégée de 53 600 à 16 000 triangles,
   écart ≤ 0,1 mm) : deux bacs superposés reliés par une boucle, berceaux galbés de part et d'autre d'une fente
   centrale. Les œufs, couchés en travers, roulent dans le bac du haut vers la boucle (pente 2,5 %), font demi-tour
   et redescendent par le bac du bas jusqu'au bout relevé, à droite. Berceaux à la taille d'origine (œufs du
   commerce, calibres M à L) : ils entourent largement l'œuf, le jeu de la matière n'y change rien.
   Repère du fichier : X la longueur (boucle en x = 0), Y vers le haut (dessous en y = 0), Z la profondeur, centrée.
   a = longueur hors tout, redimensionnée « par zones » comme la boîte Rugged : seule la bande 57 < x < 183 (bacs
   droits) s'étire ; boucle, bouts et encoches sont translatés. Les fonds y restent plans : ils raccourcissent avec
   la bande, leur pente augmente un peu quand on raccourcit. */
EVARYSTH.viewer3d.define("distributeur-oeufs-boucle", ({ fetchSTL }) => {
  const URL = "assets/models/distributeur-oeufs-boucle/distributeur.stl";
  const L0 = 274.191, BX = [57, 183];
  let base = null, creases = null;
  const model = (T, v) => {
    const dx = v.a - L0, sx = (BX[1] - BX[0] + dx) / (BX[1] - BX[0]);
    const out = base.slice();
    for (let i = 0; i < out.length; i += 3) {
      const x = out[i];
      out[i] = x > BX[1] ? x + dx : x > BX[0] ? BX[0] + (x - BX[0]) * sx : x;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(out, 3));
    const r = creases(g, Math.PI / 6); g.dispose();   // ombrage lisse sur les galbes, arêtes vives au-delà de 30°
    return r.translate(-v.a / 2, 0, 0);
  };
  model.prepare = () => base ? Promise.resolve() : Promise.all([fetchSTL(URL), import("three/addons/utils/BufferGeometryUtils.js")])
    .then(([g, { toCreasedNormals }]) => { base = g.attributes.position.array.slice(); creases = toCreasedNormals; });
  return model;
}, {
  solides: 1,
  /* Repère final : centré en x (longueur a), dessous en y = 0, centré en z. Fente du bac bas mesurée à mi-longueur,
     3 mm au-dessus du dessous. */
  cotes: ({ a }) => [
    { nom: "longueur du distributeur", axe: "y", en: [0, 3, 0], mesure: "boite", selon: "x", attendu: a },
    { nom: "profondeur hors tout", axe: "y", en: [0, 3, 0], mesure: "boite", selon: "z", attendu: 73.37 },
    { nom: "fente du bac bas", axe: "x", en: [0, 3, 0], mesure: "largeur", selon: "z", attendu: 27.5 }]
});
