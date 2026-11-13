/* Modèle 3D « distributeur-oeufs-boucle » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define).
   Forme d'origine du STL « eggs dispenser v21 », gardée telle quelle (allégée de 53 600 à 16 000 triangles,
   écart ≤ 0,1 mm) : deux bacs superposés reliés par une boucle, berceaux galbés de part et d'autre d'une fente
   centrale. Les œufs, couchés en travers, roulent dans le bac du haut vers la boucle (pente 2,5 %), font demi-tour
   et redescendent par le bac du bas jusqu'au bout relevé, à droite.
   Repère du fichier : X la longueur (boucle en x = 0), Y vers le haut (dessous en y = 0), Z la profondeur, centrée.
   Redimensionnement « par zones », comme la boîte Rugged : on n'étire que des bandes sans détail.
   - b = longueur hors tout : bande 57 < x < 183 (bacs droits seulement ; boucle, bouts et encoches translatés).
     Les fonds y restent plans : ils raccourcissent avec la bande, leur pente augmente un peu quand on raccourcit.
   - a = longueur des œufs (+ jeu) : bande centrale |z| < 11,5, dans la fente ; les berceaux gardent leur forme et
     s'écartent. Le fichier d'origine correspond à des œufs de 60 mm. */
EVARYSTH.viewer3d.define("distributeur-oeufs-boucle", ({ fetchSTL }) => {
  const URL = "assets/models/distributeur-oeufs-boucle/distributeur.stl";
  const NOM = { a: 60, b: 274.191 }, BX = [57, 183], BZ = 11.5;
  let base = null, creases = null;
  const model = (T, v) => {
    const dx = v.b - NOM.b, dz = (v.a + (v.jeu || 0) - NOM.a - 0.3) / 2;   // 0,3 : jeu du PETG, compris dans le fichier
    const sx = (BX[1] - BX[0] + dx) / (BX[1] - BX[0]), sz = (BZ + dz) / BZ;
    const out = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i], z = base[i + 2];
      out[i] = x > BX[1] ? x + dx : x > BX[0] ? BX[0] + (x - BX[0]) * sx : x;
      out[i + 1] = base[i + 1];
      out[i + 2] = z > BZ ? z + dz : z < -BZ ? z - dz : z * sz;
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(out, 3));
    const r = creases(g, Math.PI / 6); g.dispose();   // ombrage lisse sur les galbes, arêtes vives au-delà de 30°
    return r.translate(-(v.b) / 2, 0, 0);
  };
  model.prepare = () => base ? Promise.resolve() : Promise.all([fetchSTL(URL), import("three/addons/utils/BufferGeometryUtils.js")])
    .then(([g, { toCreasedNormals }]) => { base = g.attributes.position.array.slice(); creases = toCreasedNormals; });
  return model;
}, {
  solides: 1,
  /* Repère final : centré en x (longueur b), dessous en y = 0, centré en z. Fente du bac bas mesurée à mi-longueur,
     3 mm au-dessus du dessous (27,5 mm d'origine, élargie comme les œufs). */
  cotes: ({ a, b, jeu }) => [
    { nom: "longueur du distributeur", axe: "y", en: [0, 3, 0], mesure: "boite", selon: "x", attendu: b },
    { nom: "profondeur hors tout", axe: "y", en: [0, 3, 0], mesure: "boite", selon: "z", attendu: 73.37 + a + jeu - 60.3 },
    { nom: "fente du bac bas", axe: "x", en: [0, 3, 0], mesure: "largeur", selon: "z", attendu: 27.5 + a + jeu - 60.3 }]
});
