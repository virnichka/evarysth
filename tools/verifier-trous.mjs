#!/usr/bin/env node
/* Evarysth — contrôle des cotes fonctionnelles par coupe (Manifold.slice), aux combinaisons min/défaut/max.
   Pour chaque contrôle : on coupe le solide perpendiculairement à l'axe du trou, puis on mesure, autour du centre
   nominal, le diamètre libre (2 × distance au bord de matière le plus proche) et, pour un fût, le diamètre extérieur.
   Exigences : trou → diamètre libre ≥ cote − 0,05 mm ; fût → extérieur ≤ cote et ≥ cote − 0,05 mm.
   Usage : node tools/verifier-trous.mjs [produit…]   (refonte, phase 3 ; la phase 4 fera déclarer ces contrôles
   par les modèles eux-mêmes). Coordonnées : repère du modèle avant le centrage final de join(). */
import { produits, modele } from "./lib/moteur.mjs";

const TOL = 0.05;
/* centre [u, v] dans le plan de coupe ; axe x : (−z, y), axe y : (x, −z), axe z : (x, y) ; at : position de la coupe */
const CONTROLES = {
  "cintre-sac": ({ a }) => [
    { nom: "crochet sur la tringle (voile)", axe: "z", at: -20, pt: [0, 13], trou: a + 1, cote: a },
    { nom: "crochet sur la tringle (milieu)", axe: "z", at: 0, pt: [0, 13], trou: a + 1, cote: a }],
  "passe-cable": ({ a }) => [
    { nom: "fût dans le trou du plateau", axe: "y", at: -10, pt: [0, 0], fut: a, cote: a },
    { nom: "passage des câbles (fût)", axe: "y", at: -10, pt: [0, 0], trou: a - 6 }],
  "crochet-appui-tete": ({ a, b, c }) => [
    { nom: "œillet sur la tige", axe: "y", at: 98.5, pt: [0, c], trou: a + 1, cote: a },
    ...[-15, 15].map(x => ({ nom: `petit crochet x = ${x} (tablette)`, axe: "x", at: x, pt: [-(3 + b / 2), 45 + b / 2 + 3], trou: b, cote: b }))]
};

const combos = prm => prm.reduce((acc, q) => acc.flatMap(c => [...new Set([q.min, q.def, q.max])].map(x => ({ ...c, [q.key]: x }))), [{}]);
const ROT = { x: [0, -90, 0], y: [90, 0, 0], z: [0, 0, 0] };
const distSeg = ([px, py], [ax, ay], [bx, by]) => {
  const ux = bx - ax, uy = by - ay, t = Math.min(1, Math.max(0, ((px - ax) * ux + (py - ay) * uy) / (ux * ux + uy * uy || 1)));
  return Math.hypot(px - ax - t * ux, py - ay - t * uy);
};
const dedans = ([px, py], polys) => polys.reduce((n, p) => n + p.reduce((k, a, i) => {
  const b = p[(i + 1) % p.length];
  return k + (((a[1] > py) !== (b[1] > py)) && px < a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]) ? 1 : 0);
}, 0), 0) % 2 === 1;

const ids = process.argv.slice(2).filter(a => !a.startsWith("--"));
let ko = 0;
console.log("| Produit | Cotes | Contrôle | Nominal (mm) | Mesuré (mm) | Écart | Verdict |");
console.log("|---|---|---|---|---|---|---|");
for (const p of produits.filter(q => CONTROLES[q.id] && (!ids.length || ids.includes(q.id)))) {
  const { kit, calc } = await modele(p.model, "manifold");
  const join = kit.join;
  let decal = null;   // centrage appliqué par le dernier join (l'assemblage final)
  kit.join = (...gs) => {
    const bb = gs.flat().map(g => g.mf.boundingBox());
    decal = [0, 1, 2].map(i => (Math.min(...bb.map(b => b.min[i])) + Math.max(...bb.map(b => b.max[i]))) / 2);
    return join(...gs);
  };
  for (const v of combos(p.custom.params)) {
    const mf = calc(v).mf;
    for (const c of CONTROLES[p.id](v)) {
      /* Centre et position de coupe ramenés dans le repère centré, puis dans celui de la coupe (axe → z) */
      const ix = { x: 0, y: 1, z: 2 }[c.axe], [du, dv] = { x: [-decal[2], decal[1]], y: [decal[0], -decal[2]], z: [decal[0], decal[1]] }[c.axe];
      const pt = [c.pt[0] - du, c.pt[1] - dv];
      const polys = mf.rotate(ROT[c.axe]).slice(c.at - decal[ix]).toPolygons();
      const segs = polys.flatMap(q => q.map((a, i) => [a, q[(i + 1) % q.length]]));
      const libre = 2 * Math.min(...segs.map(([a, b]) => distSeg(pt, a, b)));
      let mesure, ok, nominal;
      if (c.fut) {
        nominal = c.fut;
        mesure = 2 * Math.max(...polys.flat().map(([x, y]) => Math.hypot(x - pt[0], y - pt[1])));
        ok = mesure <= nominal + 1e-6 && mesure >= nominal - TOL;
      } else {
        nominal = c.trou;
        mesure = libre;
        ok = !dedans(pt, polys) && mesure >= nominal - TOL;
      }
      if (!ok) ko++;
      const fmt = x => x.toFixed(3).replace(".", ",");
      console.log(`| ${p.id} | ${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(" ")} | ${c.nom}${c.cote != null && c.cote !== nominal ? ` (cote client ${c.cote})` : ""} | ${fmt(nominal)} | ${fmt(mesure)} | ${fmt(mesure - nominal)} | ${ok ? "ok" : "**HORS TOLÉRANCE**"} |`);
    }
    kit.flush();
  }
  kit.join = join;
}
if (ko) { console.error(`${ko} contrôle(s) hors tolérance (± ${TOL} mm)`); process.exit(1); }
