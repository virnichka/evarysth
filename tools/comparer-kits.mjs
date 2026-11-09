#!/usr/bin/env node
/* Evarysth — contrôle chiffré ancien kit (three.js, concaténation) / nouveau kit (manifold-3d, union).
   Pour chaque produit, toutes les combinaisons min/défaut/max de ses cotes : écart de boîte englobante,
   volumes, étanchéité. Aucune image. Usage : node tools/comparer-kits.mjs [produit…] [--json=<fichier>]
   Critères (refonte, phase 2) : |Δ boîte| ≤ 0,2 mm ; volume nouveau ≤ ancien ; kit → étanche. */
import fs from "node:fs";
import { produits, modele, mesureGeometrie } from "./lib/moteur.mjs";

const args = process.argv.slice(2);
const json = (args.find(a => a.startsWith("--json=")) || "").slice(7);
const ids = args.filter(a => !a.startsWith("--"));
const liste = produits.filter(p => p.model && (!ids.length || ids.includes(p.id)));

const combos = prm => prm.reduce((acc, q) => acc.flatMap(c => [...new Set([q.min, q.def, q.max])].map(x => ({ ...c, [q.key]: x }))), [{}]);
const ecartBoite = (a, b) => Math.max(...[0, 1, 2].flatMap(i => [Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i])]));

const lignes = [], details = [];
for (const p of liste) {
  const ancien = await modele(p.model, "three"), nouveau = await modele(p.model, "manifold");
  const kit = nouveau.kit;
  let dMax = 0, rMin = Infinity, rMax = -Infinity, etanches = 0, n = 0, horsKit = false, solides = new Set(), pire = null;
  for (const v of combos(p.custom.params)) {
    const g = ancien.calc(v), mo = mesureGeometrie(g); g.dispose();
    const r = nouveau.calc(v), b = kit.bilan(r);
    const vol = b.volume ?? mesureGeometrie(r).volume;
    if (!r.isSolid) r.dispose();
    kit.flush();
    const d = ecartBoite(mo.bbox, b.bbox), ratio = vol / mo.volume;
    if (d > dMax) { dMax = d; pire = v; }
    rMin = Math.min(rMin, ratio); rMax = Math.max(rMax, ratio);
    etanches += b.etanche ? 1 : 0; horsKit = horsKit || b.horsKit; solides.add(b.solides); n++;
    details.push({ produit: p.id, cotes: v, ancien: mo, nouveau: { bbox: b.bbox, volume: vol, etanche: b.etanche, horsKit: b.horsKit, solides: b.solides }, ecartBoite: d, ratioVolume: ratio });
  }
  lignes.push({ id: p.id, modele: p.model, n, dMax, pire, rMin, rMax, etanches, horsKit, solides: [...solides].join("/") });
}

const f = (x, k = 3) => x.toLocaleString("fr-FR", { minimumFractionDigits: k, maximumFractionDigits: k });
console.log("| Produit | Kit | Comb. | Δ boîte max (mm) | Vol. nouveau / ancien | Étanche | Solides |");
console.log("|---|---|---|---|---|---|---|");
for (const l of lignes) {
  const alerte = (l.dMax > 0.2 ? " ⚠" : "") + (l.rMax > 1 + 1e-6 ? " ↑" : "");
  console.log(`| ${l.id} | ${l.horsKit ? "hors kit" : "kit"} | ${l.n} | ${f(l.dMax)}${alerte} | ${f(l.rMin, 4)} – ${f(l.rMax, 4)} | ${l.etanches}/${l.n} | ${l.solides} |`);
}
const kitKo = lignes.filter(l => !l.horsKit && l.etanches < l.n);
if (json) fs.writeFileSync(json, JSON.stringify({ lignes, details }, null, 1));
if (kitKo.length) { console.error(`Modèles du kit non étanches : ${kitKo.map(l => l.id).join(", ")}`); process.exit(1); }
