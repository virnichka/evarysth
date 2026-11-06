/* Modèle 3D « support-casque-gyroide » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = hauteur totale, b = largeur de l'appui (reconstruction paramétrique, treillis gyroïde) */
EVARYSTH.viewer3d.define("support-casque-gyroide", ({ kit }) => {
  /* Support de casque gyroïde. Reconstruit d'après le STL « gyroid headphone holder » (210 000 triangles,
     trop lourd et non paramétrable) : socle plein, colonne puis tête évasée en treillis gyroïde, appui
     bombé plein sous l'arceau. Le treillis est recalculé (champ implicite + « surface nets ») à cellule
     fixe : quand on agrandit, il gagne des cellules au lieu d'épaissir. Montants pleins aux 4 arêtes.
     a = hauteur totale, b = largeur de l'appui. Repère : y vers le haut, sol en y = 0. */
  const gyroStand = (T, { a, b }) => {
    const k = kit(T);
    const BT = 8, S = 8, CT = 6, B = b + 8;           // socle, flèche et épaisseur de l'appui, largeur de l'appui
    const cw = 44, cd = 32, hd = 44, HH = 0.6 * b;     // colonne (x, z), profondeur de la tête, hauteur de la tête
    const yT = a - S - CT, yH = yT - HH;               // dessous de l'appui (au bord), début de l'évasement
    const arcY = x => S * (1 - (2 * x / B) ** 2);      // bombé de l'appui
    const P = 20, kk = 2 * Math.PI / P, wall = 1.3;    // période du gyroïde, demi-épaisseur de paroi
    /* Silhouette pleine (distance approchée) */
    const shape = y => { const u = Math.min(1, Math.max(0, (y - yH) / (0.6 * HH))), e = u * u * (3 - 2 * u);  // évasement puis partie droite
      return [cw / 2 + (B / 2 - 2 - cw / 2) * e, cd / 2 + (hd / 2 - cd / 2) * e]; };
    const field = (ax, y, az, w, d, top, g) => {
      const R = Math.max(ax - w, az - d, BT - 1 - y, y - top);
      if (R > 3) return R;
      const post = Math.max(R, w - 4 - ax, d - 4 - az);
      return Math.min(post, Math.max(R, Math.abs(g) / kk - wall));
    };
    /* Grille */
    const h = 1.6, x0 = -B / 2 - 3, y0 = BT - 4, z0 = -hd / 2 - 3;
    const nx = Math.ceil((B + 6) / h) + 1, ny = Math.ceil((a - y0 + 2) / h) + 1, nz = Math.ceil((hd + 6) / h) + 1;
    const X = i => x0 + i * h, Y = j => y0 + j * h, Z = l => z0 + l * h;
    const trig = (n, f) => { const s = new Float32Array(n), c = new Float32Array(n);
      for (let i = 0; i < n; i++) { s[i] = Math.sin(kk * f(i)); c[i] = Math.cos(kk * f(i)); } return [s, c]; };
    const [sx, cx] = trig(nx, X), [sy, cy] = trig(ny, Y), [sz, cz] = trig(nz, Z);
    const V = new Float32Array(nx * ny * nz), at = (i, j, l) => (j * nz + l) * nx + i;
    const top = Float32Array.from({ length: nx }, (_, i) => yT + arcY(X(i)) + 1);
    for (let j = 0; j < ny; j++) {
      const y = Y(j), [w, d] = shape(y);
      for (let l = 0; l < nz; l++) { const az = Math.abs(Z(l));
        for (let i = 0; i < nx; i++)
          V[at(i, j, l)] = field(Math.abs(X(i)), y, az, w, d, top[i], sx[i] * cy[j] + sy[j] * cz[l] + sz[l] * cx[i]); }
    }
    /* Surface nets : un sommet par cellule traversée, une face par arête traversée */
    const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), ci = (i, j, l) => (j * (nz - 1) + l) * (nx - 1) + i;
    const pos = [], idx = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let j = 0; j < ny - 1; j++) for (let l = 0; l < nz - 1; l++) for (let i = 0; i < nx - 1; i++) {
      let m = 0;
      for (let c = 0; c < 8; c++) { cv[c] = V[at(i + (c & 1), j + (c >> 2 & 1), l + (c >> 1 & 1))]; if (cv[c] < 0) m |= 1 << c; }
      if (m === 0 || m === 255) continue;
      let px = 0, py = 0, pz = 0, n = 0;
      for (const [p, q] of E) {
        if ((cv[p] < 0) === (cv[q] < 0)) continue;
        const t = cv[p] / (cv[p] - cv[q]);
        px += (p & 1) + ((q & 1) - (p & 1)) * t; py += (p >> 2 & 1) + ((q >> 2 & 1) - (p >> 2 & 1)) * t;
        pz += (p >> 1 & 1) + ((q >> 1 & 1) - (p >> 1 & 1)) * t; n++;
      }
      cell[ci(i, j, l)] = pos.length / 3;
      pos.push(X(i + px / n), Y(j + py / n), Z(l + pz / n));
    }
    const face = (inside, c0, c1, c2, c3) => {
      const q = [cell[c0], cell[c1], cell[c2], cell[c3]];
      if (inside) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    };
    for (let j = 1; j < ny - 1; j++) for (let l = 1; l < nz - 1; l++) for (let i = 1; i < nx - 1; i++) {
      const v = V[at(i, j, l)] < 0;
      if (v !== (V[at(i + 1, j, l)] < 0)) face(v, ci(i, j - 1, l - 1), ci(i, j, l - 1), ci(i, j, l), ci(i, j - 1, l));
      if (v !== (V[at(i, j + 1, l)] < 0)) face(v, ci(i - 1, j, l - 1), ci(i - 1, j, l), ci(i, j, l), ci(i, j, l - 1));
      if (v !== (V[at(i, j, l + 1)] < 0)) face(v, ci(i - 1, j - 1, l), ci(i, j - 1, l), ci(i, j, l), ci(i - 1, j, l));
    }
    const lattice = new T.BufferGeometry();
    lattice.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    lattice.setIndex(idx);
    lattice.computeVertexNormals();
    /* Pièces pleines, arêtes adoucies : socle arrondi et appui bombé */
    const round = (w, d, r) => { const s = new T.Shape(), x = w / 2, y = d / 2;
      s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r);
      s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
      s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y); return s; };
    const soft = (s, depth, bv) => new T.ExtrudeGeometry(s, { depth: depth - 2 * bv, bevelEnabled: true,
      bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 10 }).translate(0, 0, -depth / 2 + bv);
    const base = soft(round(Math.max(b + 10, 0.42 * a), 110, 16), BT, 1.5).rotateX(Math.PI / 2).translate(0, BT / 2, 0);
    const cap = new T.Shape(), N = 24, Bc = B - 3;
    for (let i = 0; i <= N; i++) { const x = -Bc / 2 + Bc * i / N; i ? cap.lineTo(x, yT + arcY(x)) : cap.moveTo(x, yT + arcY(x)); }
    for (let i = N; i >= 0; i--) { const x = -Bc / 2 + Bc * i / N; cap.lineTo(x, yT + arcY(x) + CT - 3); }
    return k.join(lattice, base, soft(cap, hd + 4, 1.5));
  };
  gyroStand.smooth = true;  // treillis organique : pas d'arêtes à souligner
  return gyroStand;
});
