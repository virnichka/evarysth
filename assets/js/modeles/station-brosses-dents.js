/* Modèle 3D « station-brosses-dents » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Socle à poser pour chargeurs ronds Oral-B (type 3757) : rangée avant de a logements de chargeur, rangée arrière de b
   supports de pose (cuvette + picot), centrées, fondues en une pièce (cuvettes réunies par des raccords arrondis).
   Cotes fonctionnelles reprises des STL « Oral-B toothbrush holder » (1 et 2 chargeurs) :
   - logement du chargeur, traversant (le chargeur repose sur le plan de travail) : ellipse 47,54 × 60,54 mm jusqu'à
     14,5 mm de haut, puis qui suit le galbe du chargeur jusqu'à 41,46 × 54,46 mm à 28,3 mm (haut du socle) ;
   - sortie de câble à l'arrière du logement : 27 mm de large, 14 mm de haut, prolongée sous le socle par une gorge
     de 8 × 6 mm jusqu'au bord arrière (le socle reste à plat, câble dessous) ;
   - support de pose : cuvette elliptique 31,24 × 36 mm, 10 mm de profondeur (congé de 1,5 mm au fond), picot de
     6,98 × 8,76 mm (section en goutte, mesurée à mi-hauteur, dépouille de 1°, tête arrondie) qui dépasse de 13 mm du
     fond, décalé de 3 mm vers l'arrière.
   Les STL sont dessinés pour le PLA (jeu 0,2 mm, déjà compté) : logement et cuvette + (jeu − 0,2), picot − (jeu − 0,2).
   Repère : Y vers le haut (dessous en y = 0), X la largeur, Z vers l'avant ; rangée des chargeurs en z = 0. */
(() => {
  const H = 28.3, T = 3.2, ECART = 4, PC = 52, PS = 37, RACCORD = 10, ARRONDI = 2;   // ARRONDI : arête du dessus
  /* [y, demi-largeur] du logement (demi-longueur = + 6,5) ; relevés du STL à 16, 20, 26 et 28,3 mm à moins de 0,05 mm */
  const SOCLE = [[-1, 23.77], [14.5, 23.77], [18, 23.29], [22, 22.5], [25, 21.72], [27, 21.13], [H + 1, 20.42]];
  const LONG = 6.5, CUV = [15.62, 18.0], PROF = 10, CONGE = 1.5, PICOT = 13, DECALE = 3.0;
  /* Section du picot (u en largeur, v vers l'arrière), relevée à mi-hauteur sur le STL, symétrisée */
  const DEMI = [[0, -4.37], [0.7, -4.33], [1.33, -4.18], [1.87, -3.96], [2.16, -3.8], [2.33, -3.65], [2.49, -3.46], [2.61, -3.26],
    [2.7, -3.03], [2.76, -2.8], [3.47, 2.12], [3.49, 2.35], [3.46, 2.6], [3.4, 2.84], [3.3, 3.07], [3.16, 3.27], [2.99, 3.45],
    [2.81, 3.58], [2.69, 3.65], [2.05, 3.99], [1.29, 4.25], [0.89, 4.31], [0, 4.39]];
  const PICOT_PTS = [...DEMI, ...DEMI.slice(1, -1).reverse().map(([u, v]) => [-u, v])];
  const MI = 5.76, DEPOUILLE = 0.0187;                    // hauteur de la section relevée, dépouille (mm par mm, par côté)

  const nEll = (A, B) => Math.max(48, Math.ceil(Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B))) / 0.5 / 4) * 4);
  const ell = (cx, cz, A, B, n = nEll(A, B)) => Array.from({ length: n }, (_, i) => {
    const t = i / n * 2 * Math.PI;
    return [cx + A * Math.cos(t), cz + B * Math.sin(t)];
  });
  /* Écart mini entre deux contours (échantillonnés) ; négatif si l'un contient un point de l'autre */
  const dedans = ([x, z], cx, cz, A, B) => ((x - cx) / A) ** 2 + ((z - cz) / B) ** 2 < 1;
  const ecart = (e1, e2) => {
    const p1 = ell(e1[0], e1[1], e1[2], e1[3], 96), p2 = ell(e2[0], e2[1], e2[2], e2[3], 96);
    if (p2.some(p => dedans(p, ...e1)) || p1.some(p => dedans(p, ...e2))) return -1;
    let d = Infinity;
    for (const [x1, z1] of p1) for (const [x2, z2] of p2) d = Math.min(d, Math.hypot(x1 - x2, z1 - z2));
    return d;
  };
  /* Disposition : chargeurs en z = 0, supports en z = −D (D minimal pour garder ECART entre logement et cuvette) */
  const disposition = (a, b, jeu) => {
    a = Math.round(a); b = Math.round(b);
    const dj = (jeu - 0.2) / 2, As = SOCLE[0][1] + dj, Bs = As + LONG, Ac = CUV[0] + dj, Bc = CUV[1] + dj;
    const xc = Array.from({ length: a }, (_, i) => (i - (a - 1) / 2) * PC), xs = Array.from({ length: b }, (_, j) => (j - (b - 1) / 2) * PS);
    const ok = D => xc.every(x1 => xs.every(x2 => ecart([x1, 0, As, Bs], [x2, -D, Ac, Bc]) >= ECART));
    let lo = Bs, hi = Bs + Bc + ECART + 1;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return { xc, xs, D: Math.round(hi * 100) / 100, dj, As, Bs, Ac, Bc };
  };

  EVARYSTH.viewer3d.define("station-brosses-dents", ({ m }) => m((k, { a, b, jeu = 0 }) => {
    const { Manifold, CrossSection } = k;
    const L = disposition(a, b, jeu), { xc, xs, D, dj, Bs, Ac, Bc } = L;
    const sec = cs => ({ isSection: true, cs, polygons: () => cs.toPolygons().map(p => p.map(([x, y]) => [x, y])) });
    const hull = pts => k.solid(Manifold.hull(pts)).mf;
    const anneau = (pts2, y, f) => pts2.map(([u, v]) => [...f(u, v), y]).map(([x, z, yy]) => [x, yy, z]);

    /* Corps : union des empreintes (logements et cuvettes + paroi), raccords concaves, arête du dessus arrondie.
       Contour décoratif : 96 segments par ellipse. Profil 2D en (x, −z) ; l'extrusion est posée par la rotation propre
       (x, y, z) → (x, z, −y), chaque sommet du haut rentré le long de sa bissectrice (quart de rond de rayon ARRONDI). */
    const own = mf => k.solid(mf).mf;
    const empreintes = [...xc.map(x => ell(x, 0, L.As + T, Bs + T, 96)), ...xs.map(x => ell(x, -D, Ac + T, Bc + T, 96))]
      .map(p => k.section(p.map(([x, z]) => [x, -z])).cs);
    const contour = k.conge(sec(CrossSection.union(empreintes)), RACCORD, { convexes: false });
    const rentre = new Map(), cle = (x, y) => Math.round(x * 1e4) + "," + Math.round(y * 1e4);
    for (const p of contour.polygons()) p.forEach(([x, y], i) => {
      const [px, py] = p[(i + p.length - 1) % p.length], [nx, ny] = p[(i + 1) % p.length];
      const l1 = Math.hypot(x - px, y - py) || 1, l2 = Math.hypot(nx - x, ny - y) || 1;
      const n1 = [-(y - py) / l1, (x - px) / l1], n2 = [-(ny - y) / l2, (nx - x) / l2];
      const bx = n1[0] + n2[0], by = n1[1] + n2[1], c = (bx * n1[0] + by * n1[1]) / (Math.hypot(bx, by) || 1);
      const f = 1 / (Math.hypot(bx, by) || 1) / Math.max(c, 0.5);
      rentre.set(cle(x, y), [bx * f, by * f]);
    });
    const niv = [[0, 0], [H - ARRONDI, 0], ...Array.from({ length: 4 }, (_, i) => {
      const p = (i + 1) / 4 * Math.PI / 2;
      return [H - ARRONDI + ARRONDI * Math.sin(p), ARRONDI * (1 - Math.cos(p))];
    })];
    const corps = own(own(contour.cs.extrude(niv.length - 1, niv.length - 2, 0, [1, 1], false)).warpBatch((v, count) => {
      for (let i = 0; i < count; i++) {
        const x = v[3 * i], y = v[3 * i + 1], [h, o] = niv[Math.round(v[3 * i + 2])], d = rentre.get(cle(x, y)) || [0, 0];
        v[3 * i] = x + d[0] * o; v[3 * i + 1] = h; v[3 * i + 2] = -(y + d[1] * o);
      }
    }));

    /* Creux : logements (enveloppe convexe des sections du galbe), sortie de câble, gorge, cuvettes */
    const creux = [];
    for (const x of xc) {
      creux.push(hull(SOCLE.flatMap(([y, A]) => anneau(ell(0, 0, A + dj, A + dj + LONG), y, (u, v) => [x + u, v]))));
      const r = 6, sortie = [[-13.5, -1], [13.5, -1], ...Array.from({ length: 9 }, (_, i) => {
        const t = i / 8 * Math.PI / 2;
        return [13.5 - r + r * Math.cos(t), 14 - r + r * Math.sin(t)];
      }), ...Array.from({ length: 9 }, (_, i) => {
        const t = Math.PI / 2 + i / 8 * Math.PI / 2;
        return [-13.5 + r + r * Math.cos(t), 14 - r + r * Math.sin(t)];
      })];
      const Ls = Bs + T + 1.5, Lg = D + Bc + T + 12;
      creux.push(k.ext(sortie, Ls).translate(x, 0, -Ls / 2).mf);
      const gorge = [[-4, -1], [4, -1], ...Array.from({ length: 17 }, (_, i) => {
        const t = i / 16 * Math.PI;
        return [4 * Math.cos(t), 2 + 4 * Math.sin(t)];
      })];
      creux.push(k.ext(gorge, Lg).translate(x, 0, -Lg / 2).mf);
    }
    const fond = H - PROF;
    for (const x of xs) {
      const niv = Array.from({ length: 5 }, (_, i) => {
        const p = i / 4 * Math.PI / 2;
        return [fond + CONGE * (1 - Math.cos(p)), -CONGE + CONGE * Math.sin(p)];
      });
      niv.push([H + 1, 0]);
      creux.push(hull(niv.flatMap(([y, o]) => anneau(ell(0, 0, Ac + o, Bc + o), y, (u, v) => [x + u, -D + v]))));
    }

    /* Picots : section relevée, dépouille, tête arrondie (r 1,2), petit congé au pied */
    const dp = -(jeu - 0.2) / 2, rt = 1.2, tete = PICOT - rt;
    const off = d => Math.abs(d) < 1e-6 ? PICOT_PTS : k.offset(PICOT_PTS, d, "Miter").polygons()[0];
    const dAt = t => dp + DEPOUILLE * (MI - t);
    const picots = [];
    for (const x of xs) {
      const pose = (u, v) => [x + u, -D - DECALE - v];
      const niv = [[-0.5, dAt(0)], [0, dAt(0)], [tete, dAt(tete)],
        ...Array.from({ length: 6 }, (_, i) => {
          const p = (i + 1) / 6 * Math.PI / 2;
          return [tete + rt * Math.sin(p), dAt(tete) - rt * (1 - Math.cos(p))];
        })];
      picots.push(hull(niv.flatMap(([t, d]) => anneau(off(d), fond + t, pose))));
      picots.push(hull([[-0.5, dAt(0) + 0.8], [0, dAt(0) + 0.8], [0.8, dAt(0.8)]]
        .flatMap(([t, d]) => anneau(off(d), fond + t, pose))));
    }

    const piece = Manifold.union([Manifold.difference([corps, ...creux]), ...picots]);
    return k.join(k.solid(piece));
  }), {
    solides: 1,
    /* Repère de construction : dessous en y = 0, logements en z = 0 (x = xc), supports en z = −D (x = xs) */
    cotes: ({ a, b, jeu }) => {
      const { xc, xs, D } = disposition(a, b, jeu), j = jeu - 0.2;
      return [
        { nom: "logement du chargeur, largeur à la base (+ jeu)", axe: "y", en: [xc[0], 7, 0], mesure: "largeur", selon: "x", attendu: 47.54 + j },
        { nom: "logement du chargeur, longueur à 22 mm (+ jeu)", axe: "y", en: [xc[0], 22, 0], mesure: "largeur", selon: "z", attendu: 58.0 + j },
        { nom: "picot de pose, largeur (− jeu)", axe: "y", en: [xs[0], H - PROF + MI, -D - DECALE - 2.35], mesure: "largeur", selon: "x", attendu: 6.98 - j },
        { nom: "picot de pose, longueur (− jeu)", axe: "y", en: [xs[0], H - PROF + MI, -D - DECALE], mesure: "largeur", selon: "z", attendu: 8.76 - j }];
    }
  });
})();
