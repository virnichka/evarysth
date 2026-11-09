/* Evarysth — moteur géométrique commun (navigateur + Node), basé sur manifold-3d.
   Refonte, phase 2 (docs/refonte-geometrie.md) : même API que le kit three.js de viewer3d.js
   (ext, box, cyl, join, tray, overHook, sideClamp), mais chaque brique est un solide Manifold
   et join() est une vraie union booléenne : maillage étanche, sans faces internes.
   Module ES sans dépendance : il reçoit THREE et le module WASM déjà chargés.
     navigateur : viewer3d.js, seulement avec ?geo=manifold (mémorisé, ?geo=off le coupe) ;
     Node       : tools/lib/moteur.mjs (tools/generer-stl.mjs, tools/comparer-kits.mjs).
   Unités : mm. Les solides se manipulent comme des BufferGeometry (translate, rotateX/Y/Z,
   scale, applyMatrix4, clone, center, dispose), en place, et se convertissent pour l'aperçu. */

export const MANIFOLD_VERSION = "3.5.4";
/* Facettisation des cylindres : corde ≤ CORDE mm, au moins SEG_MIN segments, multiple de 4
   (sommets sur les axes : la boîte englobante reste exacte) */
export const CORDE = 0.5;
export const SEG_MIN = 24;
export const segments = r => Math.ceil(Math.max(SEG_MIN, Math.ceil(2 * Math.PI * Math.abs(r) / CORDE)) / 4) * 4;

/* Profils 2D utilisés par les compositions (mêmes définitions que viewer3d.js) */
const rad = d => d * Math.PI / 180;
const arc = (ri, ro, a0, a1, n = 32) => {
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

  /* Solide : enveloppe mutable d'un Manifold (immuable), à la manière d'une BufferGeometry */
  class Solid {
    constructor(mf, horsKit = false) { this.mf = mf; this.horsKit = horsKit; }
    get isSolid() { return true; }
    set(mf) { this.mf = own(mf); return this; }
    translate(x, y, z) { return this.set(this.mf.translate([x, y, z])); }
    rotateX(a) { return this.set(this.mf.rotate([deg(a), 0, 0])); }
    rotateY(a) { return this.set(this.mf.rotate([0, deg(a), 0])); }
    rotateZ(a) { return this.set(this.mf.rotate([0, 0, deg(a)])); }
    scale(x, y = x, z = x) { return this.set(this.mf.scale([x, y, z])); }
    applyMatrix4(m) { return this.set(this.mf.transform(Array.from(m.elements))); }
    clone() { return new Solid(this.mf, this.horsKit); }
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

  /* Briques : mêmes signatures et même repère que le kit three.js */
  const ext = (pts, d, holes = []) => solid(section(pts, holes).cs.extrude(d, 0, 0, [1, 1], true));
  const box = (w, h, d, x = 0, y = 0, z = 0) => solid(Manifold.cube([w, h, d], true)).translate(x, y, z);
  const cyl = (r, h, ri = 0) => {
    if (!(ri > 0)) return solid(Manifold.cylinder(h, r, r, segments(r), true)).rotateX(-Math.PI / 2);
    /* Tube : anneau calculé en 2D puis extrudé (bien plus rapide qu'une différence 3D) */
    const ring = own(own(CrossSection.circle(r, segments(r))).subtract(own(CrossSection.circle(ri, segments(ri)))));
    return solid(ring.extrude(h, 0, 0, [1, 1], true)).rotateX(-Math.PI / 2);
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

  /* Concaténation de triangles (ancien join) : seulement en repli, quand une pièce hors kit n'est pas étanche */
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

  /* Assemblage : union booléenne, centrée sur sa boîte englobante (comme l'ancien join).
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
    ext, box, cyl, join, section, offset, conge, jeu,
    tray, overHook, sideClamp,
    solid, fromGeometry, toGeometry, bilan, preview, flush
  };
}
