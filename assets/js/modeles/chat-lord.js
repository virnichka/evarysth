/* Modèle 3D « chat-lord » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = hauteur du buste (à partir du STL, mise à l'échelle uniforme) */
EVARYSTH.viewer3d.define("chat-lord", ({ sculpt }) => {
  /* Chat Lord : buste, hauteur nominale 172,9 mm */
  const chat = sculpt("assets/models/chat-lord/chat.stl", 172.9);
  return chat;
}, {
  solides: 1,
  /* Mise à l'échelle uniforme : seule la cote hors tout compte */
  cotes: ({ a }) => [{ nom: "hauteur du buste", mesure: "boite", selon: "y", attendu: a }]
});
