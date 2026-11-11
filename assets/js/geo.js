/* Evarysth — moteur géométrique commun (navigateur + Node), basé sur manifold-3d (docs/refonte-geometrie.md).
   Briques ext, box, cyl, rev, join, tray, overHook, sideClamp : chaque brique est un solide Manifold
   et join() est une vraie union booléenne : maillage étanche, sans faces internes.
   Module ES sans dépendance : il reçoit THREE et le module WASM déjà chargés.
     navigateur : viewer3d.js (seul moteur de l'aperçu) ;
     Node       : tools/lib/moteur.mjs (generer-stl, verifier-geometrie, tests de tools/test/).
   Unités : mm. Les solides se manipulent comme des BufferGeometry (translate, rotateX/Y/Z,
   scale, applyMatrix4, clone, center, dispose), en place, et se convertissent pour l'aperçu.
   Chaque solide garde sa « pose » : la transformation appliquée depuis le dernier join(), qui ramène les contrôles
   de cotes déclarés par les modèles (repère de construction) sur le solide final. */

export const MANIFOLD_VERSION = "3.5.4";
/* Facettisation des cylindres : corde ≤ CORDE mm, au moins SEG_MIN segments, multiple de 4
   (sommets sur les axes : la boîte englobante reste exacte) */
export const CORDE = 0.5;
export const SEG_MIN = 24;
export const segments = r => Math.ceil(Math.max(SEG_MIN, Math.ceil(2 * Math.PI * Math.abs(r) / CORDE)) / 4) * 4;

/* Profils 2D utilisés par les compositions (mêmes définitions que viewer3d.js) */
const rad = d => d * Math.PI / 180;
/* Arc et cercle sans n explicite (viewer3d.js, ici overHook) : même règle de corde, au moins 32 segments */
const arc = (ri, ro, a0, a1, n = Math.max(32, Math.ceil(segments(Math.max(ri, ro)) * Math.abs(a1 - a0) / 360 / 4) * 4)) => {
  const at = (r, i) => [r * Math.cos(rad(a0 + (a1 - a0) * i / n)), r * Math.sin(rad(a0 + (a1 - a0) * i / n))];
  return [...Array.from({ length: n + 1 }, (_, i) => at(ro, i)), ...Array.from({ length: n + 1 }, (_, i) => at(ri, n - i))];
};
const uPts = (o, L, t) => [[-o / 2 - t, 0], [-o / 2 - t, L + t], [o / 2 + t, L + t], [o / 2 + t, 0],
  [o / 2, 0], [o / 2, L], [-o / 2, L], [-o / 2, 0]];

export function createKit(THREE, wasm) {
  const { Manifold, CrossSection, Mesh } = wasm;
  /* Objets WASM créés pendant un calcul : libérés ensemble par flush() (après conversion) */
  let arena = [];
  const own = o => { arena.push(o); return o; };
  const flush = () => { for (const o of arena) { try { o.delete(); } catch { /* déjà libéré */ } } arena = []; };
  /* Radians → degrés, multiples de 90° exacts (manifold-3d les applique sans erreur d'arrondi) */
  const deg = a => { const d = a * 180 / Math.PI, r = Math.round(d); return Math.abs(d - r) < 1e-9 ? r : d; };

  /* Solide : enveloppe mutable d'un Manifold (immuable), à la manière d'une BufferGeometry.
     pose : transformations appliquées depuis la création ou le dernier join() (THREE.Matrix4) */
  const M4 = () => new THREE.Matrix4();
  class Solid {
    constructor(mf, horsKit = false, pose = M4()) { this.mf = mf; this.horsKit = horsKit; this.pose = pose; }
    get isSolid() { return true; }
    set(mf, m) { this.mf = own(mf); this.pose.premultiply(m); return this; }
    translate(x, y, z) { return this.set(this.mf.translate([x, y, z]), M4().makeTranslation(x, y, z)); }
    rotateX(a) { return this.set(this.mf.rotate([deg(a), 0, 0]), M4().makeRotationX(a)); }
    rotateY(a) { return this.set(this.mf.rotate([0, deg(a), 0]), M4().makeRotationY(a)); }
    rotateZ(a) { return this.set(this.mf.rotate([0, 0, deg(a)]), M4().makeRotationZ(a)); }
    scale(x, y = x, z = x) { return this.set(this.mf.scale([x, y, z]), M4().makeScale(x, y, z)); }
    applyMatrix4(m) { return this.set(this.mf.transform(Array.from(m.elements)), m.clone()); }
    clone() { return new Solid(this.mf, this.horsKit, this.pose.clone()); }
    center() {
      const { min, max } = this.mf.boundingBox();
      return this.translate(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2);
    }
    dispose() { /* libéré par flush() */ }
  }
  const solid = (mf, horsKit) => new Solid(own(mf), horsKit);

  /* Profils : liste de points [x, y], ou Section (CrossSection) issue de section/offset/conge/jeu */
  class Section {
    constructor(cs) { this.cs = cs; }
    get isSection() { return true; }
    polygons() { return this.cs.toPolygons().map(p => p.map(([x, y]) => [x, y])); }
    area() { return this.cs.area(); }
  }
  const section = (pts, holes = []) => pts && pts.isSection ? pts
    : new Section(own(new CrossSection([pts, ...holes], "EvenOdd")));
  /* Décalage exact du contour : delta > 0 grossit, < 0 amincit ; coins « Round », « Miter » ou « Square » */
  const offset = (src, delta, type = "Round", holes) =>
    new Section(own(section(src, holes).cs.offset(delta, type, 2, segments(delta))));
  /* Congé de rayon r sur les angles saillants (convexes) et/ou rentrants (concaves) */
  const conge = (src, r, { convexes = true, concaves = true } = {}, holes) => {
    let s = section(src, holes);
    if (convexes) s = offset(offset(s, -r, "Miter"), r, "Round");
    if (concaves) s = offset(offset(s, r, "Miter"), -r, "Round");
    return s;
  };
  /* Jeu d'assemblage : la cavité grandit de j sur tout son contour, angles vifs conservés */
  const jeu = (src, j, holes) => offset(src, j, "Miter", holes);

  /* Extrusion aux arêtes arrondies (remplace le biseau d'ExtrudeGeometry) : profil cœur grossi de r (coins Round),
     épaisseur d (centrée en z), arêtes des deux faces arrondies au rayon r en n segments. Même forme qu'une somme de
     Minkowski avec une sphère, sans son coût : extrusion du profil grossi en 2n + 2 niveaux, puis chaque sommet est
     ramené vers son point le plus proche du profil cœur (homothétie de rapport cos φ). Boîte : profil + r, épaisseur d. */
  const extArrondi = (pts, d, r, n = 2, holes = []) => {
    const coeur = section(pts, holes), segs = coeur.polygons().flatMap(p => p.map((a, i) => [a, p[(i + 1) % p.length]]));
    const niv = Array.from({ length: 2 * n + 2 }, (_, k) => {
      const bas = k <= n, phi = (bas ? -90 + 90 * k / n : 90 * (k - n - 1) / n) * Math.PI / 180;
      return [(bas ? -d / 2 + r : d / 2 - r) + r * Math.sin(phi), Math.max(0.05, Math.cos(phi))];
    });
    /* Point le plus proche du profil cœur ; dans un angle rentrant (deux pieds équidistants), le sommet commun */
    const proche = (x, y) => {
      let best = Infinity, q = null, best2 = Infinity, q2 = null;
      for (const [[ax, ay], [bx, by]] of segs) {
        const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy || 1;
        const t = Math.min(1, Math.max(0, ((x - ax) * ux + (y - ay) * uy) / l2)), px = ax + t * ux, py = ay + t * uy;
        const dd = (x - px) ** 2 + (y - py) ** 2;
        if (dd < best) { best2 = best; q2 = q; best = dd; q = [px, py, ax, ay, bx, by]; } else if (dd < best2) { best2 = dd; q2 = [px, py, ax, ay, bx, by]; }
      }
      if (q2 && best2 - best < 1e-6 * r * r && Math.hypot(q[0] - q2[0], q[1] - q2[1]) > 1e-6) {
        const c = [[q[2], q[3]], [q[4], q[5]]].find(([vx, vy]) => (vx === q2[2] && vy === q2[3]) || (vx === q2[4] && vy === q2[5]));
        if (c) return c;
      }
      return q;
    };
    const mf = own(offset(coeur, r, "Round").cs.extrude(2 * n + 1, 2 * n, 0, [1, 1], false)).warpBatch((v, count) => {
      for (let i = 0; i < count; i++) {
        const [z, f] = niv[Math.round(v[3 * i + 2])], q = proche(v[3 * i], v[3 * i + 1]);
        v[3 * i] = q[0] + (v[3 * i] - q[0]) * f; v[3 * i + 1] = q[1] + (v[3 * i + 1] - q[1]) * f; v[3 * i + 2] = z;
      }
    });
    return solid(mf);
  };

  /* Briques (repère de l'aperçu : Y vers le haut) */
  const ext = (pts, d, holes = []) => solid(section(pts, holes).cs.extrude(d, 0, 0, [1, 1], true));
  const box = (w, h, d, x = 0, y = 0, z = 0) => solid(Manifold.cube([w, h, d], true)).translate(x, y, z);
  const cyl = (r, h, ri = 0) => {
    if (!(ri > 0)) return solid(Manifold.cylinder(h, r, r, segments(r), true)).rotateX(-Math.PI / 2);
    /* Tube : anneau calculé en 2D puis extrudé (bien plus rapide qu'une différence 3D) */
    const ring = own(own(CrossSection.circle(r, segments(r))).subtract(own(CrossSection.circle(ri, segments(ri)))));
    return solid(ring.extrude(h, 0, 0, [1, 1], true)).rotateX(-Math.PI / 2);
  };

  /* Révolution d'un profil (points [rayon, hauteur], rayon ≥ 0) autour de l'axe Y : une pièce tournée d'un seul tenant,
     sans booléen (bague, collerette, épaulement…). Segments : règle de corde sur le plus grand rayon.
     angle < 360 : révolution partielle (anneau fendu…), ouverture centrée sur +z, faces d'extrémité radiales. */
  const rev = (pts, angle = 360) => {
    const n = segments(Math.max(...pts.map(q => q[0])));
    if (!(angle < 360)) return solid(Manifold.revolve(section(pts).cs, n)).rotateX(-Math.PI / 2);
    /* De 0° à angle autour de Z (repère du profil), puis ouverture tournée de son milieu vers −y, qui devient +z */
    const mf = own(Manifold.revolve(section(pts).cs, Math.max(4, Math.ceil(n * angle / 360)), angle));
    return solid(mf.rotate([0, 0, 270 - (angle + 360) / 2])).rotateX(-Math.PI / 2);
  };

  /* BufferGeometry → Manifold : sommets fusionnés par position (tolérance tol), triangles dégénérés retirés.
     Renvoie null si le maillage n'est pas étanche (arêtes ouvertes, faces en trop…). */
  const fromGeometry = (g, tol = 1e-4) => {
    const p = g.attributes.position, n = p.count, ix = g.index;
    const keys = new Map(), verts = [], remap = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.round(x / tol) + "," + Math.round(y / tol) + "," + Math.round(z / tol);
      let v = keys.get(k);
      if (v === undefined) { v = verts.length / 3; keys.set(k, v); verts.push(x, y, z); }
      remap[i] = v;
    }
    const tris = [], nt = (ix ? ix.count : n) / 3;
    for (let t = 0; t < nt; t++) {
      const a = remap[ix ? ix.getX(3 * t) : 3 * t], b = remap[ix ? ix.getX(3 * t + 1) : 3 * t + 1], c = remap[ix ? ix.getX(3 * t + 2) : 3 * t + 2];
      if (a !== b && b !== c && a !== c) tris.push(a, b, c);
    }
    if (!tris.length) return null;
    try {
      const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
      mesh.merge();
      const mf = own(new Manifold(mesh));
      return mf.status() === "NoError" && !mf.isEmpty() ? mf : null;
    } catch { return null; }
  };

  /* Manifold → BufferGeometry indexée pour l'aperçu : sommets partagés ; en chaque sommet, normale moyenne
     des faces voisines à moins de 30° (même seuil que les arêtes dessinées par le viewer), donc arêtes plus
     vives dédoublées. Calcul linéaire en JS (calculateNormals de manifold-3d est trop lent sur les treillis). */
  const COS = Math.cos(30 * Math.PI / 180);
  const toGeometry = s => {
    const mesh = (s.isSolid ? s.mf : s).getMesh();
    const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts, nt = tv.length / 3, nv = vp.length / np;
    const fn = new Float64Array(3 * nt), fu = new Float64Array(3 * nt);
    for (let t = 0; t < nt; t++) {
      const a = np * tv[3 * t], b = np * tv[3 * t + 1], c = np * tv[3 * t + 2];
      const ux = vp[b] - vp[a], uy = vp[b + 1] - vp[a + 1], uz = vp[b + 2] - vp[a + 2];
      const wx = vp[c] - vp[a], wy = vp[c + 1] - vp[a + 1], wz = vp[c + 2] - vp[a + 2];
      const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx, l = Math.hypot(x, y, z) || 1;
      fn[3 * t] = x; fn[3 * t + 1] = y; fn[3 * t + 2] = z; fu[3 * t] = x / l; fu[3 * t + 1] = y / l; fu[3 * t + 2] = z / l;
    }
    /* Faces autour de chaque sommet (tableau compact) */
    const start = new Uint32Array(nv + 1);
    for (let i = 0; i < tv.length; i++) start[tv[i] + 1]++;
    for (let v = 0; v < nv; v++) start[v + 1] += start[v];
    const fill = start.slice(0, nv), faces = new Uint32Array(tv.length);
    for (let i = 0; i < tv.length; i++) faces[fill[tv[i]]++] = (i / 3) | 0;
    const pos = [], nor = [], index = new Uint32Array(tv.length);
    for (let v = 0; v < nv; v++) {
      const made = [];   // [nx, ny, nz, indice] des sommets déjà émis pour v
      for (let i = start[v]; i < start[v + 1]; i++) {
        const f = faces[i]; let x = 0, y = 0, z = 0;
        for (let j = start[v]; j < start[v + 1]; j++) {
          const g = faces[j];
          if (fu[3 * f] * fu[3 * g] + fu[3 * f + 1] * fu[3 * g + 1] + fu[3 * f + 2] * fu[3 * g + 2] >= COS) { x += fn[3 * g]; y += fn[3 * g + 1]; z += fn[3 * g + 2]; }
        }
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        let k = made.find(m => Math.abs(m[0] - x) + Math.abs(m[1] - y) + Math.abs(m[2] - z) < 1e-6);
        if (!k) { k = [x, y, z, pos.length / 3]; made.push(k); pos.push(vp[np * v], vp[np * v + 1], vp[np * v + 2]); nor.push(x, y, z); }
        for (let c = 0; c < 3; c++) if (tv[3 * f + c] === v) index[3 * f + c] = k[3];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nor), 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  };

  /* Concaténation de triangles : seulement en repli, quand une pièce hors kit n'est pas étanche (aperçu seul) */
  const concat = gs => {
    const flat = gs.map(g => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals(); return n; });
    const cat = key => {
      const arrs = flat.map(g => g.attributes[key].array), out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
      let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out;
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(cat("position"), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(cat("normal"), 3));
    g.userData.etanche = false;
    return g;
  };

  /* Assemblage : union booléenne, centrée sur sa boîte englobante ; le repère des pièces assemblées est le
     « repère de construction » du résultat (sa pose ne garde que ce centrage et les transformations suivantes).
     Les BufferGeometry (modèles hors kit) sont converties si elles sont étanches ; sinon,
     repli sur la concaténation : l'aperçu reste juste, le bilan dit « non étanche ». */
  const join = (...gs) => {
    const mfs = [], soup = []; let horsKit = false;
    for (const g of gs.flat()) {
      if (g && g.isSolid) { mfs.push(g.mf); horsKit = horsKit || g.horsKit; continue; }
      horsKit = true;
      const mf = fromGeometry(g);
      if (mf) mfs.push(mf); else soup.push(g);
    }
    if (soup.length) return concat([...mfs.map(toGeometry), ...soup]).center();
    return solid(Manifold.union(mfs), horsKit).center();
  };

  /* Compositions récurrentes, sur les mêmes primitives (l'assemblage est fait par join) */
  const tray = (w, d, h, nx, nz) => [
    box(w, 3, d, 0, 1.5, 0),
    box(w, h, 3, 0, h / 2, d / 2 - 1.5), box(w, h, 3, 0, h / 2, -d / 2 + 1.5),
    box(3, h, d, w / 2 - 1.5, h / 2, 0), box(3, h, d, -w / 2 + 1.5, h / 2, 0),
    ...Array.from({ length: nx - 1 }, (_, i) => box(2, h * 0.85, d, -w / 2 + (i + 1) * w / nx, h * 0.425, 0)),
    ...Array.from({ length: nz - 1 }, (_, i) => box(w, h * 0.85, 2, 0, h * 0.425, -d / 2 + (i + 1) * d / nz))
  ];
  /* Pose sur un support d'épaisseur a, bras qui descend côté extérieur, crochet en bas */
  const overHook = (a, drop, r, w, t = 5) => join(
    ext(uPts(a, 30, t), w),
    box(t, drop + 30 + t, w, a / 2 + t / 2, (30 + t - drop) / 2, 0),
    ext(arc(r, r + t, 180, 360), w).translate(a / 2 + r + t, -drop, 0)
  );
  /* Pince latérale sur un plateau d'épaisseur a (ouverture vers +x, corps en x < 0) */
  const sideClamp = (a, L, t, w) => ext(uPts(a, L, t), w).rotateZ(Math.PI / 2);

  /* Bilan d'un résultat de modèle (Solid ou BufferGeometry) : étanchéité, volume, boîte, nombre de solides */
  const bilan = r => {
    const mf = r && r.isSolid ? r.mf : fromGeometry(r);
    if (!mf) {
      r.computeBoundingBox();
      const b = r.boundingBox;
      return { etanche: false, horsKit: true, volume: null, solides: null, bbox: { min: b.min.toArray(), max: b.max.toArray() } };
    }
    const { min, max } = mf.boundingBox();
    return { etanche: mf.status() === "NoError", horsKit: !r.isSolid || r.horsKit, volume: mf.volume(),
      solides: mf.decompose().map(own).length, bbox: { min: [...min], max: [...max] }, mf };
  };

  /* Aperçu : résultat de modèle → BufferGeometry, puis libération des objets WASM du calcul */
  const preview = r => { try { return r && r.isSolid ? toGeometry(r) : r; } finally { flush(); } };

  return {
    isManifold: true, wasm, Manifold, CrossSection, Solid, segments,
    ext, box, cyl, rev, join, section, offset, conge, jeu, extArrondi,
    tray, overHook, sideClamp,
    solid, fromGeometry, toGeometry, bilan, preview, flush
  };
}
