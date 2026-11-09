/* Modèle 3D « boite-rugged » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = longueur, b = largeur, c = hauteur intérieures (à partir des STL) */
EVARYSTH.viewer3d.define("boite-rugged", ({ fetchSTL }) => {
  /* Boîte Rugged : boîte + couvercle + 2 loquets, assemblés fermés à partir des STL d'impression.
     Repère d'assemblage : Z vers le haut, origine au centre du fond, cotes intérieures 150 × 100 × 50 mm.
     Redimensionnement « par zones » : on n'étire que des bandes où la pièce n'a que des parois droites
     (milieu des grands côtés, milieu de la hauteur). Charnières, loquets, congés et épaisseurs de paroi
     gardent leurs vraies dimensions, ils se déplacent simplement avec les bords. */
  const rugged = (() => {
    const DIR = "assets/models/boite-rugged/";
    const NOM = { a: 150, b: 100, c: 50 };  // cotes intérieures des fichiers d'origine
    const BAND = { x: 22, y: 23, z0: 4.4, z1: 22.4 };  // zones sans détail : |x| < 22, |y| < 23, 4,4 < z < 22,4
    /* Axes de rotation (repère d'assemblage, cotes d'origine) : charnière côté -X, œil des loquets côté +X */
    const HINGE = { x: -57.86, z: 40.5 }, LATCH_PIN = { x: 56.76, z: 48.6 };
    let base = null, lidAt = 0, latchAt = 0;  // positions à plat ; indices de début du couvercle et des loquets
    /* Rotation autour d'un axe parallèle à Y passant par (cx, cz), sur out[from..to[ */
    const swing = (out, from, to, cx, cz, ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let i = from; i < to; i += 3) {
        const x = out[i] - cx, z = out[i + 2] - cz;
        out[i] = cx + x * c - z * s;
        out[i + 2] = cz + x * s + z * c;
      }
    };
    /* v.open (0 → 1, facultatif) : affichage seulement. 0–30 % : les loquets basculent vers l'extérieur,
       30–100 % : le couvercle (avec ses loquets) pivote jusqu'à 105° sur sa charnière. */
    const model = (T, v) => {
      const dx = (v.b - NOM.b) / 2, dy = (v.a - NOM.a) / 2, dz = v.c - NOM.c;
      const sx = (BAND.x + dx) / BAND.x, sy = (BAND.y + dy) / BAND.y, sz = (BAND.z1 - BAND.z0 + dz) / (BAND.z1 - BAND.z0);
      const out = new Float32Array(base.length);
      for (let i = 0; i < base.length; i += 3) {
        const x = base[i], y = base[i + 1], z = base[i + 2];
        out[i] = x > BAND.x ? x + dx : x < -BAND.x ? x - dx : x * sx;
        out[i + 1] = y > BAND.y ? y + dy : y < -BAND.y ? y - dy : y * sy;
        out[i + 2] = z > BAND.z1 ? z + dz : z > BAND.z0 ? BAND.z0 + (z - BAND.z0) * sz : z;
      }
      /* Centre de la boîte fermée : la boîte reste immobile pendant l'ouverture */
      const cz = (out.reduce((m, val, i) => i % 3 === 2 && val > m ? val : m, 0)) / 2;
      const open = Math.min(1, Math.max(0, v.open || 0));
      const ease = t => t * t * (3 - 2 * t);
      if (open > 0) {
        swing(out, latchAt, out.length, LATCH_PIN.x + dx, LATCH_PIN.z + dz, -ease(Math.min(1, open / 0.3)) * Math.PI * 0.6);
        swing(out, lidAt, out.length, HINGE.x - dx, HINGE.z + dz, ease(Math.max(0, (open - 0.3) / 0.7)) * Math.PI * 105 / 180);
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(out, 3));
      g.translate(0, 0, -cz).computeVertexNormals();
      return g.rotateX(-Math.PI / 2);  // Z vers le haut -> Y vers le haut (convention du viewer)
    };
    model.openable = true;
    model.prepare = T => base ? Promise.resolve() : Promise.all(["boite", "couvercle", "loquet"].map(n => fetchSTL(DIR + n + ".stl")))
      .then(([box, lid, latch]) => {
        const M = (...e) => new T.Matrix4().set(...e, 0, 0, 0, 1);
        const parts = [
          box.clone().applyMatrix4(M(1, 0, 0, -125, 0, 1, 0, -126.9, 0, 0, 1, 0)),
          /* Couvercle retourné (demi-tour autour de X) : son axe de charnière (z 14,5) vient sur celui de la boîte (z 40,5) */
          lid.clone().applyMatrix4(M(1, 0, 0, -125, 0, -1, 0, 113.9, 0, 0, -1, 55)),
          /* Loquet : œil sur l'axe du couvercle (z 48,6), crochet sur l'axe de la boîte (z 32,4) */
          ...[-43, 43].map(yc => latch.clone().applyMatrix4(M(-1, 0, 0, 209.31, 0, 0, 1, yc - 11.6, 0, 1, 0, -11.32)))
        ];
        const arrs = parts.map(g => g.attributes.position.array);
        lidAt = arrs[0].length; latchAt = lidAt + arrs[1].length;
        base = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
        arrs.reduce((o, a) => (base.set(a, o), o + a.length), 0);
        parts.forEach(g => g.dispose());
      });
    return model;
  })();
  return rugged;
}, { solides: 4 });   // boîte, couvercle, 2 loquets (assemblage montré fermé)
