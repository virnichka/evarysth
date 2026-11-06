/* Modèle 3D « equerre » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Équerre en L : a = 1re branche, b = 2e branche, c = largeur de la pièce. Paroi fixe. */
EVARYSTH.viewer3d.define("equerre", () => {
  return function (THREE, v) {
    const t = 5; // épaisseur de paroi (mm)
    const a = Math.max(v.a, t * 2), b = Math.max(v.b, t * 2), w = v.c;
    const r = Math.min(4, a - t, b - t); // petit congé dans l'angle intérieur, comme une vraie pièce
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(a, 0);
    s.lineTo(a, t);
    s.lineTo(t + r, t);
    s.quadraticCurveTo(t, t, t, t + r);
    s.lineTo(t, b);
    s.lineTo(0, b);
    s.closePath();
    const bevel = 0.8;
    const g = new THREE.ExtrudeGeometry(s, {
      depth: w - bevel * 2, curveSegments: 8,
      bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2
    });
    g.center();
    return g;
  };
});
