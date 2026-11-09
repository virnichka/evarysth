/* Evarysth — exécution des modèles 3D du site sous Node, avec le même code que le navigateur.
   Charge assets/js/data.js, assets/js/viewer3d.js et assets/js/modeles/<modèle>.js tels quels ;
   moteur « manifold » (assets/js/geo.js + manifold-3d) ou « three » (ancien kit, concaténation).
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
const run = (fichier) => vm.runInThisContext(fs.readFileSync(path.join(RACINE, fichier), "utf8"), {
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

let wasm = null;
const instances = {};
/* Une instance de viewer3d.js par moteur (closures indépendantes, comme deux pages) */
const instance = async moteur => {
  if (instances[moteur]) return instances[moteur];
  run("assets/js/viewer3d.js");
  const v = EVARYSTH.viewer3d;
  let kit = null;
  if (moteur === "manifold") {
    if (!wasm) { wasm = await Module(); wasm.setup(); }
    kit = createKit(THREE, wasm);
    v.useGeo(kit);
  }
  return (instances[moteur] = { v, kit, charges: {} });
};

/* Modèle prêt à calculer : (valeurs) → résultat brut du modèle (Solid ou BufferGeometry) */
export async function modele(id, moteur = "manifold") {
  const inst = await instance(moteur);
  if (!inst.charges[id]) {
    EVARYSTH.viewer3d = inst.v;
    run(`assets/js/modeles/${id}.js`);
    const build = inst.v.models[id];
    if (!build) throw new Error(`Modèle 3D « ${id} » non défini`);
    if (build.prepare) await build.prepare(THREE);
    inst.charges[id] = build;
  }
  const build = inst.charges[id];
  return { build, kit: inst.kit, calc: vals => build(THREE, vals) };
}

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
    v[k] = Number(x);
  }
  for (const q of prm) {
    if (!Number.isFinite(v[q.key]) || v[q.key] < q.min || v[q.key] > q.max)
      throw new Error(`Cote ${q.key} = ${v[q.key]} hors bornes pour ${p.id} (${q.label} : ${q.min} à ${q.max} mm)`);
  }
  return v;
}

/* Mesures d'une BufferGeometry (ancien kit) : boîte englobante et volume signé des triangles */
export function mesureGeometrie(g) {
  g.computeBoundingBox();
  const p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count;
  let vol = 0;
  const at = i => (ix ? ix.getX(i) : i);
  for (let t = 0; t < n; t += 3) {
    const a = at(t), b = at(t + 1), c = at(t + 2);
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return { bbox: { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() }, volume: vol, triangles: n / 3 };
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
