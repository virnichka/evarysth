/* Modèle 3D « carapuce » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = hauteur de la figurine (à partir du STL, mise à l'échelle uniforme) */
EVARYSTH.viewer3d.define("carapuce", ({ sculpt }) => {
  /* Carapuce : figurine (Bambu MakerLab « Image to 3D »), hauteur nominale 61,0 mm */
  const carapuce = sculpt("assets/models/carapuce/carapuce.stl", 61.0);
  return carapuce;
}, { solides: 1 });
