/* Evarysth — fiche d'impression : pièces séparées, orientées, posées à z = 0 et rangées sur le plateau.
   Fiche (data.js, champ impression du produit) :
     orientation : rotation propre 3 × 3 (lignes, déterminant +1) du repère du modèle (Y vers le haut, comme l'aperçu)
                   vers celui du plateau (Z vers le haut) ;
     pieces      : facultatif, [{ nom, orientation? }] dans l'ordre des volumes décroissants (orientation propre à une pièce) ;
     supports (booléen), matiere, remarques ;
     parPlateau  : exemplaires complets par plateau, aux cotes par défaut ; ou, pour un produit livré en modules
                   qui ne tiennent pas sur un seul plateau, plateaux : nombre de plateaux par exemplaire (cotes par défaut).
   Plateau : Bambu Lab, 256 × 256 × 256 mm ; pièces écartées de 5 mm ; bande avant de MARGE_AVANT mm laissée libre
   (ligne de chargement de la buse du G-code de démarrage de la P2S, X 100 → 140 à Y ≈ 0 : Fabrication · phase 1a). */
export const PLATEAU = [256, 256, 256], ECART = 5, MARGE_AVANT = 10;
/* Surface utile du plateau (X, Y) */
export const UTILE = [PLATEAU[0], PLATEAU[1] - MARGE_AVANT];

const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
/* Rotation propre : orthonormée, déterminant +1 */
export const rotationPropre = m => Array.isArray(m) && m.length === 3 && m.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite))
  && [0, 1, 2].every(i => [0, 1, 2].every(j => Math.abs(m[i][0] * m[j][0] + m[i][1] * m[j][1] + m[i][2] * m[j][2] - (i === j ? 1 : 0)) < 1e-9))
  && Math.abs(det3(m) - 1) < 1e-9;
/* Matrice 4 × 4 colonne par colonne (Manifold.transform) */
const mat4 = m => [m[0][0], m[1][0], m[2][0], 0, m[0][1], m[1][1], m[2][1], 0, m[0][2], m[1][2], m[2][2], 0, 0, 0, 0, 1];

/* Contrôle de la fiche d'impression d'un produit (forme seulement) */
export function verifierFiche(p) {
  const f = p.impression, erreurs = [];
  if (!f) return { erreurs: ["pas de fiche d'impression (impression: {…} dans data.js)"] };
  if (!rotationPropre(f.orientation)) erreurs.push("fiche d'impression : orientation qui n'est pas une rotation propre (3 × 3, déterminant +1)");
  (f.pieces || []).forEach((q, i) => { if (q.orientation && !rotationPropre(q.orientation)) erreurs.push(`fiche d'impression : orientation de la pièce ${i + 1} invalide`); });
  if (typeof f.supports !== "boolean") erreurs.push("fiche d'impression : supports doit valoir true ou false");
  if ((f.parPlateau == null) === (f.plateaux == null)) erreurs.push("fiche d'impression : parPlateau ou plateaux (l'un des deux)");
  for (const k of ["parPlateau", "plateaux"]) if (f[k] != null && !(Number.isInteger(f[k]) && f[k] >= 1)) erreurs.push(`fiche d'impression : ${k} doit être un entier ≥ 1`);
  if (!f.matiere || f.matiere !== p.matiere) erreurs.push(`fiche d'impression : matière « ${f.matiere} » différente de celle du produit (« ${p.matiere} »)`);
  if (typeof f.remarques !== "string") erreurs.push("fiche d'impression : remarques (texte) manquantes");
  return { erreurs };
}

/* Pièces d'un résultat (Manifold, repère du modèle) : séparées, triées par volume décroissant, orientées selon la fiche,
   posées à z = 0, coin en (0, 0). Chaque pièce : { mf, taille, volume, appui (mm² à 0,1 mm du plateau), erreur? }.
   Les Manifold rendus sont à libérer par l'appelant. */
export function piecesImpression(mf, fiche) {
  const brutes = mf.decompose();
  const info = brutes.map(m => { const b = m.boundingBox(); return { m, vol: m.volume(), c: [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2) }; });
  info.sort((a, b) => (b.vol - a.vol) || (a.c[0] - b.c[0]) || (a.c[1] - b.c[1]) || (a.c[2] - b.c[2]));
  return info.map((q, i) => {
    const o = (fiche.pieces && fiche.pieces[i] && fiche.pieces[i].orientation) || fiche.orientation;
    const t = q.m.transform(mat4(o)), { min } = t.boundingBox(), pose = t.translate([-min[0], -min[1], -min[2]]);
    q.m.delete(); t.delete();
    const bb = pose.boundingBox(), taille = [0, 1, 2].map(k => bb.max[k] - bb.min[k]);
    const cs = pose.slice(0.1), appui = cs.area(); cs.delete();
    let erreur = null;
    const tient = (w, d) => w <= PLATEAU[0] && d <= PLATEAU[1];
    if (taille[2] > PLATEAU[2] || !(tient(taille[0], taille[1]) || tient(taille[1], taille[0])))
      erreur = `${taille.map(x => x.toFixed(1)).join(" × ")} mm, hors du volume ${PLATEAU.join(" × ")} mm`;
    return { mf: pose, taille, volume: q.vol, appui, erreur, nom: fiche.pieces && fiche.pieces[i] && fiche.pieces[i].nom };
  });
}

/* Rangement en rangées (étagères) sur des plateaux successifs, copies exemplaires de la liste de pièces ;
   rangées à partir de Y = MARGE_AVANT. Deux règles d'orientation essayées (côté long selon X, puis selon Y) : la
   première qui demande le moins de plateaux est gardée. Pièce plus profonde que la surface utile dans les deux sens
   (ex. boite-rugged aux cotes max, 252,8 × 253,8 mm) : seule sur son plateau, posée à Y = 0, signalée hors_marge
   (la ligne de chargement passe alors au ras de la pièce ; à surveiller à la première couche).
   Renvoie [[{ piece (indice), copie, x, y, tourne (90° autour de Z), w, d, hors_marge? }]] : une liste par plateau.
   Les pièces trop grandes (erreur) ne sont pas rangées. */
export function ranger(pieces, copies = 1) {
  const a = rangerSelon(pieces, copies, true), b = rangerSelon(pieces, copies, false);
  return b.length < a.length ? b : a;
}

function rangerSelon(pieces, copies, longSelonX) {
  const items = [];
  const tient = (w, d, aire) => w <= aire[0] && d <= aire[1];
  for (let c = 0; c < copies; c++) pieces.forEach((q, i) => {
    if (q.erreur) return;
    const [w0, d0] = q.taille;
    const options = [{ w: w0, d: d0, tourne: false }, { w: d0, d: w0, tourne: true }];
    if (longSelonX ? d0 > w0 : w0 > d0) options.reverse();
    const o = options.find(x => tient(x.w, x.d, UTILE)) || options.find(x => tient(x.w, x.d, PLATEAU));
    items.push({ piece: i, copie: c, ...o, hors_marge: !tient(o.w, o.d, UTILE) });
  });
  items.sort((a, b) => b.hors_marge - a.hors_marge || b.d - a.d || b.w - a.w);
  /* Premier emplacement libre : une rangée existante (tous plateaux), sinon une rangée neuve, sinon un plateau neuf */
  const plateaux = [];
  for (const it of items) {
    let place = null;
    if (!it.hors_marge) for (const pl of plateaux) {
      if (pl.plein) continue;
      for (const r of pl.rangees) if (r.x + it.w <= PLATEAU[0] && it.d <= r.h) { place = { pl, r }; break; }
      if (place) break;
      const y = pl.rangees.reduce((m, r) => Math.max(m, r.y + r.h + ECART), MARGE_AVANT);
      if (y + it.d <= PLATEAU[1]) { const r = { y, x: 0, h: it.d }; pl.rangees.push(r); place = { pl, r }; break; }
    }
    if (!place) {
      const pl = { rangees: [{ y: it.hors_marge ? 0 : MARGE_AVANT, x: 0, h: it.d }], poses: [], plein: it.hors_marge };
      plateaux.push(pl); place = { pl, r: pl.rangees[0] };
    }
    const { pl, r } = place;
    pl.poses.push({ piece: it.piece, copie: it.copie, x: r.x, y: r.y, tourne: it.tourne, w: it.w, d: it.d, ...(it.hors_marge ? { hors_marge: true } : {}) });
    r.x += it.w + ECART;
  }
  return plateaux.map(p => p.poses);
}

/* Nombre maximal d'exemplaires complets sur un plateau (au plus 64) */
export function maxParPlateau(pieces) {
  let n = 0;
  while (n < 64 && ranger(pieces, n + 1).length === 1) n++;
  return n;
}

/* Pièce placée sur le plateau (Manifold neuf) */
export function placer(piece, pose) {
  const r = pose.tourne ? piece.mf.rotate([0, 0, 90]) : piece.mf;
  const { min } = r.boundingBox();
  const out = r.translate([pose.x - min[0], pose.y - min[1], -min[2]]);
  if (r !== piece.mf) r.delete();
  return out;
}

/* Exemplaires par plateau (ou plateaux par exemplaire) déclarés, comparés au rangement des pièces aux cotes par défaut */
export function ecartPlateau(fiche, pieces) {
  if (fiche.plateaux != null) {
    const n = ranger(pieces).length;
    return n === fiche.plateaux ? null : `${fiche.plateaux} plateau(x) par exemplaire déclaré(s), ${n} au rangement`;
  }
  const max = maxParPlateau(pieces);
  if (fiche.parPlateau > max) return `${fiche.parPlateau} exemplaire(s) par plateau déclaré(s), ${max} au plus aux cotes par défaut`;
  return null;
}
