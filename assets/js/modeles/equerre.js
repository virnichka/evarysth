/* Modèle 3D « equerre » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Équerre en L : a = 1re branche, b = 2e branche, c = largeur de la pièce. Paroi fixe.
   Profil en L (paroi 5 mm, congé de 4 mm dans l'angle intérieur), grossi de 0,8 mm et arêtes arrondies
   au même rayon : kit manifold → k.extArrondi (CrossSection + offset arrondi) ; ancien kit → biseau three.js. */
EVARYSTH.viewer3d.define("equerre", ({ kit }) => {
  const t = 5, bevel = 0.8; // épaisseur de paroi, rayon des arêtes (mm)
  const cotes = v => { const a = Math.max(v.a, t * 2), b = Math.max(v.b, t * 2); return { a, b, w: v.c, r: Math.min(4, a - t, b - t) }; };
  /* Ancien kit (?geo=ancien, retiré en phase 4) : ExtrudeGeometry biseautée */
  const ancien = (THREE, v) => {
    const { a, b, w, r } = cotes(v);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(a, 0);
    s.lineTo(a, t);
    s.lineTo(t + r, t);
    s.quadraticCurveTo(t, t, t, t + r);
    s.lineTo(t, b);
    s.lineTo(0, b);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth: w - bevel * 2, curveSegments: 8,
      bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2
    });
    g.center();
    return g;
  };
  return function (THREE, v) {
    const k = kit(THREE);
    if (!k.isManifold) return ancien(THREE, v);
    const { a, b, w, r } = cotes(v);
    const L = k.conge([[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]], r, { convexes: false });
    return k.join(k.extArrondi(L, w, bevel));
  };
}, { solides: 1 });
