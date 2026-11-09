/* Modèle 3D « voiture-voronoi » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = longueur de la voiture (à partir du STL, mise à l'échelle uniforme) */
EVARYSTH.viewer3d.define("voiture-voronoi", ({ sculpt }) => {
  /* Voiture de sport ajourée (motif Voronoï), STL allégé à 80 000 triangles,
     dimensions nominales 139,4 × 67,0 × 42,2 mm (longueur × largeur × hauteur). */
  const L0 = 139.4, H0 = 42.2;
  const base = sculpt("assets/models/voiture-voronoi/voiture.stl", H0);
  /* sculpt() se règle par la hauteur : on convertit la longueur choisie en hauteur équivalente */
  /* … puis demi-tour pour présenter l'avant à la caméra */
  const model = (T, v) => base(T, { ...v, a: v.a * H0 / L0 }).rotateY(Math.PI);
  model.smooth = base.smooth;
  model.prepare = base.prepare;
  return model;
}, {
  solides: 1,
  cotes: ({ a }) => [{ nom: "longueur de la voiture", mesure: "boite", selon: "z", attendu: a }],
  /* Nervures Voronoï : 0,8 mm au moins (deux passes de buse de 0,4 mm) ; 1,2 mm n'est pas tenu sous 140 mm de long.
     Coupes rasantes d'une surface organique : éclats jusqu'à 2,7 mm², d'où le seuil de 3 mm² */
  paroi: { min: 0.8, seuil: 3 }
});
