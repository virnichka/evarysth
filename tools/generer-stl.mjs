#!/usr/bin/env node
/* Evarysth — génère le STL d'un produit avec le même calcul que l'aperçu du site (?geo=manifold).
   Usage : node tools/generer-stl.mjs <produit> [a=… b=… c=…] [--taille=<libellé|1-3>] [--sortie=<dossier>] [--forcer]
   Sortie (ignorée par git) : sortie-stl/<produit>-<cotes>.stl + .json (manifeste).
   Erreur franche si une cote sort des bornes de data.js, ou si le maillage n'est pas étanche
   (modèles hors kit non étanches : seulement avec --forcer, signalé dans le manifeste).
   Dépendances : cd tools && npm ci. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { RACINE, THREE, MANIFOLD_VERSION, produit, cotes, modele, stlBinaire } from "./lib/moteur.mjs";

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const id = args.find(x => !x.startsWith("--") && !x.includes("="));
if (!id) { console.error("Usage : node tools/generer-stl.mjs <produit> [a=… b=…] [--taille=…] [--sortie=…] [--forcer]"); process.exit(1); }

try {
  const p = produit(id);
  const valeurs = Object.fromEntries(args.filter(x => !x.startsWith("--") && x.includes("=")).map(x => x.split("=")));
  const v = cotes(p, { taille: opt("taille"), valeurs });
  const { kit, calc } = await modele(p.model, "manifold");
  const r = calc(v), b = kit.bilan(r);
  if (!b.etanche) {
    if (!b.horsKit) throw new Error(`${p.id} : le modèle du kit produit un maillage non étanche`);
    if (!args.includes("--forcer")) throw new Error(`${p.id} : modèle hors kit, maillage non étanche (phase 3 de la refonte). --forcer pour l'écrire quand même.`);
  }
  /* Repère d'impression : Z vers le haut (l'aperçu est en Y vers le haut) ; rotation propre de +90° autour de X */
  let mf = b.mf, geo = null;
  if (mf) mf = mf.rotate([90, 0, 0]);
  else { geo = r.clone().rotateX(Math.PI / 2); }
  const stl = mf ? stlBinaire(mf) : (() => {   // hors kit non étanche (--forcer) : triangles tels quels
    const g = geo.index ? geo.toNonIndexed() : geo, a = g.attributes.position.array, nt = a.length / 9, buf = Buffer.alloc(84 + 50 * nt);
    buf.writeUInt32LE(nt, 80);
    for (let t = 0; t < nt; t++) for (let k = 0; k < 9; k++) buf.writeFloatLE(a[9 * t + k], 84 + 50 * t + 12 + 4 * k);
    return buf;
  })();
  const bb = mf ? mf.boundingBox() : (geo.computeBoundingBox(), { min: geo.boundingBox.min.toArray(), max: geo.boundingBox.max.toArray() });
  const r2 = x => Math.round(x * 1000) / 1000;
  let sha = null, sale = null;
  try {
    sha = execSync("git rev-parse HEAD", { cwd: RACINE }).toString().trim();
    sale = execSync("git status --porcelain -- assets/js", { cwd: RACINE }).toString().trim() !== "";
  } catch { /* hors dépôt git */ }
  const nom = `${p.id}-${Object.entries(v).map(([k, x]) => `${k}${x}`).join("-")}`;
  const dir = path.resolve(RACINE, opt("sortie") || "sortie-stl");
  fs.mkdirSync(dir, { recursive: true });
  const manifeste = {
    produit: p.id, modele: p.model, cotes: v, taille: opt("taille") ?? null,
    git: { sha, modifie: sale }, moteur: { manifold3d: MANIFOLD_VERSION, three: THREE.REVISION },
    etanche: b.etanche, horsKit: b.horsKit, volume_mm3: b.volume == null ? null : r2(b.volume),
    boite: { min: [...bb.min].map(r2), max: [...bb.max].map(r2), taille: [0, 1, 2].map(i => r2(bb.max[i] - bb.min[i])) },
    solides: b.solides, triangles: stl.readUInt32LE(80), repere: "Z vers le haut (aperçu : Y vers le haut, tourné de +90° autour de X)",
    stl: `${nom}.stl`, date: new Date().toISOString()
  };
  fs.writeFileSync(path.join(dir, `${nom}.stl`), stl);
  fs.writeFileSync(path.join(dir, `${nom}.json`), JSON.stringify(manifeste, null, 2) + "\n");
  if (mf) mf.delete();
  kit.flush();
  console.log(`${path.relative(RACINE, path.join(dir, nom))}.stl — ${manifeste.boite.taille.join(" × ")} mm, `
    + `${b.volume == null ? "volume inconnu" : Math.round(b.volume) + " mm³"}, ${b.etanche ? "étanche" : "NON ÉTANCHE"}, ${b.solides ?? "?"} solide(s)`);
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
}
