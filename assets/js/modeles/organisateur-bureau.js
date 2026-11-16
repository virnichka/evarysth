/* Modèle 3D « organisateur-bureau » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* Organisateur de bureau d'une seule pièce, sans cote : trois choix (a montre, b écouteurs, c emplacement libre).
   Reconstruction paramétrique du prototype (assets/models/organisateur-bureau/), remise au style Evarysth.
   Repère de construction : X la largeur (0 à gauche), Y vers le haut (dessous en y = 0), Z vers l'avant (dos en z = 0).
   - Socle plein 242 × 165 × 12 mm ; dessous : rainures à câble à clipser (bouche 3,4 mm, logement Ø 4,4 mm), toutes
     menées à une seule encoche à l'arrière, sous la tour.
   - Support de téléphone (à gauche ; 2ᵉ en option à 95 mm) : appui à 38 mm, rebord avant à 18 mm du dossier incliné
     de 20°, rien sur les côtés. Sous la prise du téléphone, un puits (15 × 16,5 mm) ; une fente de 5 mm (plus étroite
     que la prise) le relie à l'avant sur toute la hauteur : le câble s'y glisse par l'avant et rejoint sa rainure, la
     prise débranchée reste posée sur le rebord.
   - Tour (à droite, 46 × 46 × 150 mm) : 2 crochets à clés montant à 45° sur sa face extérieure, coupelle sur le dessus,
     poteau de montre (34 × 22 mm, jusqu'à 205 mm) : le bracelet fermé s'enfile par le haut ; palet de charge logé dans
     sa face avant (logement en goutte, imprimable), câble par une rainure qui passe sur le poteau puis descend le dos.
   - Pot à stylos (Ø 45 mm intérieur, 80 mm de profondeur) et vide-poche arrière, derrière les téléphones.
   - Écouteurs (devant la tour) : coupelle, berceau USB-C (prise par le dessous, fente vers la droite), ou logement
     par-dessous d'un chargeur MagSafe ou d'un palet Qi (2 mm de plastique au-dessus). */
(() => {
  const W = 242, D = 165, HS = 12;                           // socle
  const XT = [40, 135];                      // axes des supports de téléphone (entraxe 95)
  const LARGE_DOCK = 56, AV = 163, LEVRE = 4, APPUI = 38, REBORD = 9, PROF = 18, PENTE = 20, H_DOS = 112, EP_DOS = 8.5;
  const FENTE = 5, PUITS = [15, 16.5];
  const TOUR = [196, 242, 0, 46], H_TOUR = 150, POTEAU = [204, 238, 0, 22], H_POTEAU = 205, Y_PALET = 178;
  const POT = { x: 165.5, z: 28.5, r: 22.5, ext: 25.5, fond: 20, haut: 100 };
  const EC = { x: 200, z: 105 };                              // centre de la zone écouteurs
  const RAINURE = { bouche: 3.4, logement: 4.4 };
  /* Palets de montre : Ø nominal (mm) et profondeur du logement (le palet dépasse de 1 à 2 mm) */
  const PALETS = { apple: [27.6, 6.5], "apple-rapide": [27.6, 7.5], galaxy: [29.3, 6], pixel: [29, 6] };
  /* Chargeurs d'écouteurs par-dessous : Ø nominal, profondeur du logement */
  const PADS = { magsafe: [56, 5.8], qi: [72, 9.5] };
  const CUVETTE = { plateau: 3, magsafe: HS - 5.8 - 2, qi: 0.5 };   // creux de la coupelle Ø 72 sur le dessus
  const tg = Math.tan(PENTE * Math.PI / 180);
  const dossier = AV - LEVRE - PROF;                          // pied du dossier (z)

  EVARYSTH.viewer3d.define("organisateur-bureau", ({ m }) => m((k, { a = "apple", b = "plateau", c = "telephone", jeu = 0 }) => {
    const { Manifold: M, CrossSection: CS, segments } = k;
    const o = mf => k.solid(mf).mf;
    /* Arc : corde ≤ 0,5 mm (cotes mesurées) ; n fixé pour un contour décoratif */
    const arc = (cx, cy, r, a0, a1, n = Math.max(2, Math.ceil(segments(r) * Math.abs(a1 - a0) / 360))) => {
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
        return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
      });
    };
    /* Rectangle arrondi [x0, x1] × [y0, y1] (sens direct ; contour décoratif : r segments par quart, 4 au moins) */
    const rr = (x0, x1, y0, y1, r, n = Math.max(4, Math.round(r))) => [...arc(x1 - r, y0 + r, r, -90, 0, n),
      ...arc(x1 - r, y1 - r, r, 0, 90, n), ...arc(x0 + r, y1 - r, r, 90, 180, n), ...arc(x0 + r, y0 + r, r, 180, 270, n)];
    const xz = pts => pts.map(([x, z]) => [x, -z]);
    /* Prismes : vertical (contour en x, z), selon X (profil en z, y), selon Z (profil en x, y) ; version « arrondie »
       (arêtes des deux faces d'extrémité arrondies au rayon r, contour conservé) */
    const versY = (mf, y0) => o(mf.rotate([-90, 0, 0]).translate([0, y0, 0]));
    const prismeY = (pts, y0, y1) => versY(o(k.section(xz(pts)).cs.extrude(y1 - y0)), y0);
    const rondY = (pts, y0, y1, r) => versY(k.extArrondi(k.offset(xz(pts), -r, "Round"), y1 - y0, r).mf, (y0 + y1) / 2);
    const rondX = (sec, x0, x1, r) => o(k.extArrondi(k.offset(sec, -r, "Round"), x1 - x0, r).mf
      .rotate([0, 90, 0]).translate([(x0 + x1) / 2, 0, 0]));
    const prismeZ = (pts, z0, z1) => o(k.section(pts).cs.extrude(z1 - z0).translate([0, 0, z0]));
    const boite = (x0, x1, y0, y1, z0, z1) => o(M.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]));
    const cylY = (x, z, r, y0, y1, n = segments(r)) => o(M.cylinder(y1 - y0, r, r, n).rotate([-90, 0, 0]).translate([x, y0, z]));

    /* Rainure à clipser : profil en trou de serrure (bouche, puis logement rond), le long du segment p0 → p1,
       ouverte du côté opposé à v (v : direction vers la matière) */
    const rb = RAINURE.logement / 2, hb = RAINURE.bouche / 2, cb = 1.4 + rb;
    const vb = cb - Math.sqrt(rb * rb - hb * hb), a0 = Math.atan2(vb - cb, hb) * 180 / Math.PI;
    const serrure = k.section([[-hb, -1], [hb, -1], [hb, vb], ...arc(0, cb, rb, a0, 180 - a0).slice(1, -1), [-hb, vb]]).cs;
    const rainure = (p0, p1, v, e = rb) => {
      const d = p1.map((q, i) => q - p0[i]), L = Math.hypot(...d), w = d.map(q => q / L);
      const u = [v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]], og = p0.map((q, i) => q - e * w[i]);
      return o(serrure.extrude(L + 2 * e).transform([...u, 0, ...v, 0, ...w, 0, ...og, 1]));
    };
    const dessous = pts => pts.slice(1).map((p, i) => rainure([pts[i][0], 0, pts[i][1]], [p[0], 0, p[1]], [0, 1, 0]));

    const plein = [], creux = [];
    /* Socle */
    plein.push(rondY(rr(0, W, 0, D, 12), 0, HS, 2));

    /* Supports de téléphone : profil (z, y) → (−z, y) ; congés de 1,5 mm, arêtes latérales arrondies à 1 mm */
    const xDos = y => dossier - (y - APPUI) * tg;
    const profil = [[AV, HS - 2], [AV, APPUI + REBORD], [AV - LEVRE, APPUI + REBORD], [AV - LEVRE, APPUI], [dossier, APPUI],
      [xDos(APPUI + H_DOS), APPUI + H_DOS], [xDos(APPUI + H_DOS) - EP_DOS, APPUI + H_DOS], [dossier - EP_DOS, APPUI],
      [dossier - EP_DOS, HS - 2]].map(([z, y]) => [-z, y]);
    const secDock = k.conge(profil, 1.5);
    const docks = c === "telephone" ? XT : XT.slice(0, 1);
    for (const x of docks) {
      plein.push(rondX(secDock, x - LARGE_DOCK / 2, x + LARGE_DOCK / 2, 1));
      creux.push(boite(x - PUITS[0] / 2, x + PUITS[0] / 2, 14, 60, dossier + 1, dossier + 1 + PUITS[1]));
      creux.push(boite(x - FENTE / 2, x + FENTE / 2, -1, 60, dossier + 1, D + 1));
    }
    /* Rainures du dessous jusqu'à l'encoche arrière (sans croisement) */
    creux.push(...dessous([[XT[0], D + 1], [XT[0], 22], [214, 22], [214, 10]]));
    if (c === "telephone") creux.push(...dessous([[XT[1], D + 1], [XT[1], 30], [221, 30], [221, 10]]));
    creux.push(...dessous([[230, EC.z], [230, 10]]));
    creux.push(boite(205, 237, -1, 9, -1, 14));                               // encoche arrière (sortie unique)

    /* Vide-poche arrière et pot à stylos */
    plein.push(rondY(rr(4, 136, 3, 60, 10), HS - 2, 40, 1.5));
    creux.push(prismeY(rr(7, 133, 6, 57, 7), HS + 2, 50));
    plein.push(cylY(POT.x, POT.z, POT.ext, HS - 2, POT.haut, 128));
    creux.push(cylY(POT.x, POT.z, POT.r, POT.fond, POT.haut + 2));

    /* Tour, coupelle, poteau de montre */
    plein.push(rondY(rr(...TOUR, 10), HS - 2, H_TOUR, 2));
    creux.push(prismeY(rr(201, 237, 25, 41, 6), H_TOUR - 3, H_TOUR + 10));
    plein.push(rondY(rr(...POTEAU, 8), H_TOUR - 2, H_POTEAU, 3));
    const xm = (POTEAU[0] + POTEAU[1]) / 2, zf = POTEAU[3];
    if (PALETS[a]) {
      const r = (PALETS[a][0] + jeu) / 2;
      const goutte = [...arc(xm, Y_PALET, r, 135, 405), [xm, Y_PALET + r * Math.SQRT2]];
      creux.push(prismeZ(goutte, zf - PALETS[a][1], zf + 1));
    }
    /* Câble de montre : face avant (depuis le palet), dessus du poteau, puis tout le dos jusqu'à l'encoche */
    creux.push(rainure([xm, Y_PALET, zf], [xm, H_POTEAU + 2, zf], [0, 0, -1]));
    creux.push(rainure([xm, H_POTEAU, zf + 2], [xm, H_POTEAU, -2], [0, -1, 0]));
    creux.push(rainure([xm, H_POTEAU + 2, 0], [xm, 8, 0], [0, 0, 1]));
    /* Crochets à clés (10 mm de large, congés de 1 mm) : barre montant à 45° (dessous imprimable sans support), face extérieure de la tour */
    const crochet = k.conge([[TOUR[1] - 2, 128], [TOUR[1] + 11, 141], [TOUR[1] + 11, 149], [TOUR[1] - 2, 136]], 1);
    for (const z of [11, 35]) plein.push(o(crochet.cs.extrude(10).translate([0, 0, z - 5])));

    /* Écouteurs */
    if (b === "usbc") {
      plein.push(rondY(rr(EC.x - 18, EC.x + 18, EC.z - 36, EC.z + 36, 10), HS - 2, 30, 1.5));
      creux.push(prismeY(rr(EC.x - 14, EC.x + 14, EC.z - 33, EC.z + 33, 10), 23, 40));
      creux.push(boite(EC.x - 3.6, EC.x + 3.6, 5, 24, EC.z - 6.6, EC.z + 6.6));     // surmoulage de la prise
      creux.push(boite(EC.x, W + 1, -1, 31, EC.z - 2.3, EC.z + 2.3));               // fente d'insertion du câble
      creux.push(...dessous([[EC.x, EC.z], [230, EC.z]]));
    } else {
      creux.push(cylY(EC.x, EC.z, 36, HS - CUVETTE[b], HS + 1, 144));
      if (PADS[b]) {
        creux.push(cylY(EC.x, EC.z, (PADS[b][0] + jeu) / 2, -1, PADS[b][1]));
        creux.push(boite(EC.x, 234, -1, PADS[b][1], EC.z - 6.5, EC.z + 6.5));        // sortie du câble ou de la prise
      }
    }

    /* Emplacement libre */
    const xc = XT[1];
    if (c === "lunettes") {
      plein.push(rondY(rr(xc - 25.5, xc + 25.5, 85, AV - 2, 9), HS - 2, 77, 1.5));
      creux.push(prismeY(rr(xc - 22.5, xc + 22.5, 88, AV - 5, 6), HS + 2, 90));
      creux.push(prismeZ([...arc(xc, 67, 15, 180, 360), [xc + 15, 90], [xc - 15, 90]], AV - 10, D + 1));
    } else if (c === "vide-poche") {
      plein.push(rondY(rr(86, 162, 92, AV - 2, 10), HS - 2, 34, 1.5));
      creux.push(prismeY(rr(89, 159, 95, AV - 5, 7), HS + 2, 50));
    }

    const piece = M.difference([o(M.union(plein)), o(M.union(creux))]);
    return k.join(k.solid(piece));
  }), {
    solides: 1,
    /* Repère de construction : voir l'en-tête (X largeur, Y haut, Z avant) */
    cotes: ({ a, b, c, jeu }) => {
      const L = [
        { nom: "appui du téléphone, rebord à 18 mm du dossier", axe: "x", en: [XT[0] + 18, APPUI + 2, AV - LEVRE - 5], mesure: "largeur", selon: "z", attendu: PROF + 2 * tg },
        { nom: "fente du câble de téléphone (plus étroite que la prise)", axe: "y", en: [XT[0], APPUI + 4, AV - 2], mesure: "largeur", selon: "x", attendu: FENTE },
        { nom: "rainure à clipser, bouche", axe: "y", en: [XT[0], 0.5, 100], mesure: "largeur", selon: "x", attendu: RAINURE.bouche },
        { nom: "pot à stylos, Ø intérieur", axe: "y", en: [POT.x, 60, POT.z], mesure: "trou", attendu: 2 * POT.r }
      ];
      if (PALETS[a]) L.push({ nom: "logement du palet de montre, Ø (+ jeu)", axe: "z", en: [221, Y_PALET, 20], mesure: "trou", attendu: PALETS[a][0] + jeu });
      if (PADS[b]) L.push({ nom: "logement du chargeur d'écouteurs, Ø (+ jeu)", axe: "y", en: [EC.x, 2, EC.z], mesure: "trou", attendu: PADS[b][0] + jeu });
      if (c === "lunettes") L.push({ nom: "étui à lunettes, intérieur (largeur)", axe: "y", en: [XT[1], 50, 120], mesure: "largeur", selon: "x", attendu: 45 },
        { nom: "étui à lunettes, intérieur (profondeur)", axe: "y", en: [XT[1], 30, 120], mesure: "largeur", selon: "z", attendu: 70 });
      return L;
    }
  });
})();
