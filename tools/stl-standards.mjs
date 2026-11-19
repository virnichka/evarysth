#!/usr/bin/env node
/* Evarysth · fichiers des tailles standard, prêts à envoyer dans R2 (clés <produit>/<taille>.stl|.zip).
   Appelé par .github/workflows/stl-standards.yml à chaque push sur main ; utilisable à la main.
   Usage : node tools/stl-standards.mjs [--sortie=<dossier>] [produit…]
   Pour chaque produit et chaque taille standard de data.js : generer-stl --impression (mêmes contrôles de géométrie,
   pièces séparées, orientées et posées sur le plateau selon la fiche d'impression). Une seule pièce → <taille>.stl ;
   plusieurs pièces → <taille>.zip (les STL des pièces). La taille est écrite comme le Worker la lit (segmentTaille).
   Écrit aussi index.json (clés produites, produits en écart). Code de sortie 1 si une taille échoue (les autres sont
   quand même écrites). Aucune donnée client. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RACINE, produits } from "./lib/moteur.mjs";
import { segmentTaille } from "../worker/src/fichier.js";

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const ids = args.filter(x => !x.startsWith("--"));
const sortie = path.resolve(RACINE, opt("sortie") || "sortie-stl-standards");
const travail = path.join(sortie, ".travail");

/* Liste (produit, libellé, clé de base) : testable sans rien générer */
export function tailles(liste = produits, filtre = ids) {
  const out = [];
  for (const p of liste) {
    if (filtre.length && !filtre.includes(p.id)) continue;
    const vues = new Map();
    for (const o of (p.variants && p.variants.options) || []) {
      const seg = segmentTaille(o.label);
      if (!seg) throw new Error(`${p.id} : taille « ${o.label} » sans segment de clé`);
      if (vues.has(seg)) throw new Error(`${p.id} : tailles « ${vues.get(seg)} » et « ${o.label} » donnent la même clé « ${seg} »`);
      vues.set(seg, o.label);
      out.push({ produit: p.id, label: o.label, seg });
    }
  }
  return out;
}

function main() {
  fs.rmSync(sortie, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });
  const cles = [], ecarts = [];
  for (const t of tailles()) {
    const dir = path.join(travail, `${t.produit}-${t.seg}`);
    const r = spawnSync(process.execPath, [path.join(RACINE, "tools/generer-stl.mjs"), t.produit, `--taille=${t.label}`, "--impression", `--sortie=${dir}`],
      { cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20 });
    const stls = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".stl")).sort() : [];
    if (r.status !== 0 || !stls.length) {
      const motif = ((r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).slice(0, 3).join(" | ")) || `code ${r.status}`;
      console.error(`ÉCART ${t.produit} · ${t.label} : ${motif}`);
      ecarts.push({ produit: t.produit, taille: t.label, motif });
      continue;
    }
    fs.mkdirSync(path.join(sortie, t.produit), { recursive: true });
    let cle;
    if (stls.length === 1) {
      cle = `${t.produit}/${t.seg}.stl`;
      fs.copyFileSync(path.join(dir, stls[0]), path.join(sortie, cle));
    } else {
      cle = `${t.produit}/${t.seg}.zip`;
      /* zip -X : sans dates ni attributs du système, contenu stable d'un run à l'autre */
      const z = spawnSync("zip", ["-q", "-X", "-j", path.join(sortie, cle), ...stls.map(f => path.join(dir, f))], { encoding: "utf8" });
      if (z.status !== 0) { ecarts.push({ produit: t.produit, taille: t.label, motif: "zip impossible : " + (z.stderr || z.error || "").toString().trim() }); console.error(`ÉCART ${t.produit} · ${t.label} : zip impossible`); continue; }
    }
    cles.push(cle);
    console.log(`${cle} (${stls.length} pièce${stls.length > 1 ? "s" : ""})`);
  }
  fs.rmSync(travail, { recursive: true, force: true });
  fs.writeFileSync(path.join(sortie, "index.json"), JSON.stringify({ cles, ecarts }, null, 2) + "\n");
  console.log(`${cles.length} fichier(s) prêt(s), ${ecarts.length} écart(s) → ${path.relative(RACINE, sortie)}`);
  process.exit(ecarts.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
