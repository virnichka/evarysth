#!/usr/bin/env node
/* Evarysth — rapport des prix (docs/prix.md) : pour chaque produit, prix des tailles standard, prix aux cotes min / défaut /
   max avec leur décomposition, « Dès », prix unitaire par quantité, puis balayage de toutes les cotes (pas des curseurs,
   au plus PAS_MAX valeurs par axe) et invariants. Lit le site tel quel (data.js, bareme.js, prix.js) : rien n'est
   recalculé ici.

     node tools/rapport-prix.mjs                   tableau Markdown
     node tools/rapport-prix.mjs --json            rapport complet (JSON)
     node tools/rapport-prix.mjs --verifier        compare à la référence tools/references-prix.json et contrôle les
                                                   invariants (code 1 si écart ou invariant non tenu)
     node tools/rapport-prix.mjs --mettre-a-jour   réécrit la référence (changement de prix VOULU seulement)

   Référence figée : un refactoring du calcul doit la laisser identique (test bloquant tools/test/prix.test.mjs). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RACINE, SCRIPTS_PRIX, charger, avecBareme } from "./lib/bareme.mjs";

export const REFERENCE = path.join(RACINE, "tools/references-prix.json");
export const PAS_MAX = 60;
/* Hausse permise par cran de curseur : HAUSSE_MM € par mm, arrondie à l'euro supérieur (prix à l'euro) */
export const HAUSSE_MM = 1;
/* Quantités contrôlées (prix unitaire jamais plus haut pour n + 1 pièces que pour n) */
export const QUANTITES = [1, 2, 3, 4, 5, 10];
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
const DETAIL = ["mat", "mach", "vm", "mo", "emballage", "fixes", "lancement", "prelevements"];
const detail = d => ({ masse_g: Math.round(d.masse_g * 10) / 10, heures: centimes(d.heures),
  ...Object.fromEntries(DETAIL.map(k => [k, centimes(d[k])])), prix: d.prix });

function produit(E, p) {
  const prm = p.custom.params, cles = prm.map(q => q.key), m = E.matierePrix(p);
  const tailles = p.variants.options.map(o => ({ taille: o.label, cotes: o.values, prix: E.priceFor(p, "standard", o.values),
    surMesure: E.priceFor(p, "custom", o.values) }));
  const reperes = Object.fromEntries(["min", "def", "max"].map(k => {
    const v = Object.fromEntries(prm.map(q => [q.key, q[k]]));
    return [k, { cotes: v, ...detail(E.prixDetail(p, v)), parQuantite: QUANTITES.map(n => E.priceFor(p, "custom", v, n)) }];
  }));

  /* Balayage : produit cartésien des axes, prix rangés par indice multiple (dernier axe le plus rapide) */
  const axes = prm.map(valeursAxe), dims = axes.map(a => a.length);
  const total = dims.reduce((a, b) => a * b, 1), prix = new Float64Array(total);
  const cotesDe = i => {
    const v = [];
    for (let d = cles.length - 1; d >= 0; d--) { v[d] = axes[d][i % dims[d]]; i = Math.floor(i / dims[d]); }
    return Object.fromEntries(cles.map((k, d) => [k, v[d]]));
  };
  let min = { prix: Infinity }, max = { prix: -Infinity };
  for (let i = 0; i < total; i++) {
    const c = cotesDe(i);
    prix[i] = E.priceFor(p, "custom", c);
    if (prix[i] < min.prix) min = { prix: prix[i], cotes: c };
    if (prix[i] > max.prix) max = { prix: prix[i], cotes: c };
  }
  const baisses = { nombre: 0, exemples: [] }, hausses = { nombre: 0, exemples: [] };
  let pasAxe = 1, hausseMaxMm = 0;
  for (let d = cles.length - 1; d >= 0; d--) {
    for (let i = 0; i < total; i++) {
      const k = Math.floor(i / pasAxe) % dims[d];
      if (k === dims[d] - 1) continue;
      const a = prix[i], b = prix[i + pasAxe], mm = axes[d][k + 1] - axes[d][k];
      const ex = () => ({ axe: cles[d], de: cotesDe(i), a: axes[d][k + 1], prix: [a, b] });
      hausseMaxMm = Math.max(hausseMaxMm, (b - a) / mm);
      if (b < a) { baisses.nombre++; if (baisses.exemples.length < EXEMPLES) baisses.exemples.push(ex()); }
      else if (b - a > Math.ceil(HAUSSE_MM * mm - 1e-9)) { hausses.nombre++; if (hausses.exemples.length < EXEMPLES) hausses.exemples.push(ex()); }
    }
    pasAxe *= dims[d];
  }
  return {
    id: p.id, matiere: (p.impression && p.impression.matiere) || p.matiere, filiere: m.filiere,
    provisoire: m.filiere === "externe", valeur: p.valeur || 1, des: E.prixDes(p), tailles, reperes,
    balayage: { valeursParAxe: Object.fromEntries(cles.map((k, d) => [k, dims[d]])), points: total, baisses, hausses,
      hausseMaxMm: centimes(hausseMaxMm), min, max }
  };
}

export function rapport(E = charger(SCRIPTS_PRIX)) {
  return { pasMax: PAS_MAX, hausseMm: HAUSSE_MM, quantites: QUANTITES, produits: E.products.filter(avecBareme).map(p => produit(E, p)) };
}

const eur = n => `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
export function markdown(r) {
  const l = ["| Produit | Matière | Tailles | Min / défaut / max | « Dès » | Défaut × 1 / 2 / 4 / 10 | Balayage (points ; hausse max / mm) |",
    "|---|---|---|---|---|---|---|"];
  for (const p of r.produits) {
    const b = p.balayage, q = n => p.reperes.def.parQuantite[r.quantites.indexOf(n)];
    l.push(`| ${p.id} | ${p.matiere}${p.provisoire ? " (provisoire, devis à venir)" : ""} | ${p.tailles.map(t => `${t.taille} ${eur(t.prix)}`).join(" · ")}`
      + ` | ${["min", "def", "max"].map(k => eur(p.reperes[k].prix)).join(" / ")} | ${eur(p.des)} | ${[1, 2, 4, 10].map(q).join(" / ")} €`
      + ` | ${b.points} ; ${eur(b.hausseMaxMm)} |`);
  }
  return l.join("\n");
}

/* Invariants (bloquants) : [{ id, regle, message }] ; liste vide = tout est tenu */
export const REGLES = {
  baisse: "le prix ne baisse jamais quand une cote augmente",
  hausse: `hausse d'au plus ${HAUSSE_MM} € par mm de curseur (arrondie à l'euro supérieur)`,
  standard: "même prix en taille standard et en sur-mesure aux mêmes cotes",
  des: "« Dès » = minimum réel du balayage",
  minimum: "aucun prix sous le prix minimum",
  quantite: "prix unitaire jamais plus haut pour n + 1 pièces que pour n"
};
export function invariants(r, E = charger(SCRIPTS_PRIX)) {
  const eurs = ([a, b]) => `${a} → ${b} €`, out = [];
  const cotes = c => Object.entries(c).map(([k, v]) => `${k} ${v}`).join(", ");
  const ex = x => `ex. ${x.axe} → ${x.a} depuis ${cotes(x.de)} : ${eurs(x.prix)}`;
  for (const p of r.produits) {
    const b = p.balayage, w = (regle, message) => out.push({ id: p.id, regle, message });
    if (b.baisses.nombre) w("baisse", `${b.baisses.nombre} cran(s) en baisse (${ex(b.baisses.exemples[0])})`);
    if (b.hausses.nombre) w("hausse", `${b.hausses.nombre} cran(s) au-delà de ${r.hausseMm} €/mm (${ex(b.hausses.exemples[0])})`);
    for (const t of p.tailles) if (t.surMesure !== t.prix) w("standard", `${t.taille} : ${t.prix} € en standard, ${t.surMesure} € en sur-mesure`);
    if (b.min.prix !== p.des) w("des", `minimum réel ${b.min.prix} € (${cotes(b.min.cotes)}) pour « Dès ${p.des} € »`);
    const plusBas = Math.min(b.min.prix, ...p.tailles.map(t => t.prix), ...["min", "def", "max"].flatMap(k => p.reperes[k].parQuantite));
    if (plusBas < E.tarif.prixMinimum) w("minimum", `prix de ${plusBas} € sous ${E.tarif.prixMinimum} €`);
    for (const k of ["min", "def", "max"]) {
      const q = p.reperes[k].parQuantite;
      q.slice(1).forEach((x, i) => { if (x > q[i]) w("quantite", `${k} : ${x} € pièce par ${r.quantites[i + 1]}, ${q[i]} € par ${r.quantites[i]}`); });
    }
  }
  return out;
}

const texte = r => JSON.stringify(r, null, 1) + "\n";
export const lireReference = () => JSON.parse(fs.readFileSync(REFERENCE, "utf8"));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), r = rapport();
  if (args.includes("--mettre-a-jour")) { fs.writeFileSync(REFERENCE, texte(r)); console.log(`${path.relative(RACINE, REFERENCE)} écrit (${r.produits.length} produits)`); }
  else if (args.includes("--verifier")) {
    const ok = texte(r) === texte(lireReference()), inv = invariants(r);
    for (const a of inv) console.log(process.env.CI ? `::error title=Prix · ${a.regle}::${a.id} · ${a.message}` : `Erreur : ${a.id} · ${a.message}`);
    console.log(ok ? "Rapport des prix identique à la référence." : "Rapport des prix DIFFÉRENT de la référence (tools/references-prix.json).");
    console.log(inv.length ? `${inv.length} invariant(s) non tenu(s).` : "Invariants tenus.");
    process.exit(ok && !inv.length ? 0 : 1);
  } else if (args.includes("--json")) process.stdout.write(texte(r));
  else console.log(markdown(r));
}
