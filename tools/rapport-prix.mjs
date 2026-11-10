#!/usr/bin/env node
/* Evarysth — rapport des prix (docs/prix.md) : pour chaque produit sur-mesure, prix et coût des tailles standard, prix
   sur-mesure aux cotes min / défaut / max et aux cotes de chaque taille, puis balayage de toutes les cotes (pas des
   curseurs, au plus PAS_MAX valeurs par axe) qui compte les prix en baisse quand une cote augmente, les marches (hausse
   ≥ MARCHE.euros et ≥ MARCHE.part en un cran), l'écart sur-mesure / taille aux mêmes cotes, et le minimum réel face au
   « Dès » affiché. Lit le site tel quel (data.js, bareme.js, prix.js) : rien n'est recalculé ici.

     node tools/rapport-prix.mjs                   tableau Markdown
     node tools/rapport-prix.mjs --json            rapport complet (JSON)
     node tools/rapport-prix.mjs --verifier        compare à la référence tools/references-prix.json (code 1 si écart)
     node tools/rapport-prix.mjs --mettre-a-jour   réécrit la référence (changement de prix VOULU seulement)

   Référence figée : un refactoring du calcul doit la laisser identique (test bloquant tools/test/prix.test.mjs). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RACINE, FICHIER, charger, avecBareme } from "./lib/bareme.mjs";

export const REFERENCE = path.join(RACINE, "tools/references-prix.json");
export const SCRIPTS = ["assets/js/data.js", FICHIER, "assets/js/prix.js"];
export const PAS_MAX = 60;
export const MARCHE = { euros: 4, part: 0.15 };
const EXEMPLES = 3;

const decimales = x => (String(x).split(".")[1] || "").length;
/* Valeurs d'un axe sur la grille du curseur (min + k × pas), au plus PAS_MAX, min et max compris */
export function valeursAxe(q) {
  const n = Math.round((q.max - q.min) / q.step), d = Math.max(decimales(q.step), decimales(q.min));
  const ks = n + 1 <= PAS_MAX ? Array.from({ length: n + 1 }, (_, i) => i)
    : [...new Set(Array.from({ length: PAS_MAX }, (_, i) => Math.round(i * n / (PAS_MAX - 1))))];
  return ks.map(k => Number((q.min + k * q.step).toFixed(d)));
}

const centimes = x => Math.round(x * 100) / 100;

function produit(E, p) {
  const prm = p.custom.params, cles = prm.map(q => q.key);
  const tailles = p.variants.options.map(o => {
    const r = E.prixCalcule(p, o.values), surMesure = E.priceFor(p, "custom", o.values), prix = E.priceFor(p, "standard", o.values);
    return { taille: o.label, cotes: o.values, prix, cout: r.cout, formule: r.formule, surMesure,
      ecart: surMesure - prix, ecartPart: centimes((surMesure - prix) / prix) };
  });
  const reperes = Object.fromEntries(["min", "def", "max"].map(k => {
    const v = Object.fromEntries(prm.map(q => [q.key, q[k]])), r = E.prixCalcule(p, v);
    return [k, { cotes: v, prix: E.priceFor(p, "custom", v), cout: r.cout, formule: r.formule, plancher: r.plancher, supplement: r.supplement }];
  }));

  /* Balayage : produit cartésien des axes, prix rangés par indice multiple (dernier axe le plus rapide) */
  const axes = prm.map(valeursAxe), dims = axes.map(a => a.length);
  const total = dims.reduce((a, b) => a * b, 1), prix = new Float64Array(total);
  const cotesDe = i => {
    const c = {};
    for (let d = cles.length - 1; d >= 0; d--) { c[cles[d]] = axes[d][i % dims[d]]; i = Math.floor(i / dims[d]); }
    return c;
  };
  let min = { prix: Infinity };
  for (let i = 0; i < total; i++) {
    const c = cotesDe(i);
    prix[i] = E.priceFor(p, "custom", c);
    if (prix[i] < min.prix) min = { prix: prix[i], cotes: c };
  }
  const baisses = { nombre: 0, exemples: [] }, marches = { nombre: 0, exemples: [] };
  let pasAxe = 1;
  for (let d = cles.length - 1; d >= 0; d--) {
    for (let i = 0; i < total; i++) {
      if (Math.floor(i / pasAxe) % dims[d] === dims[d] - 1) continue;
      const a = prix[i], b = prix[i + pasAxe];
      if (b < a) {
        baisses.nombre++;
        if (baisses.exemples.length < EXEMPLES) baisses.exemples.push({ axe: cles[d], de: cotesDe(i), a: axes[d][Math.floor(i / pasAxe) % dims[d] + 1], prix: [a, b] });
      } else if (b - a >= MARCHE.euros && b - a >= MARCHE.part * a) {
        marches.nombre++;
        if (marches.exemples.length < EXEMPLES) marches.exemples.push({ axe: cles[d], de: cotesDe(i), a: axes[d][Math.floor(i / pasAxe) % dims[d] + 1], prix: [a, b] });
      }
    }
    pasAxe *= dims[d];
  }
  const minStandard = Math.min(...tailles.map(t => t.prix));
  return {
    id: p.id, matiere: (p.impression && p.impression.matiere) || p.matiere, des: p.price, tailles, reperes,
    balayage: { valeursParAxe: Object.fromEntries(cles.map((k, d) => [k, dims[d]])), points: total, baisses, marches,
      ecartTailleMax: Math.max(...tailles.map(t => t.ecart)), ecartTailleMin: Math.min(...tailles.map(t => t.ecart)),
      minSurMesure: min, minReel: Math.min(minStandard, min.prix), sousDes: Math.min(minStandard, min.prix) < p.price }
  };
}

export function rapport(E = charger(SCRIPTS)) {
  return { pasMax: PAS_MAX, marche: MARCHE, produits: E.products.filter(avecBareme).map(p => produit(E, p)) };
}

const eur = n => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
export function markdown(r) {
  const l = ["| Produit | Matière | Tailles (prix ; coût ; sur-mesure aux mêmes cotes) | Sur-mesure min / défaut / max | Balayage (points) | Baisses | Marches | Min réel / « Dès » |",
    "|---|---|---|---|---|---|---|---|"];
  for (const p of r.produits) {
    const b = p.balayage;
    l.push(`| ${p.id} | ${p.matiere} | ${p.tailles.map(t => `${t.taille} ${eur(t.prix)} ; ${eur(t.cout)} ; ${eur(t.surMesure)}`).join(" <br>")}`
      + ` | ${["min", "def", "max"].map(k => eur(p.reperes[k].prix)).join(" / ")} | ${b.points} | ${b.baisses.nombre} | ${b.marches.nombre}`
      + ` | ${eur(b.minReel)} / ${eur(p.des)}${b.sousDes ? " ⚠" : ""} |`);
  }
  return l.join("\n");
}

const texte = r => JSON.stringify(r, null, 1) + "\n";
export const lireReference = () => JSON.parse(fs.readFileSync(REFERENCE, "utf8"));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), r = rapport();
  if (args.includes("--mettre-a-jour")) { fs.writeFileSync(REFERENCE, texte(r)); console.log(`${path.relative(RACINE, REFERENCE)} écrit (${r.produits.length} produits)`); }
  else if (args.includes("--verifier")) {
    const ok = texte(r) === texte(lireReference());
    console.log(ok ? "Rapport des prix identique à la référence." : "Rapport des prix DIFFÉRENT de la référence (tools/references-prix.json).");
    process.exit(ok ? 0 : 1);
  } else if (args.includes("--json")) process.stdout.write(texte(r));
  else console.log(markdown(r));
}
