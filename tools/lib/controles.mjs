/* Evarysth — contrôles géométriques d'un produit, combinaison par combinaison.
   Utilisé par tools/verifier-geometrie.mjs, tools/generer-stl.mjs et les tests (tools/test/).
   Pour chaque combinaison de cotes : maillage étanche, nombre de solides déclaré, cotes fonctionnelles par coupe,
   paroi minimale, fiche d'impression (pièces posées sur le plateau), écart à la référence figée.

   Déclarations du modèle (assets/js/modeles/<modèle>.js, 3e argument de define) :
     solides : nombre de pièces séparées (ou fonction des valeurs, pour un nombre variable de modules) ;
     cotes   : (valeurs + jeu) → [{ nom, axe, en, mesure, selon?, attendu, tol? }]
       axe    : « x », « y » ou « z », normale du plan de coupe, qui passe par le point en = [x, y, z] ;
       mesure : « trou »     diamètre libre autour de en (2 × distance au bord de matière le plus proche ; en dans le vide) ;
                « diametre » diamètre extérieur autour de en (2 × distance au sommet le plus éloigné de la coupe) ;
                « largeur »  longueur, selon l'axe « selon », de l'intervalle (vide ou matière) qui contient en ;
                « etendue »  étendue de toute la coupe selon l'axe « selon » ;
                « boite »    étendue de la boîte englobante selon « selon » (sans coupe) ;
       attendu : valeur nominale (mm), tolérance tol (défaut 0,05 mm).
     paroi : { min (défaut 1,2 mm), seuil (mm², défaut min²), coupes: [{ axe, en }] } ; coupes par défaut : 3 plans médians.
   Repère des cotes et des coupes : « repère de construction », celui des pièces passées au dernier join()
   (la pose du solide, voir geo.js, ramène le résultat dans ce repère) ; résultat hors kit (BufferGeometry) : repère final. */
import { cotes as cotesProduit, modele, solidesAttendus, jeu as jeuProduit } from "./moteur.mjs";
import { piecesImpression, ranger, verifierFiche } from "./impression.mjs";

export const TOL = 0.05, PAROI = 1.2;
const IX = { x: 0, y: 1, z: 2 };
/* Rotation qui amène l'axe de coupe sur z (Manifold.slice coupe à z = h) ; coordonnées (u, v) du plan :
   axe x → (−z, y), axe y → (x, −z), axe z → (x, y) */
const ROT = { x: [0, -90, 0], y: [90, 0, 0], z: [0, 0, 0] };
const plan = (axe, [x, y, z]) => ({ x: [-z, y], y: [x, -z], z: [x, y] })[axe];
const UNITE = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const distSeg = ([px, py], [ax, ay], [bx, by]) => {
  const ux = bx - ax, uy = by - ay, t = Math.min(1, Math.max(0, ((px - ax) * ux + (py - ay) * uy) / (ux * ux + uy * uy || 1)));
  return Math.hypot(px - ax - t * ux, py - ay - t * uy);
};
const dedans = ([px, py], polys) => polys.reduce((n, p) => n + p.reduce((k, a, i) => {
  const b = p[(i + 1) % p.length];
  return k + (((a[1] > py) !== (b[1] > py)) && px < a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) ? 1 : 0);
}, 0), 0) % 2 === 1;
/* Intervalle de la droite pt + t·d (|d| = 1) qui contient t = 0, entre deux traversées du contour */
const intervalle = (pt, d, polys) => {
  let lo = -Infinity, hi = Infinity;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a[0] - pt[0], wy = a[1] - pt[1];
    const t = (wx * ey - wy * ex) / den, s = (wx * d[1] - wy * d[0]) / den;
    if (s < 0 || s > 1) continue;
    if (t >= 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
  }
  return hi - lo;
};

/* Solide dans le repère de construction (Manifold), à libérer par l'appelant */
export const repereConstruction = (r, mf) => r && r.isSolid && r.pose
  ? mf.transform(Array.from(r.pose.clone().invert().elements)) : mf;

/* Mesure d'une cote déclarée sur un Manifold (repère de construction) */
export function mesurerCote(mfc, c) {
  const tol = c.tol ?? TOL;
  if (c.mesure === "boite") {
    const { min, max } = mfc.boundingBox(), i = IX[c.selon];
    const val = max[i] - min[i];
    return { ...c, tol, valeur: val, ecart: val - c.attendu, ok: Math.abs(val - c.attendu) <= tol };
  }
  const tourne = mfc.rotate(ROT[c.axe]), cs = tourne.slice(c.en[IX[c.axe]]);
  const polys = cs.toPolygons().map(p => p.map(([x, y]) => [x, y]));
  tourne.delete(); cs.delete();
  const pt = plan(c.axe, c.en);
  let val = NaN, ok = polys.length > 0;
  if (c.mesure === "trou") {
    val = 2 * Math.min(...polys.flatMap(q => q.map((a, i) => distSeg(pt, a, q[(i + 1) % q.length]))));
    ok = ok && !dedans(pt, polys);
  } else if (c.mesure === "diametre") {
    val = 2 * Math.max(...polys.flat().map(([x, y]) => Math.hypot(x - pt[0], y - pt[1])));
  } else if (c.mesure === "largeur") {
    val = intervalle(pt, plan(c.axe, UNITE[c.selon]), polys);
  } else if (c.mesure === "etendue") {
    const d = plan(c.axe, UNITE[c.selon]), proj = polys.flat().map(([x, y]) => x * d[0] + y * d[1]);
    val = Math.max(...proj) - Math.min(...proj);
  } else throw new Error(`Mesure « ${c.mesure} » inconnue (${c.nom})`);
  ok = ok && Number.isFinite(val) && Math.abs(val - c.attendu) <= tol;
  return { ...c, tol, valeur: val, ecart: val - c.attendu, ok };
}

/* Paroi minimale e : chaque coupe est « ouverte » (offset −e/2 puis +e/2, coins ronds) ; ce qui disparaît est plus
   fin que e. On tolère les pertes d'angle (≤ e² mm² par morceau) ; au-delà, c'est une paroi trop fine. */
export function mesurerParoi(mfc, decl = {}, kit) {
  const e = decl.min ?? PAROI, seuil = decl.seuil ?? e * e;
  const { min, max } = mfc.boundingBox();
  const coupes = decl.coupes || ["x", "y", "z"].map(axe => {
    const i = IX[axe], en = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    en[i] += 0.0137 * (max[i] - min[i]);   // évite un plan confondu avec une face
    return { axe, en };
  });
  let pire = { perte: 0 };
  for (const c of coupes) {
    const tourne = mfc.rotate(ROT[c.axe]), cs = tourne.slice(c.en[IX[c.axe]]);
    const n = kit.segments(e / 2);
    const ero = cs.offset(-e / 2, "Round", 2, n), ouv = ero.offset(e / 2, "Round", 2, n), perdu = cs.subtract(ouv);
    const morceaux = perdu.decompose();
    const perte = Math.max(0, ...morceaux.map(m => m.area()));
    if (perte > pire.perte) pire = { perte, axe: c.axe, en: c.en };
    for (const o of [tourne, cs, ero, ouv, perdu, ...morceaux]) o.delete();
  }
  return { min: e, seuil, ...pire, ok: pire.perte <= seuil, coupes: coupes.length };
}

const fmtVals = v => Object.entries(v).map(([k, x]) => `${k}=${x}`).join(" ");
export const cleCombinaison = fmtVals;

/* Vérifie une combinaison de cotes d'un produit. Renvoie { erreurs: [...], details } (aucune exception attendue) */
export async function verifierCombinaison(p, vals, { reference, impression = true } = {}) {
  const { kit, calc, build } = await modele(p.model);
  const jeu = jeuProduit(p), v = cotesProduit(p, { valeurs: vals });
  const erreurs = [], details = { cle: fmtVals(v), jeu };
  const t0 = performance.now();
  const r = calc(v, jeu);
  details.ms = performance.now() - t0;
  const b = kit.bilan(r), attendu = solidesAttendus(build, { ...v, jeu });
  details.etanche = b.etanche; details.solides = b.solides; details.solidesAttendus = attendu;
  if (!b.etanche) { erreurs.push("maillage non étanche"); kit.flush(); return { erreurs, details }; }
  if (!Number.isInteger(attendu)) erreurs.push("le modèle ne déclare pas son nombre de solides (define(…, { solides }))");
  else if (b.solides !== attendu) erreurs.push(`${b.solides} solide(s), ${attendu} attendu(s)`);
  if (!(b.volume > 0)) erreurs.push("volume nul");
  const taille = [0, 1, 2].map(i => b.bbox.max[i] - b.bbox.min[i]);
  details.taille = taille; details.volume = b.volume;
  const mfc = repereConstruction(r, b.mf);
  try {
    /* Cotes fonctionnelles */
    if (typeof build.cotes !== "function") erreurs.push("le modèle ne déclare pas ses cotes (define(…, { cotes }))");
    else {
      details.cotes = build.cotes({ ...v, jeu }).map(c => mesurerCote(mfc, c));
      for (const c of details.cotes) if (!c.ok)
        erreurs.push(`cote « ${c.nom} » : ${Number.isFinite(c.valeur) ? c.valeur.toFixed(3) : "non mesurable"} mm au lieu de ${c.attendu.toFixed(3)} ± ${c.tol}`);
    }
    /* Paroi minimale */
    details.paroi = mesurerParoi(mfc, build.paroi, kit);
    if (!details.paroi.ok) erreurs.push(`paroi plus fine que ${details.paroi.min} mm : ${details.paroi.perte.toFixed(1)} mm² `
      + `perdus à l'ouverture (coupe ${details.paroi.axe} = ${details.paroi.en[IX[details.paroi.axe]].toFixed(1)}, seuil ${details.paroi.seuil.toFixed(2)} mm²)`);
    /* Fiche d'impression : pièces posées et rangées sur le plateau */
    if (impression) {
      const fiche = verifierFiche(p);
      erreurs.push(...fiche.erreurs);
      if (!fiche.erreurs.length) {
        const pcs = piecesImpression(b.mf, p.impression);
        details.pieces = pcs.map(q => ({ taille: q.taille, appui: q.appui, volume: q.volume }));
        if (Number.isInteger(attendu) && pcs.length !== attendu) erreurs.push(`impression : ${pcs.length} pièce(s) séparée(s), ${attendu} attendue(s)`);
        pcs.forEach((q, i) => {
          if (!(q.appui > 0)) erreurs.push(`impression : pièce ${i + 1} sans surface d'appui sur le plateau`);
          if (q.erreur) erreurs.push(`impression : pièce ${i + 1} : ${q.erreur}`);
        });
        if (!pcs.some(q => q.erreur)) details.plateaux = ranger(pcs).length;
        pcs.forEach(q => q.mf.delete());
      }
    }
    /* Référence figée */
    if (reference !== undefined) {
      const ref = reference && reference[details.cle];
      if (!ref) erreurs.push("absente du fichier de référence (node tools/verifier-geometrie.mjs --mettre-a-jour)");
      else {
        const d = ecartReference(ref, details);
        if (d) erreurs.push(`écart à la référence : ${d}`);
      }
    }
  } finally {
    if (mfc !== b.mf) mfc.delete();
    kit.flush();
  }
  return { erreurs, details };
}

/* Référence figée d'une combinaison : boîte (taille), volume, solides */
export const valeurReference = d => ({
  taille: d.taille.map(x => Math.round(x * 1000) / 1000),
  volume: Math.round(d.volume * 10) / 10,
  solides: d.solides
});
export const TOL_REF = { taille: 0.01, volume: 1e-4 };
export function ecartReference(ref, d) {
  const e = [];
  const t = d.taille.map((x, i) => x - ref.taille[i]);
  if (t.some(x => Math.abs(x) > TOL_REF.taille)) e.push(`boîte ${ref.taille.join(" × ")} → ${d.taille.map(x => x.toFixed(3)).join(" × ")} mm`);
  if (Math.abs(d.volume - ref.volume) > TOL_REF.volume * Math.abs(ref.volume)) e.push(`volume ${ref.volume} → ${d.volume.toFixed(1)} mm³`);
  if (d.solides !== ref.solides) e.push(`solides ${ref.solides} → ${d.solides}`);
  return e.join(", ");
}
