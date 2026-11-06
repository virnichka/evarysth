/* Modèle 3D « support-aerosol-skadis » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = diamètre de la bombe, b = hauteur du support */
MODULR.viewer3d.define("support-aerosol-skadis", ({ kit, rad }) => {
  /* Support d'aérosol SKADIS. Repère : y vers le haut (0 = dessous), dos contre le panneau en z = 0,
     gobelet vers +z. Reconstruit d'après le STL « bottle holder 54 » : dos plein, gobelet à paroi de 3 mm,
     côtés en creux, encoche en U à l'avant, fond ajouré qui retient la bombe par son rebord.
     Accroche SKADIS : 2 crochets en haut et 2 ergots 40 mm plus bas (pas des trous du panneau). */
  const aerosol = (T, { a, b }) => {
    const k = kit(T);
    const ri = a / 2 + 0.75, t = 3, ro = ri + t, cz = 5 + ri, H = b, ft = 4, rn = 0.25 * a;
    const hs = 0.45 * H, hh = 0.65 * H, hf = ft + 6;  // creux des côtés, cornes avant, fond de l'encoche
    const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
    /* Hauteur du bord selon l'angle θ (0 = avant, ±90° = jonction avec le dos) */
    const top = th => {
      const zf = Math.cos(th), x = ri * Math.sin(th);
      let h = zf < 0.35 ? H + (hs - H) * ss(0, 0.35, zf) : hs + (hh - hs) * ss(0.35, 0.8, zf);
      if (Math.abs(x) < rn) h = Math.min(h, hf + rn - Math.sqrt(rn * rn - x * x));
      return h;
    };
    /* Paroi avant (-90° → 90°) : normales radiales exactes, faces orientées vers l'extérieur */
    const pos = [], nor = [];
    const tri = (p, q, r, np, nq, nr, out) => {
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { [q, r] = [r, q]; [nq, nr] = [nr, nq]; }
      const fl = Math.hypot(...n) || 1, nf = n.map(c => c / fl * Math.sign(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] || 1));
      pos.push(...p, ...q, ...r); nor.push(...(np || nf), ...(nq || nf), ...(nr || nf));
    };
    const quad = (p, q, r, s, out, n1, n2) => { tri(p, q, r, n1, n2, n2, out); tri(p, r, s, n1, n2, n1, out); };
    const N = 180, P = (r, th, y) => [r * Math.sin(th), y, cz + r * Math.cos(th)];
    for (let i = 0; i < N; i++) {
      const A = rad(-90 + 180 * i / N), B = rad(-90 + 180 * (i + 1) / N), M = (A + B) / 2;
      const hA = top(A), hB = top(B);
      const rA = [Math.sin(A), 0, Math.cos(A)], rB = [Math.sin(B), 0, Math.cos(B)], rM = [Math.sin(M), 0, Math.cos(M)];
      const neg = v => v.map(c => -c);
      quad(P(ri, A, 0), P(ri, B, 0), P(ri, B, hB), P(ri, A, hA), neg(rM), neg(rA), neg(rB));
      quad(P(ro, A, 0), P(ro, B, 0), P(ro, B, hB), P(ro, A, hA), rM, rA, rB);
      quad(P(ri, A, hA), P(ri, B, hB), P(ro, B, hB), P(ro, A, hA), [0, 1, 0]);
      quad(P(ri, A, 0), P(ri, B, 0), P(ro, B, 0), P(ro, A, 0), [0, -1, 0]);
    }
    const wall = new T.BufferGeometry();
    wall.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    wall.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
    /* Dos plein : rectangle jusqu'au centre du gobelet, creusé de la demi-paroi arrière */
    const back = [[ro, -cz], [ro, 0], [-ro, 0], [-ro, -cz],
      ...Array.from({ length: 49 }, (_, i) => { const th = rad(-90 - 180 * i / 48); return [ri * Math.sin(th), -(cz + ri * Math.cos(th))]; })];
    const yT = H - 14;
    return k.join(
      wall,
      k.ext(back, H).rotateX(-Math.PI / 2).translate(0, H / 2, 0),
      k.cyl(ri, ft, ri - 9).translate(0, ft / 2, cz),
      ...[-20, 20].flatMap(x => [
        k.box(4.6, 8, 6, x, yT, -3),          // tige qui traverse le panneau (5 mm)
        k.box(4.6, 14, 3, x, yT + 3, -7.5),   // crochet qui remonte derrière le panneau
        k.box(4.6, 10, 4, x, yT - 40, -2)     // ergot anti-rotation, 40 mm plus bas
      ]));
  };
  return aerosol;
});
