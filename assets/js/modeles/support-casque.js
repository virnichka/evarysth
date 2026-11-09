/* Modèle 3D « support-casque » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
EVARYSTH.viewer3d.define("support-casque", ({ m, arc, sideClamp }) => {
  /* a = épaisseur du plateau : pince ouverte de a + jeu */
  return m((k, { a, jeu = 0 }) => {
    const A = a + jeu;
    return k.join(
      sideClamp(k, A, 40, 5, 25),
      k.box(5, 41, 25, -20, -A / 2 - 24.5, 0),    // noyé de 1 mm dans la pince (union franche)
      k.ext(arc(25, 30, 180, 360), 25).translate(7.5, -A / 2 - 45, 0));
  });
}, {
  solides: 1,
  /* Repère de construction : pince ouverte vers +x (cavité x de -40 à 0, centrée en y), largeur 25 selon z */
  cotes: ({ a, jeu }) => [{ nom: "pince sur le plateau", axe: "z", en: [-20, 0, 0], mesure: "largeur", selon: "y", attendu: a + jeu }]
});
