/* Modèle 3D « duo-plage » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = hauteur de la figurine (à partir du STL, mise à l'échelle uniforme) */
EVARYSTH.viewer3d.define("duo-plage", ({ sculpt }) => {
  /* Duo de plage : couple main dans la main sur un socle rond (Meshy AI), hauteur nominale 75,0 mm */
  const duo = sculpt("assets/models/duo-plage/duo.stl", 75.0);
  return duo;
}, {
  solides: 1,
  /* Doigts sculptés de la main libre plus fins que 1,2 mm (≈ 0,7 mm à 120 mm), sans rôle mécanique :
     0,8 mm = deux lignes d'une buse de 0,4 mm. Seuil 1,2 mm² : angle vif d'une arête sculptée, dont la perte
     croît avec l'échelle (≤ 0,9 mm² de 110 à 200 mm), pas une paroi fine */
  paroi: { min: 0.8, seuil: 1.2 },
  /* Mise à l'échelle uniforme : seule la cote hors tout compte */
  cotes: ({ a }) => [{ nom: "hauteur de la figurine", mesure: "boite", selon: "y", attendu: a }]
});
