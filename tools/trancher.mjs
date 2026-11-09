#!/usr/bin/env node
/* Evarysth · chaîne de fabrication : tranche les plateaux produits par « generer-stl --impression ».
   Usage : node tools/trancher.mjs <manifeste …-impression.json> [--sortie=<dossier>] [--docker=<image>] [--deux-fois]
     - un .gcode.3mf par plateau (<nom>-plateau<n>.gcode.3mf), à côté du manifeste ou dans --sortie ;
     - masse (g) et temps estimé par plateau, lus dans le rapport de Bambu Studio, + <nom>-tranchage.json ;
     - pièces gardées à leur position (aucun réarrangement : --arrange 0 --orient 0), contrôlées dans le .gcode.3mf ;
     - --docker=<image> : lance Bambu Studio dans l'image (fabrication/Dockerfile) ; sans cette option, la commande
       « bambu-studio » du PATH (dans l'image) ou $BAMBU_STUDIO ;
     - --deux-fois : tranche deux fois et compare masse, temps et G-code (hors lignes d'horodatage).
   Profils : fabrication/profils/p2s (machine P2S 0,4, process 0,20 mm, PLA générique), autonomes.
   Voir docs/chaine-fabrication.md (Fabrication · phase 1a). */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const fichier = args.find(x => !x.startsWith("--"));
if (!fichier) { console.error("Usage : node tools/trancher.mjs <manifeste-impression.json> [--sortie=…] [--docker=<image>] [--deux-fois]"); process.exit(1); }

const PROFILS = path.resolve(opt("profils") || path.join(RACINE, "fabrication/profils/p2s"));
const P = { machine: "machine.json", process: "process-0.20mm.json", filament: "filament-pla.json" };
const MATIERES_PROFIL = ["pla"];
const TOLERANCE_MM = 0.01;
/* Lignes qui changent d'un tranchage à l'autre sans changer l'impression : aucune dans le G-code de Bambu Studio
   02.08.02.61 lancé par fabrication/bambu-studio (1 cœur, sans ASLR) ; filtre gardé par prudence. */
const HORODATAGE = /^;.*\b(date|generated at|creation|timestamp)\b/i;

/* --- Lecture d'une archive zip (3MF), sans dépendance --- */
function lireZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("archive zip illisible (pas de répertoire central)");
  const n = buf.readUInt16LE(e + 10), entrees = new Map();
  let o = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(o) !== 0x02014b50) throw new Error("archive zip corrompue");
    const methode = buf.readUInt16LE(o + 10), taille = buf.readUInt32LE(o + 20);
    const ln = buf.readUInt16LE(o + 28), lx = buf.readUInt16LE(o + 30), lc = buf.readUInt16LE(o + 32);
    const local = buf.readUInt32LE(o + 42), nom = buf.toString("utf8", o + 46, o + 46 + ln);
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + taille);
    entrees.set(nom, () => methode === 8 ? zlib.inflateRawSync(brut) : methode === 0 ? brut : (() => { throw new Error(`${nom} : compression ${methode}`); })());
    o += 46 + ln + lx + lc;
  }
  return entrees;
}

/* --- Lancement de Bambu Studio --- */
function bambu(stls, dossier, nom3mf) {
  const image = opt("docker");
  const cli = ["--debug", "2",
    "--load-settings", null, "--load-filaments", null,
    "--arrange", "0", "--orient", "0", "--slice", "0",
    "--outputdir", null, "--export-3mf", nom3mf];
  let cmd, argv;
  if (image) {
    const dStl = path.dirname(stls[0]);
    cli[3] = `/p/${P.machine};/p/${P.process}`; cli[5] = `/p/${P.filament}`; cli[13] = "/s";
    cmd = "docker";
    /* seccomp=unconfined : seul moyen de couper l'ASLR (setarch -R) dans le conteneur, condition d'un G-code reproductible
       (voir fabrication/bambu-studio) ; conteneur sans réseau, fichiers du dépôt uniquement. */
    argv = ["run", "--rm", "--network", "none", "--security-opt", "seccomp=unconfined", "-u", `${process.getuid()}:${process.getgid()}`, "-e", "HOME=/tmp",
      "-v", `${PROFILS}:/p:ro`, "-v", `${dStl}:/e:ro`, "-v", `${dossier}:/s`, "-w", "/s",
      image, "bambu-studio", ...cli, ...stls.map(f => `/e/${path.basename(f)}`)];
  } else {
    cli[3] = `${path.join(PROFILS, P.machine)};${path.join(PROFILS, P.process)}`; cli[5] = path.join(PROFILS, P.filament);
    cli[13] = dossier;
    cmd = process.env.BAMBU_STUDIO || "bambu-studio";
    argv = [...cli, ...stls];
  }
  const t0 = process.hrtime.bigint();
  const r = spawnSync(cmd, argv, { cwd: dossier, encoding: "utf8", maxBuffer: 256 << 20 });
  const duree = Number(process.hrtime.bigint() - t0) / 1e9;
  fs.writeFileSync(path.join(dossier, "bambu-studio.log"), (r.stdout || "") + (r.stderr || ""));
  if (r.error) throw new Error(`${cmd} introuvable ou en échec : ${r.error.message}`);
  const rapport = path.join(dossier, "result.json");
  const res = fs.existsSync(rapport) ? JSON.parse(fs.readFileSync(rapport, "utf8")) : null;
  if (r.status !== 0 || !res || res.return_code !== 0)
    throw new Error(`Bambu Studio : code ${r.status}${res ? `, ${res.error_string}` : ""} (journal : ${path.join(dossier, "bambu-studio.log")})`);
  return { res, duree };
}

/* --- Contrôle du .gcode.3mf produit --- */
function controler(f3mf, pieces) {
  const z = lireZip(fs.readFileSync(f3mf)), err = [];
  for (const e of ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model", "Metadata/plate_1.gcode", "Metadata/plate_1.gcode.md5",
    "Metadata/plate_1.json", "Metadata/slice_info.config", "Metadata/project_settings.config"])
    if (!z.has(e)) err.push(`entrée absente : ${e}`);
  if (err.length) return { ok: false, erreurs: err };
  const gcode = z.get("Metadata/plate_1.gcode")();
  const md5 = crypto.createHash("md5").update(gcode).digest("hex").toUpperCase();
  if (z.get("Metadata/plate_1.gcode.md5")().toString().trim().toUpperCase() !== md5) err.push("md5 du G-code incohérent");
  const texte = gcode.toString("utf8");
  const modele = (texte.match(/^; printer_model = (.*)$/m) || [])[1];
  if (modele !== "Bambu Lab P2S") err.push(`G-code : printer_model = ${modele}`);
  const info = z.get("Metadata/slice_info.config")().toString();
  const id = (info.match(/key="printer_model_id" value="([^"]*)"/) || [])[1];
  if (id !== "N7") err.push(`slice_info : printer_model_id = ${id} (P2S attendu : N7)`);
  const plaque = JSON.parse(z.get("Metadata/plate_1.json")());
  for (const p of pieces) {
    const o = plaque.bbox_objects.find(b => b.name === path.basename(p.stl));
    if (!o) { err.push(`${p.stl} absent du plateau`); continue; }
    const attendu = [p.boite.min[0], p.boite.min[1], p.boite.max[0], p.boite.max[1]];
    const ecart = Math.max(...o.bbox.map((v, i) => Math.abs(v - attendu[i])));
    if (ecart > TOLERANCE_MM) err.push(`${p.stl} déplacé de ${ecart.toFixed(3)} mm (${o.bbox.map(v => v.toFixed(2))} au lieu de ${attendu})`);
  }
  return { ok: err.length === 0, erreurs: err, printer_model: modele, printer_model_id: id, plateau: plaque.bed_type,
    gcode_sha256_hors_horodatage: crypto.createHash("sha256").update(texte.split("\n").filter(l => !HORODATAGE.test(l)).join("\n")).digest("hex"),
    gcode_lignes: texte.split("\n").length };
}

try {
  const fm = path.resolve(fichier), dirM = path.dirname(fm);
  const m = JSON.parse(fs.readFileSync(fm, "utf8"));
  if (!m.impression) throw new Error(`${fichier} : pas un manifeste « --impression » de generer-stl`);
  for (const k of Object.values(P)) if (!fs.existsSync(path.join(PROFILS, k))) throw new Error(`profil absent : ${path.join(PROFILS, k)}`);
  if (!MATIERES_PROFIL.includes(m.matiere))
    console.warn(`Attention : matière ${m.matiere} ; seul le profil PLA générique existe (essai de faisabilité : tranché en PLA).`);
  const sortie = path.resolve(opt("sortie") || dirM), nom = path.basename(fm).replace(/-impression\.json$/, "");
  fs.mkdirSync(sortie, { recursive: true });
  const bilan = { produit: m.produit, cotes: m.cotes, matiere_produit: m.matiere, profils: { dossier: path.relative(RACINE, PROFILS), ...P },
    bambu_studio: null, plateaux: [] };
  m.impression.plateaux.forEach((pieces, k) => {
    const stls = pieces.map(p => path.join(dirM, p.stl)), f3mf = `${nom}-plateau${k + 1}.gcode.3mf`;
    const passes = [];
    for (let i = 0; i < (args.includes("--deux-fois") ? 2 : 1); i++) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trancher-"));
      const { res, duree } = bambu(stls, tmp, f3mf);
      const pl = res.sliced_plates[0];
      const c = controler(path.join(tmp, f3mf), pieces);
      const log = fs.readFileSync(path.join(tmp, "bambu-studio.log"), "utf8");
      bilan.bambu_studio ??= (log.match(/Current BambuStudio Version (\S+)/) || [])[1] || null;
      passes.push({ tmp, duree_s: Math.round(duree * 10) / 10,
        masse_g: Math.round(pl.filaments.reduce((s, f) => s + f.total_used_g, 0) * 100) / 100,
        temps_s: Math.round(pl.total_predication), controle: c });
    }
    const [a, b] = passes;
    fs.copyFileSync(path.join(a.tmp, f3mf), path.join(sortie, f3mf));
    const e = { plateau: k + 1, fichier: f3mf, pieces: pieces.map(p => p.stl), masse_g: a.masse_g, temps_s: a.temps_s,
      temps: `${Math.floor(a.temps_s / 3600)} h ${String(Math.round(a.temps_s % 3600 / 60)).padStart(2, "0")} min`,
      tranchage_s: passes.map(p => p.duree_s), controle: a.controle };
    if (b) e.reproductible = { masse: a.masse_g === b.masse_g, temps: a.temps_s === b.temps_s,
      gcode: a.controle.gcode_sha256_hors_horodatage === b.controle.gcode_sha256_hors_horodatage };
    bilan.plateaux.push(e);
    passes.forEach(p => fs.rmSync(p.tmp, { recursive: true, force: true }));
    console.log(`${path.relative(process.cwd(), path.join(sortie, f3mf))} — ${e.masse_g} g, ${e.temps}, tranché en ${e.tranchage_s.join(" s / ")} s, `
      + `contrôle ${a.controle.ok ? "OK" : "ÉCHEC : " + a.controle.erreurs.join(" ; ")}`
      + (b ? `, reproductible : ${Object.entries(e.reproductible).map(([k, v]) => `${k} ${v ? "oui" : "NON"}`).join(", ")}` : ""));
  });
  fs.writeFileSync(path.join(sortie, `${nom}-tranchage.json`), JSON.stringify(bilan, null, 2) + "\n");
  const ko = bilan.plateaux.some(p => !p.controle.ok || (p.reproductible && !Object.values(p.reproductible).every(Boolean)));
  if (ko) process.exit(2);
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
}
