/* Modèle 3D « support-casque-gyroide » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = hauteur totale, b = largeur de l'appui (reconstruction paramétrique, treillis gyroïde) */
EVARYSTH.viewer3d.define("support-casque-gyroide", () => {
  /* Support de casque gyroïde. Reconstruit d'après le STL « gyroid headphone holder » (210 000 triangles,
     trop lourd et non paramétrable) : socle plein, colonne puis tête évasée en treillis gyroïde, appui
     bombé plein sous l'arceau. Le treillis est recalculé (champ implicite + « surface nets ») à cellule
     fixe : quand on agrandit, il gagne des cellules au lieu d'épaissir. Montants pleins aux 4 arêtes.
     a = hauteur totale, b = largeur de l'appui. Repère : y vers le haut, sol en y = 0. */
  const gyroStand = (T, { a, b }) => {
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
    /* Socle et appui, dans le même champ (distances exactes) : le maillage sort d'une seule pièce, sans booléen.
       Mêmes formes que les anciennes extrusions biseautées : profil cœur grossi de 1,5 mm, arêtes arrondies r = 1,5. */
    const rb = 1.5, wb = Math.max(b + 10, 0.42 * a), Bc = B - 3;
    const arrondi = (qx, qy, qz) => Math.min(Math.max(qx, qy, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) - rb;
    const socle = (x, y, z) => {   // rectangle wb × 110 aux coins de 16 mm, 8 mm d'épaisseur (y de 0 à BT)
      const qx = Math.abs(x) - wb / 2 + 16, qz = Math.abs(z) - 55 + 16;
      const d2 = Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - 16;
      return arrondi(d2, Math.abs(y - BT / 2) - (BT / 2 - rb), -1);
    };
    const appui = (x, y, z, ya) => arrondi(Math.abs(x) - Bc / 2, Math.abs(y - ya - 1.5) - 1.5, Math.abs(z) - (hd + 1) / 2);
    /* Grille du treillis (pas h, même origine qu'avant), élargie par pas entiers sous le socle et autour de lui */
    const h = 1.6, xL = -B / 2 - 3, yL = BT - 4, zL = -hd / 2 - 3;
    const nxL = Math.ceil((B + 6) / h) + 1, nzL = Math.ceil((hd + 6) / h) + 1;
    const ex = Math.max(0, Math.ceil((wb / 2 + rb + h - (B / 2 + 3)) / h)), ez = Math.ceil((55 + rb + h + zL) / h), ey = Math.ceil((yL + 1) / h);
    const x0 = xL - ex * h, y0 = yL - ey * h, z0 = zL - ez * h;
    const nx = nxL + 2 * ex, ny = Math.ceil((a - y0 + 2) / h) + 1, nz = nzL + 2 * ez;
    const X = i => x0 + i * h, Y = j => y0 + j * h, Z = l => z0 + l * h;
    /* Au-dessus du socle, seule la zone du treillis et de l'appui est évaluée (ailleurs : champ positif, vide) */
    const plein = j => Y(j) <= BT + 3;
    const rangs = j => (plein(j) || plein(j + 1)) ? [0, nx - 1, 0, nz - 1] : [ex, ex + nxL - 1, ez, ez + nzL - 1];
    const trig = (n, f) => { const s = new Float32Array(n), c = new Float32Array(n);
      for (let i = 0; i < n; i++) { s[i] = Math.sin(kk * f(i)); c[i] = Math.cos(kk * f(i)); } return [s, c]; };
    const [sx, cx] = trig(nx, X), [sy, cy] = trig(ny, Y), [sz, cz] = trig(nz, Z);
    const V = new Float32Array(nx * ny * nz).fill(10), at = (i, j, l) => (j * nz + l) * nx + i;
    const ya = Float32Array.from({ length: nx }, (_, i) => yT + arcY(X(i)));
    for (let j = 0; j < ny; j++) {
      const y = Y(j), [w, d] = shape(y), [i0, i1, l0, l1] = plein(j) ? [0, nx - 1, 0, nz - 1] : [ex, ex + nxL - 1, ez, ez + nzL - 1];
      const bas = y <= BT + 3, haut = y >= yT - 3;
      for (let l = l0; l <= l1; l++) { const zz = Z(l), az = Math.abs(zz);
        for (let i = i0; i <= i1; i++) {
          const xx = X(i);
          let f = field(Math.abs(xx), y, az, w, d, ya[i] + 1, sx[i] * cy[j] + sy[j] * cz[l] + sz[l] * cx[i]);
          if (bas) f = Math.min(f, socle(xx, y, zz));
          if (haut) f = Math.min(f, appui(xx, y, zz, ya[i]));
          V[at(i, j, l)] = f;
        } }
    }
    /* Surface nets : un sommet par cellule traversée, une face par arête traversée */
    const cell = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), ci = (i, j, l) => (j * (nz - 1) + l) * (nx - 1) + i;
    const pos = [], idx = [];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let j = 0; j < ny - 1; j++) { const [i0, i1, l0, l1] = rangs(j);
      for (let l = l0; l < Math.min(l1 + 1, nz - 1); l++) for (let i = i0; i < Math.min(i1 + 1, nx - 1); i++) {
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
      } }
    const face = (inside, c0, c1, c2, c3) => {
      const q = [cell[c0], cell[c1], cell[c2], cell[c3]];
      if (inside) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    };
    for (let j = 1; j < ny - 1; j++) { const [i0, i1, l0, l1] = rangs(j - 1);
      for (let l = Math.max(1, l0); l < Math.min(l1 + 1, nz - 1); l++) for (let i = Math.max(1, i0); i < Math.min(i1 + 1, nx - 1); i++) {
        const v = V[at(i, j, l)] < 0;
        if (v !== (V[at(i + 1, j, l)] < 0)) face(v, ci(i, j - 1, l - 1), ci(i, j, l - 1), ci(i, j, l), ci(i, j - 1, l));
        if (v !== (V[at(i, j + 1, l)] < 0)) face(v, ci(i - 1, j, l - 1), ci(i - 1, j, l), ci(i, j, l), ci(i, j, l - 1));
        if (v !== (V[at(i, j, l + 1)] < 0)) face(v, ci(i - 1, j - 1, l), ci(i, j - 1, l), ci(i, j, l), ci(i - 1, j, l));
      } }
    /* Îlots : le treillis coupé par la silhouette laisse des fragments de 1 à 4 mm³, détachés ou reliés par un
       seul sommet ; on ne garde que la pièce principale (connexité par arêtes partagées, union-find sur les triangles) */
    const nv = pos.length / 3, nt = idx.length / 3, par = new Int32Array(nt).map((_, i) => i);
    const racine = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    /* Arêtes rangées par plus petit sommet (tableaux typés) ; seules les arêtes à 2 triangles relient :
       une arête à 4 triangles est un pincement (cellule ambiguë), où manifold sépare les pièces */
    const off = new Int32Array(nv + 1), autre = new Int32Array(3 * nt), tri = new Int32Array(3 * nt);
    for (let e = 0; e < 3 * nt; e++) { const u = idx[e], v = idx[e - e % 3 + (e + 1) % 3]; off[(u < v ? u : v) + 1]++; }
    for (let i = 0; i < nv; i++) off[i + 1] += off[i];
    const fill = off.slice(0, nv);
    for (let e = 0; e < 3 * nt; e++) { const u = idx[e], v = idx[e - e % 3 + (e + 1) % 3], k = fill[u < v ? u : v]++;
      autre[k] = u < v ? v : u; tri[k] = (e / 3) | 0; }
    for (let u = 0; u < nv; u++) for (let p = off[u]; p < off[u + 1]; p++) {
      let n = 0, q = -1;
      for (let r = off[u]; r < off[u + 1]; r++) if (autre[r] === autre[p]) { n++; if (r !== p) q = r; }
      if (n === 2 && q > p) par[racine(tri[q])] = racine(tri[p]);
    }
    const compte = new Int32Array(nt);
    for (let t = 0; t < nt; t++) compte[racine(t)]++;
    let best = 0; for (let t = 1; t < nt; t++) if (compte[t] > compte[best]) best = t;
    const neuf = new Int32Array(nv).fill(-1), p2 = [], i2 = [];
    for (let t = 0; t < nt; t++) {
      if (racine(t) !== best) continue;
      for (let c = 0; c < 3; c++) { const v = idx[3 * t + c];
        if (neuf[v] < 0) { neuf[v] = p2.length / 3; p2.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); }
        i2.push(neuf[v]); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(p2, 3));
    g.setIndex(i2);
    g.computeVertexNormals();
    return g.center();
  };
  gyroStand.smooth = true;  // treillis organique : pas d'arêtes à souligner
  return gyroStand;
}, { solides: 1 });
