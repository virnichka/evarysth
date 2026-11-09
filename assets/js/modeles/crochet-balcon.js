/* Modèle 3D « crochet-balcon » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
EVARYSTH.viewer3d.define("crochet-balcon", ({ m, overHook }) => {
  /* a = épaisseur de la main courante : ouverture a + jeu */
  return m((k, { a, jeu = 0 }) => overHook(k, a + jeu, 60, 15, 20));
}, {
  solides: 1,
  /* Repère de construction (overHook) : ouverture centrée en x, de y = 0 à 30, largeur 20 selon z */
  cotes: ({ a, jeu }) => [{ nom: "ouverture sur la main courante", axe: "z", en: [0, 15, 0], mesure: "largeur", selon: "x", attendu: a + jeu }]
});
