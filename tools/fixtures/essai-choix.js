/* Modèle de test du paramètre choix (tools/test/choix.test.mjs), hors catalogue : socle de a × 6 × 40 mm (cote) et,
   dessus, un plot selon l'option b : « cube » (14 mm), « cylindre » (Ø 16 mm) ou « aucun ». */
EVARYSTH.viewer3d.define("essai-choix", ({ m }) => m((k, { a, b }) => {
  const socle = k.box(a, 6, 40, 0, 3, 0);
  if (b === "cube") return k.join(socle, k.box(14, 14, 14, 0, 12.5, 0));
  if (b === "cylindre") return k.join(socle, k.cyl(8, 14).translate(0, 12.5, 0));
  return socle;
}), {
  solides: 1,
  cotes: ({ a, b }) => [
    { nom: "largeur du socle", axe: "z", en: [0, 3, 0], mesure: "etendue", selon: "x", attendu: a },
    ...(b === "aucun" ? [] : [{ nom: "plot", axe: "y", en: [0, 12, 0], mesure: b === "cube" ? "largeur" : "diametre", selon: "x", attendu: b === "cube" ? 14 : 16 }])]
});
