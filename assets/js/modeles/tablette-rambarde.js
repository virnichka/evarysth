/* Modèle 3D « tablette-rambarde » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = épaisseur de la rambarde (ouverture a + jeu), b = largeur de la tablette */
EVARYSTH.viewer3d.define("tablette-rambarde", ({ m, uPts }) => {
  return m((k, { a, b, jeu = 0 }) => k.join(
    k.ext(uPts(a + jeu, 40, 6), 60),
    k.box(140, 8, b, 0, 50, 0)));
}, {
  solides: 1,
  /* Repère de construction : ouverture du U centrée en x, de y = 0 à 40 ; tablette de 140 mm (x) sur b (z) */
  cotes: ({ a, b, jeu }) => [
    { nom: "ouverture sur la rambarde", axe: "z", en: [0, 20, 0], mesure: "largeur", selon: "x", attendu: a + jeu },
    { nom: "largeur de la tablette", axe: "x", en: [65, 50, 0], mesure: "etendue", selon: "z", attendu: b }]
});
