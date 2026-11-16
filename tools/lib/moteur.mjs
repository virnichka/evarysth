/* Evarysth — exécution des modèles 3D du site sous Node, avec le même code que le navigateur.
   Charge assets/js/data.js, assets/js/viewer3d.js et assets/js/modeles/<modèle>.js tels quels,
   avec le kit assets/js/geo.js + manifold-3d (même calcul que l'aperçu du site).
   Dépendances : tools/package.json (npm ci dans tools/). */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import Module from "manifold-3d";
import { createKit, MANIFOLD_VERSION } from "../../assets/js/geo.js";

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export { THREE, MANIFOLD_VERSION };
/* La version WASM utilisée doit être celle copiée pour le site */
const versionNode = JSON.parse(fs.readFileSync(path.join(RACINE, "tools/node_modules/manifold-3d/package.json"), "utf8")).version;
if (versionNode !== MANIFOLD_VERSION) throw new Error(`manifold-3d ${versionNode} sous Node, ${MANIFOLD_VERSION} attendu (geo.js)`);

/* Option stable en pratique (Node ≥ 21) ; seul son avertissement « expérimental » est tu */
const emit = process.emitWarning;
process.emitWarning = (w, ...a) => String(w).includes("USE_MAIN_CONTEXT_DEFAULT_LOADER") ? undefined : emit.call(process, w, ...a);
const run = fichier => vm.runInThisContext(fs.readFileSync(path.join(RACINE, fichier), "utf8"), {
  filename: path.join(RACINE, "tools", path.basename(fichier)),   // résolution de « three » depuis tools/node_modules
  importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER   // import("three/addons/…") de viewer3d.js
});

/* Environnement minimal attendu par les scripts du site */
globalThis.window = globalThis;
globalThis.EVARYSTH = globalThis.EVARYSTH || {};
/* Fichiers STL lus sur disque : FileLoader de three les trouve dans son cache (clé = URL relative du site) */
THREE.Cache.enabled = true;
const stlDir = path.join(RACINE, "assets/models");
for (const d of fs.existsSync(stlDir) ? fs.readdirSync(stlDir) : []) {
  for (const f of fs.readdirSync(path.join(stlDir, d))) if (/\.stl$/i.test(f)) {
    const b = fs.readFileSync(path.join(stlDir, d, f));
    THREE.Cache.add(`assets/models/${d}/${f}`, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
}

run("assets/js/data.js");
export const produits = EVARYSTH.products;
export const produit = id => {
  const p = EVARYSTH.getProduct(id);
  if (!p) throw new Error(`Produit inconnu : ${id} (connus : ${produits.map(q => q.id).join(", ")})`);
  if (!p.model) throw new Error(`Le produit ${id} n'a pas de modèle 3D`);
  return p;
};

let wasm = null, inst = null;
/* Une instance de viewer3d.js, branchée sur le kit manifold */
const instance = async () => {
  if (inst) return inst;
  run("assets/js/viewer3d.js");
  const v = EVARYSTH.viewer3d;
  if (!wasm) { wasm = await Module(); wasm.setup(); }
  const kit = createKit(THREE, wasm);
  v.useGeo(kit);
  return (inst = { v, kit, charges: {} });
};

/* Modèle prêt à calculer : calc(valeurs, jeu) → résultat brut du modèle (Solid ou BufferGeometry).
   jeu : jeu d'ajustement de la matière (data.js), passé au modèle comme valeur « jeu » */
export async function modele(id, fichier = `assets/js/modeles/${id}.js`) {
  const { v, kit, charges } = await instance();
  if (!charges[id]) {
    run(fichier);   // autre fichier : modèle de test (tools/fixtures/)
    const build = v.models[id];
    if (!build) throw new Error(`Modèle 3D « ${id} » non défini`);
    if (build.prepare) await build.prepare(THREE);
    charges[id] = build;
  }
  const build = charges[id];
  return { build, kit, calc: (vals, jeu = 0) => build(THREE, { ...vals, jeu }) };
}

/* Nombre de solides déclaré par le modèle (nombre, ou fonction des valeurs pour un nombre variable de modules) */
export const solidesAttendus = (build, vals) => typeof build.solides === "function" ? build.solides(vals) : build.solides;
/* Jeu de la matière imprimée du produit (data.js) */
export const jeu = p => EVARYSTH.jeu(p);
/* Combinaisons contrôlées d'un produit : min/défaut/max des cotes et comptes (choix par défaut) ; avec des paramètres
   choix, en plus, aux cotes min puis max : chaque option seule (autres choix par défaut) et la « diagonale » (k-ième
   option de chaque choix), pour que chaque option et des mélanges sans défaut soient contrôlés sans le produit complet
   des options (1 + Σ (options − 1) + max(options) jeux au plus). Clés dans l'ordre des paramètres. */
export const combinaisons = prm => {
  const choix = prm.filter(q => q.type === "choix"), def = Object.fromEntries(choix.map(q => [q.key, q.def]));
  const ordre = v => Object.fromEntries(prm.map(q => [q.key, v[q.key]]));
  const cotes = prm.filter(q => q.type !== "choix").reduce((acc, q) => acc.flatMap(c => [...new Set([q.min, q.def, q.max])].map(x => ({ ...c, [q.key]: x }))), [{}]);
  const tout = cotes.map(c => ordre({ ...c, ...def }));
  if (choix.length) {
    const jeux = [...choix.flatMap(q => q.options.map(o => ({ ...def, [q.key]: o.id }))),
      ...Array.from({ length: Math.max(...choix.map(q => q.options.length)) }, (_, i) => Object.fromEntries(choix.map(q => [q.key, q.options[i % q.options.length].id])))];
    for (const k of ["min", "max"]) {
      const c = Object.fromEntries(prm.filter(q => q.type !== "choix").map(q => [q.key, q[k]]));
      tout.push(...jeux.map(j => ordre({ ...c, ...j })));
    }
  }
  const vu = new Set();
  return tout.filter(v => { const k = JSON.stringify(v); return !vu.has(k) && vu.add(k); });
};

/* Cotes : défauts data.js, puis taille standard, puis valeurs explicites ; contrôle des bornes */
export function cotes(p, { taille, valeurs = {} } = {}) {
  const prm = p.custom.params, v = Object.fromEntries(prm.map(q => [q.key, q.def]));
  if (taille != null) {
    const opts = p.variants.options, norm = s => String(s).toLowerCase().replace(/\s+/g, "");
    const o = opts.find(x => norm(x.label) === norm(taille)) || opts[Number(taille) - 1];
    if (!o) throw new Error(`Taille « ${taille} » inconnue pour ${p.id} (tailles : ${opts.map(x => x.label).join(", ")} ou 1-${opts.length})`);
    Object.assign(v, o.values);
  }
  for (const [k, x] of Object.entries(valeurs)) {
    const q = prm.find(r => r.key === k);
    if (!q) throw new Error(`Cote « ${k} » inconnue pour ${p.id} (cotes : ${prm.map(r => r.key).join(", ")})`);
    v[k] = q.type === "choix" ? String(x) : Number(x);
  }
  for (const q of prm) {
    if (q.type === "choix") {
      if (!q.options.some(o => o.id === v[q.key]))
        throw new Error(`Option ${q.key} = ${v[q.key]} inconnue pour ${p.id} (${q.label} : ${q.options.map(o => o.id).join(", ")})`);
    } else if (!Number.isFinite(v[q.key]) || v[q.key] < q.min || v[q.key] > q.max)
      throw new Error(`Cote ${q.key} = ${v[q.key]} hors bornes pour ${p.id} (${q.label} : ${q.min} à ${q.max} mm)`);
  }
  return v;
}

/* STL binaire depuis un Manifold */
export function stlBinaire(mf) {
  const m = mf.getMesh(), np = m.numProp, vp = m.vertProperties, tv = m.triVerts, nt = tv.length / 3;
  const buf = Buffer.alloc(84 + 50 * nt);
  buf.write("Evarysth - manifold-3d " + MANIFOLD_VERSION, 0, "ascii");
  buf.writeUInt32LE(nt, 80);
  const P = (i, j) => vp[np * tv[i] + j];
  for (let t = 0, o = 84; t < nt; t++, o += 50) {
    const a = [0, 1, 2].map(j => P(3 * t, j)), b = [0, 1, 2].map(j => P(3 * t + 1, j)), c = [0, 1, 2].map(j => P(3 * t + 2, j));
    const u = b.map((x, j) => x - a[j]), w = c.map((x, j) => x - a[j]);
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...nn) || 1;
    [...nn.map(x => x / l), ...a, ...b, ...c].forEach((x, k) => buf.writeFloatLE(x, o + 4 * k));
  }
  return buf;
}
