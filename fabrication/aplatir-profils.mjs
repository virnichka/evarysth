#!/usr/bin/env node
/* Evarysth · chaîne de fabrication : fabrique les profils P2S autonomes (fabrication/profils/p2s/) à partir des
   profils système de Bambu Studio, en résolvant tout l'héritage (« inherits ») et les modèles inclus (« include »).
   Usage : node fabrication/aplatir-profils.mjs <dossier resources/profiles/BBL de Bambu Studio> [--sortie=<dossier>]
   (dans l'image : node fabrication/aplatir-profils.mjs /opt/bambu-studio/resources/profiles/BBL).
   À relancer seulement en changeant de version de Bambu Studio ; le résultat est versionné dans le dépôt. */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith("--"));
const sortie = (args.find(a => a.startsWith("--sortie=")) || "").slice(9)
  || path.join(path.dirname(new URL(import.meta.url).pathname), "profils", "p2s");
if (!src) { console.error("Usage : node fabrication/aplatir-profils.mjs <…/resources/profiles/BBL> [--sortie=…]"); process.exit(1); }

const MACHINE = "Evarysth P2S 0.4 nozzle";
const modele = "Bambu Lab P2S"; /* fichier « machine_model » (model_id, plateau par défaut) */
const CIBLES = [
  { fichier: "machine.json", type: "machine", source: "Bambu Lab P2S 0.4 nozzle", nom: MACHINE },
  { fichier: "process-0.20mm.json", type: "process", source: "0.20mm Standard @BBL P2S", nom: "Evarysth 0.20mm Standard P2S" },
  { fichier: "filament-pla.json", type: "filament", source: "Generic PLA @BBL P2S", nom: "Evarysth Generic PLA P2S" }
];
/* Clés de structure (héritage, identifiants système) : retirées du profil autonome. */
const RETIRER = ["inherits", "include", "from", "setting_id", "instantiation", "base_id", "renamed_from"];

const trouver = nom => {
  for (const d of ["machine", "process", "filament"]) {
    const p = path.join(src, d, `${nom}.json`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`profil introuvable : ${nom}`);
};
const lire = nom => JSON.parse(fs.readFileSync(trouver(nom), "utf8"));

function aplatir(nom, chaine = []) {
  const j = lire(nom);
  chaine.push(nom);
  const base = j.inherits ? aplatir(j.inherits, chaine).valeurs : {};
  const inclus = {};
  for (const i of j.include || []) { chaine.push(i); Object.assign(inclus, lire(i)); }
  for (const k of RETIRER.concat("name")) delete inclus[k];
  return { valeurs: { ...base, ...inclus, ...j }, chaine };
}

const bbl = JSON.parse(fs.readFileSync(path.join(src, "..", "BBL.json"), "utf8"));
fs.mkdirSync(sortie, { recursive: true });
const origine = [];
for (const c of CIBLES) {
  const { valeurs, chaine } = aplatir(c.source);
  for (const k of RETIRER) delete valeurs[k];
  /* « from: system » : la CLI ne compare la compatibilité process ↔ machine qu'avec le nom « système » de la machine
     (le sien si from = system, sinon celui de « inherits ») ; aucun fichier système n'est chargé pour autant. */
  const p = { ...valeurs, type: c.type, name: c.nom, from: "system", inherits: "" };
  if (c.type !== "machine") p.compatible_printers = [MACHINE];
  if (c.type === "filament") p.filament_settings_id = [c.nom];
  if (c.type === "process") {
    p.print_settings_id = c.nom;
    /* Plateau : celui du modèle de machine (P2S : « Textured PEI Plate ») ; sans cette clé la CLI prend « Cool Plate »,
       que la P2S ne prend pas en charge (« not_support_bed_type »). */
    p.curr_bed_type = lire(modele).default_bed_type;
  }
  if (c.type === "machine") p.printer_settings_id = c.nom;
  const trie = Object.fromEntries(Object.keys(p).sort((a, b) => a === "type" ? -1 : b === "type" ? 1 : a.localeCompare(b)).map(k => [k, p[k]]));
  fs.writeFileSync(path.join(sortie, c.fichier), JSON.stringify(trie, null, 4) + "\n");
  origine.push({ fichier: c.fichier, nom: c.nom, source: c.source, chaine });
  console.log(`${c.fichier} ← ${chaine.join(" ← ")}`);
}
fs.writeFileSync(path.join(sortie, "origine.json"), JSON.stringify({ bundle_bbl: bbl.version, profils: origine }, null, 2) + "\n");
