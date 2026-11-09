/* Modèle 3D « equerre » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Équerre en L : a = 1re branche, b = 2e branche, c = largeur de la pièce, cotes hors tout exactes.
   Profil cœur en L (paroi 5 mm, congé de 4 mm dans l'angle intérieur), grossi de 0,8 mm et arêtes arrondies
   au même rayon (k.extArrondi) : le cœur est raccourci de 2 × 0,8 mm pour que chaque branche mesure a (ou b). */
EVARYSTH.viewer3d.define("equerre", ({ m }) => {
  const t = 5, bevel = 0.8; // épaisseur du profil cœur (paroi finie : 6,6 mm), rayon des arêtes (mm)
  return m((k, v) => {
    const a = Math.max(v.a, t * 2) - 2 * bevel, b = Math.max(v.b, t * 2) - 2 * bevel, r = Math.min(4, a - t, b - t);
    const L = k.conge([[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]], r, { convexes: false });
    return k.join(k.extArrondi(L, v.c, bevel));
  });
}, {
  solides: 1,
  /* Repère de construction : angle extérieur du cœur en (0, 0), branches selon +x (a) et +y (b), largeur selon z */
  cotes: ({ a, b, c }) => [
    { nom: "1re branche (hors tout)", axe: "z", en: [0, 3, 0], mesure: "etendue", selon: "x", attendu: a },
    { nom: "2e branche (hors tout)", axe: "z", en: [3, 0, 0], mesure: "etendue", selon: "y", attendu: b },
    { nom: "largeur de la pièce", axe: "x", en: [3, 3, 0], mesure: "etendue", selon: "z", attendu: c }]
});
