/* Modèle 3D « organisateur-bureau-2 » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Organisateur de bureau repris du STL d'origine (assets/models/organisateur-bureau-2/corps.stl), chargé comme
   solide manifold : les modifications s'y font par union et soustraction de briques du kit.
   Repère du STL : Z vers le haut, X = largeur (250), Y = profondeur (140), socle en z = 0. */
EVARYSTH.viewer3d.define("organisateur-bureau-2", ({ m, fetchSTL }) => {
  const URL = "assets/models/organisateur-bureau-2/corps.stl";
  let corps = null;
  const model = m((k, v) => {
    const s = k.solid(k.fromGeometry(corps));
    return k.join(s.rotateX(-Math.PI / 2));  // Z vers le haut -> Y vers le haut (convention du viewer)
  });
  model.prepare = () => corps ? Promise.resolve() : fetchSTL(URL).then(g => { corps = g; });
  return model;
}, {
  solides: 1,
  /* Repère des pièces passées au join : STL tourné (Y vers le haut), x = largeur, z = -profondeur */
  cotes: () => [{ nom: "largeur hors tout (socle)", axe: "y", en: [128.49, 2, -120.88], mesure: "etendue", selon: "x", attendu: 250 }]
});
