#!/usr/bin/env node
/* Evarysth — contrôle chiffré ancien kit (three.js, concaténation) / nouveau kit (manifold-3d, union).
   Pour chaque produit, toutes les combinaisons min/défaut/max de ses cotes : écart de boîte englobante,
   volumes, étanchéité, nombre de solides, temps de calcul du nouveau moteur (modèle + aperçu). Aucune image.
   Usage : node tools/comparer-kits.mjs [produit…] [--ref=<commit>] [--json=<fichier>]
     --ref : l'ancien kit exécute viewer3d.js et les modèles tels qu'ils étaient à ce commit (ex. origin/main,
             la version publiée) ; sans --ref, les fichiers actuels dans les deux moteurs.
   Exigences (refonte, phase 3) : nouveau moteur étanche, nombre de solides = celui déclaré par le modèle
   (define(…, { solides })) ; |Δ boîte| > 0,2 mm signalé ⚠ (écart à expliquer). Code de sortie 1 sinon. */
import fs from "node:fs";
import { produits, modele, mesureGeometrie } from "./lib/moteur.mjs";

const args = process.argv.slice(2);
const opt = k => (args.find(a => a.startsWith(`--${k}=`)) || "").slice(k.length + 3);
const json = opt("json"), ref = opt("ref") || undefined;
const ids = args.filter(a => !a.startsWith("--"));
const liste = produits.filter(p => p.model && (!ids.length || ids.includes(p.id)));

const combos = prm => prm.reduce((acc, q) => acc.flatMap(c => [...new Set([q.min, q.def, q.max])].map(x => ({ ...c, [q.key]: x }))), [{}]);
const ecartBoite = (a, b) => Math.max(...[0, 1, 2].flatMap(i => [Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i])]));

const lignes = [], details = [], erreurs = [];
for (const p of liste) {
  const ancien = await modele(p.model, "three", ref), nouveau = await modele(p.model, "manifold");
  const kit = nouveau.kit, attendu = nouveau.build.solides;
  if (!Number.isInteger(attendu)) erreurs.push(`${p.id} : le modèle ne déclare pas son nombre de solides (define(…, { solides }))`);
  let dMax = 0, rMin = Infinity, rMax = -Infinity, etanches = 0, n = 0, horsKit = false, solides = new Set(), pire = null, vMin = Infinity, vMax = 0, ms = 0;
  for (const v of combos(p.custom.params)) {
    const g = ancien.calc(v), mo = mesureGeometrie(g); g.dispose();
    const t0 = performance.now();
    kit.preview(nouveau.calc(v));   // temps vu par le site : calcul du modèle + conversion pour l'aperçu
    ms += performance.now() - t0;
    const r = nouveau.calc(v), b = kit.bilan(r);
    const vol = b.volume ?? mesureGeometrie(r).volume;
    if (!r.isSolid) r.dispose();
    kit.flush();
    const d = ecartBoite(mo.bbox, b.bbox), ratio = vol / mo.volume;
    if (d > dMax) { dMax = d; pire = v; }
    rMin = Math.min(rMin, ratio); rMax = Math.max(rMax, ratio); vMin = Math.min(vMin, vol); vMax = Math.max(vMax, vol);
    etanches += b.etanche ? 1 : 0; horsKit = horsKit || b.horsKit; solides.add(b.solides); n++;
    if (!b.etanche) erreurs.push(`${p.id} ${JSON.stringify(v)} : maillage non étanche`);
    else if (b.solides !== attendu) erreurs.push(`${p.id} ${JSON.stringify(v)} : ${b.solides} solide(s), ${attendu} attendu(s)`);
    details.push({ produit: p.id, cotes: v, ancien: mo, nouveau: { bbox: b.bbox, volume: vol, etanche: b.etanche, horsKit: b.horsKit, solides: b.solides }, ecartBoite: d, ratioVolume: ratio });
  }
  lignes.push({ id: p.id, modele: p.model, n, dMax, pire, rMin, rMax, vMin, vMax, etanches, horsKit, attendu, solides: [...solides].join("/"), ms: ms / n });
}

const f = (x, k = 3) => x.toLocaleString("fr-FR", { minimumFractionDigits: k, maximumFractionDigits: k });
console.log(`Référence (ancien kit) : ${ref ? `fichiers du commit ${ref}` : "fichiers actuels"}`);
console.log("| Produit | Kit | Comb. | Δ boîte max (mm) | Vol. nouveau / ancien | Volume (cm³) | Étanche | Solides (attendu) | Calcul + aperçu |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const l of lignes) {
  const alerte = (l.dMax > 0.2 ? " ⚠" : "") + (l.rMax > 1 + 1e-6 ? " ↑" : "");
  const sol = l.solides === String(l.attendu) ? `${l.solides} (${l.attendu})` : `**${l.solides}** (${l.attendu ?? "?"}) ⚠`;
  console.log(`| ${l.id} | ${l.horsKit ? "hors kit" : "kit"} | ${l.n} | ${f(l.dMax)}${alerte} | ${f(l.rMin, 4)} – ${f(l.rMax, 4)} | ${f(l.vMin / 1000, 1)} – ${f(l.vMax / 1000, 1)} | ${l.etanches}/${l.n} | ${sol} | ${Math.round(l.ms)} ms |`);
}
if (json) fs.writeFileSync(json, JSON.stringify({ ref: ref ?? null, lignes, details }, null, 1));
if (erreurs.length) { console.error(`\n${erreurs.length} écart(s) :\n- ${erreurs.slice(0, 30).join("\n- ")}`); process.exit(1); }
