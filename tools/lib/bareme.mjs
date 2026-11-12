/* Evarysth · barème des prix sur-mesure (docs/fabrication.md, « Barème des prix ») :
   grille de cotes par produit et empreinte des entrées qui changent la masse ou le temps tranchés.
   Sans dépendance (ni three ni manifold) : le contrôle d'empreinte du job `geometrie` reste instantané. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FICHIER = "assets/js/bareme.js";
/* Le site tel qu'il calcule ses prix : catalogue, barème, puis calcul (même ordre que index.html et le Worker) */
export const SCRIPTS_PRIX = ["assets/js/data.js", FICHIER, "assets/js/prix.js"];
/* À incrémenter si la règle de grille ou le contenu d'un point change : tous les barèmes deviennent périmés. */
export const VERSION_GRILLE = 1;
/* Points par axe selon le nombre de paramètres (min, défaut, max, puis milieux des plus grands intervalles), et aucun
   intervalle de plus de ECART_MAX mm (organiseur-tiroir : écart interpolé / tranché de 15 % avec des pas de 200 mm). */
const POINTS = { 1: 5, 2: 4, 3: 3 };
const ECART_MAX = 100;
/* Profil de l'atelier utilisé pour trancher chaque matière : hors atelier (ASA, PA12, PA-CF), profil de la famille la
   plus proche, seulement pour estimer (même géométrie ; la masse suit la densité de data.js, le temps reste celui du PETG). */
export const PROFIL = { pla: "pla", petg: "petg", asa: "petg", pa12: "petg", pacf: "petg" };
/* Entrées communes : moteur géométrique, briques, pose sur le plateau, image et profils de tranchage */
const COMMUNS = ["assets/js/geo.js", "assets/js/viewer3d.js", "tools/lib/impression.mjs", "tools/generer-stl.mjs",
  "fabrication/Dockerfile", "fabrication/bambu-studio", "fabrication/profils/p2s/machine.json", "fabrication/profils/p2s/process-0.20mm.json"];

/* Charge un script du site (data.js, bareme.js) dans un contexte isolé ; retourne EVARYSTH */
export function charger(fichiers = ["assets/js/data.js"], base = RACINE) {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of fichiers) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p });
  }
  return ctx.EVARYSTH;
}

export const matiereImpression = p => (p.impression && p.impression.matiere) || p.matiere;
export const avecBareme = p => !!(p.model && p.custom && p.custom.params && p.custom.params.length);

const arrondi = (v, q) => {
  const pas = q.step || 1, d = (String(pas).split(".")[1] || "").length;
  return Number((q.min + Math.round((v - q.min) / pas) * pas).toFixed(d));
};

/* Valeurs d'un axe : min, défaut, max, puis milieu du plus grand intervalle (arrondi au pas) jusqu'au nombre voulu et
   jusqu'à ce qu'aucun intervalle ne dépasse ECART_MAX */
export function axe(q, n) {
  const v = [...new Set([q.min, q.def, q.max])].sort((a, b) => a - b);
  for (;;) {
    let k = 0;
    for (let i = 1; i < v.length - 1; i++) if (v[i + 1] - v[i] > v[k + 1] - v[k]) k = i;
    if (v.length >= n && v[k + 1] - v[k] <= ECART_MAX) break;
    const m = arrondi((v[k] + v[k + 1]) / 2, q);
    if (m <= v[k] || m >= v[k + 1]) break;
    v.splice(k + 1, 0, m);
  }
  return v;
}

export function axes(p) {
  const n = POINTS[p.custom.params.length] || 3;
  return Object.fromEntries(p.custom.params.map(q => [q.key, axe(q, n)]));
}

/* Points de la grille, dans l'ordre de stockage (premier paramètre = rang le plus lent) */
export function grille(p) {
  return Object.entries(axes(p)).reduce((acc, [k, vs]) => acc.flatMap(c => vs.map(v => ({ ...c, [k]: v }))), [{}]);
}

const hacher = (h, rel) => {
  const f = path.join(RACINE, rel);
  h.update(`\n${rel}\n`);
  h.update(fs.existsSync(f) ? fs.readFileSync(f) : "(absent)");
};

/* Empreinte (16 hex) de tout ce qui change masse et temps tranchés d'un produit ; pas son prix ni ses textes */
export function empreinte(p, E) {
  const h = crypto.createHash("sha256");
  const mat = matiereImpression(p), { remarques, ...fiche } = p.impression || {};
  const lock = JSON.parse(fs.readFileSync(path.join(RACINE, "tools/package-lock.json"), "utf8"));
  h.update(JSON.stringify({
    v: VERSION_GRILLE, modele: p.model, matiere: mat, profil: PROFIL[mat], jeu: E.jeu(p), fiche, axes: axes(p),
    manifold: (lock.packages["node_modules/manifold-3d"] || {}).version
  }));
  for (const f of COMMUNS) hacher(h, f);
  hacher(h, `fabrication/profils/p2s/filament-${PROFIL[mat]}.json`);
  hacher(h, `assets/js/modeles/${p.model}.js`);
  for (const d of [...new Set([p.model, p.id])]) {
    const dir = path.join(RACINE, "assets/models", d);
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(x => /\.stl$/i.test(x)).sort()) hacher(h, `assets/models/${d}/${f}`);
  }
  return h.digest("hex").slice(0, 16);
}

/* Produits sans barème ou au barème périmé ; [] si tout est à jour */
export function perimes(E = charger(["assets/js/data.js", FICHIER])) {
  const b = (E.bareme && E.bareme.produits) || {};
  return E.products.filter(avecBareme).filter(p => !b[p.id] || b[p.id].empreinte !== empreinte(p, E)).map(p => p.id);
}
