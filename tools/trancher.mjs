#!/usr/bin/env node
/* Evarysth · chaîne de fabrication : tranche les plateaux produits par « generer-stl --impression ».
   Usage : node tools/trancher.mjs <manifeste …-impression.json> [--sortie=<dossier>] [--docker=<image>] [--deux-fois]
     - un .gcode.3mf par plateau (<nom>-plateau<n>.gcode.3mf), à côté du manifeste ou dans --sortie ;
     - masse (g) et temps estimé par plateau, lus dans le rapport de Bambu Studio, + <nom>-tranchage.json ; le manifeste
       de generer-stl est complété sur place (plateaux : fichier, masse, temps, filament, mapping AMS ; versions) ;
     - profil filament selon la matière de la fiche (PLA, PETG : profils de l'atelier) ; autre matière : refus (code 3),
       l'article part chez un fabricant externe (STL + 3MF non tranché + fiche) ;
     - couleur du filament = coloris du manifeste (hex), pour la correspondance AMS couleur ↔ emplacement ;
     - pièces gardées à leur position (aucun réarrangement : --arrange 0 --orient 0), contrôlées dans le .gcode.3mf ;
     - --docker=<image> : lance Bambu Studio dans l'image (fabrication/Dockerfile) ; sans cette option, la commande
       « bambu-studio » du PATH (dans l'image) ou $BAMBU_STUDIO ;
     - --deux-fois : tranche deux fois et compare masse, temps et G-code (hors lignes d'horodatage).
   Profils : fabrication/profils/p2s (machine P2S 0,4, process 0,20 mm, PLA et PETG génériques), autonomes.
   Voir docs/chaine-fabrication.md (Fabrication · phases 1a et 2a). */
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
/* Matières de l'atelier → profil filament (les autres partent chez un fabricant externe) */
export const PROFILS_FILAMENT = { pla: "filament-pla.json", petg: "filament-petg.json" };
const P = { machine: "machine.json", process: "process-0.20mm.json", filament: null };
/* Emplacement AMS conseillé : produits d'une seule couleur, un seul filament par plateau. Premier emplacement de l'AMS
   par défaut ; la machine associe aussi d'elle-même un emplacement chargé du même type et de la même couleur. */
const EMPLACEMENT_AMS = "A1";
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
function bambu(stls, dossier, nom3mf, filament) {
  const image = opt("docker");
  const cli = ["--debug", "2",
    "--load-settings", null, "--load-filaments", null,
    "--arrange", "0", "--orient", "0", "--slice", "0",
    "--outputdir", null, "--export-3mf", nom3mf];
  let cmd, argv;
  if (image) {
    const dStl = path.dirname(stls[0]);
    cli[3] = `/p/${P.machine};/p/${P.process}`; cli[5] = `/f/${path.basename(filament)}`; cli[13] = "/s";
    cmd = "docker";
    /* seccomp=unconfined : seul moyen de couper l'ASLR (setarch -R) dans le conteneur, condition d'un G-code reproductible
       (voir fabrication/bambu-studio) ; conteneur sans réseau, fichiers du dépôt uniquement. */
    argv = ["run", "--rm", "--network", "none", "--security-opt", "seccomp=unconfined", "-u", `${process.getuid()}:${process.getgid()}`, "-e", "HOME=/tmp",
      "-v", `${PROFILS}:/p:ro`, "-v", `${path.dirname(filament)}:/f:ro`, "-v", `${dStl}:/e:ro`, "-v", `${dossier}:/s`, "-w", "/s",
      image, "bambu-studio", ...cli, ...stls.map(f => `/e/${path.basename(f)}`)];
  } else {
    cli[3] = `${path.join(PROFILS, P.machine)};${path.join(PROFILS, P.process)}`; cli[5] = filament;
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
function controler(f3mf, pieces, couleur) {
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
  const couleurs = [...info.matchAll(/<filament [^>]*color="([^"]*)"/g)].map(x => x[1].toUpperCase());
  if (couleur && !(couleurs.length && couleurs.every(c => c.startsWith(couleur.toUpperCase())))) err.push(`slice_info : couleur ${couleurs.join(", ")} au lieu de ${couleur}`);
  const plaque = JSON.parse(z.get("Metadata/plate_1.json")());
  for (const p of pieces) {
    const o = plaque.bbox_objects.find(b => b.name === path.basename(p.stl));
    if (!o) { err.push(`${p.stl} absent du plateau`); continue; }
    /* Boîte de la 1re couche : centrée comme la pièce (aucun déplacement) et contenue dans sa boîte (une base
       chanfreinée ou arrondie donne une 1re couche plus petite, sans déplacement) */
    const attendu = [p.boite.min[0], p.boite.min[1], p.boite.max[0], p.boite.max[1]];
    const ecart = Math.max(Math.abs(o.bbox[0] + o.bbox[2] - attendu[0] - attendu[2]) / 2, Math.abs(o.bbox[1] + o.bbox[3] - attendu[1] - attendu[3]) / 2);
    const deborde = Math.max(attendu[0] - o.bbox[0], attendu[1] - o.bbox[1], o.bbox[2] - attendu[2], o.bbox[3] - attendu[3]);
    if (ecart > TOLERANCE_MM || deborde > TOLERANCE_MM)
      err.push(`${p.stl} déplacé de ${Math.max(ecart, deborde).toFixed(3)} mm (${o.bbox.map(v => v.toFixed(2))} au lieu de ${attendu})`);
  }
  const filament_m = Math.round([...info.matchAll(/<filament [^>]*used_m="([^"]*)"/g)].reduce((s, x) => s + Number(x[1]), 0) * 100) / 100;
  return { ok: err.length === 0, erreurs: err, printer_model: modele, printer_model_id: id, plateau: plaque.bed_type, couleurs, filament_m,
    gcode_sha256_hors_horodatage: crypto.createHash("sha256").update(texte.split("\n").filter(l => !HORODATAGE.test(l)).join("\n")).digest("hex"),
    gcode_lignes: texte.split("\n").length };
}

try {
  const fm = path.resolve(fichier), dirM = path.dirname(fm);
  const m = JSON.parse(fs.readFileSync(fm, "utf8"));
  if (!m.impression) throw new Error(`${fichier} : pas un manifeste « --impression » de generer-stl`);
  P.filament = PROFILS_FILAMENT[m.matiere];
  if (!P.filament) {
    console.error(`Matière ${m.matiere} : pas de profil à l'atelier (PLA, PETG) ; fichiers pour fabricant externe seulement.`);
    process.exit(3);
  }
  for (const k of Object.values(P)) if (!fs.existsSync(path.join(PROFILS, k))) throw new Error(`profil absent : ${path.join(PROFILS, k)}`);
  const couleur = opt("couleur") || (m.coloris && m.coloris.hex) || null;
  if (couleur && !/^#[0-9a-f]{6}$/i.test(couleur)) throw new Error(`couleur « ${couleur} » : #RRVVBB attendu`);
  /* Profil filament de l'article : celui de l'atelier, couleur du coloris (filament_colour) */
  const dirF = fs.mkdtempSync(path.join(os.tmpdir(), "filament-"));
  const profilF = JSON.parse(fs.readFileSync(path.join(PROFILS, P.filament), "utf8"));
  if (couleur) profilF.filament_colour = [couleur.toUpperCase()];
  const filament = path.join(dirF, P.filament);
  fs.writeFileSync(filament, JSON.stringify(profilF, null, 4) + "\n");
  const sortie = path.resolve(opt("sortie") || dirM), nom = path.basename(fm).replace(/-impression\.json$/, "");
  fs.mkdirSync(sortie, { recursive: true });
  const bilan = { produit: m.produit, cotes: m.cotes, matiere_produit: m.matiere, couleur, profils: { dossier: path.relative(RACINE, PROFILS), ...P },
    bambu_studio: null, plateaux: [] };
  m.impression.plateaux.forEach((pieces, k) => {
    const stls = pieces.map(p => path.join(dirM, p.stl)), f3mf = `${nom}-plateau${k + 1}.gcode.3mf`;
    const passes = [];
    for (let i = 0; i < (args.includes("--deux-fois") ? 2 : 1); i++) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trancher-"));
      const { res, duree } = bambu(stls, tmp, f3mf, filament);
      const pl = res.sliced_plates[0];
      const c = controler(path.join(tmp, f3mf), pieces, couleur);
      const log = fs.readFileSync(path.join(tmp, "bambu-studio.log"), "utf8");
      bilan.bambu_studio ??= (log.match(/Current BambuStudio Version (\S+)/) || [])[1] || null;
      passes.push({ tmp, duree_s: Math.round(duree * 10) / 10,
        masse_g: Math.round(pl.filaments.reduce((s, f) => s + f.total_used_g, 0) * 100) / 100,
        filament_m: c.filament_m,
        temps_s: Math.round(pl.total_predication), controle: c });
    }
    const [a, b] = passes;
    fs.copyFileSync(path.join(a.tmp, f3mf), path.join(sortie, f3mf));
    const e = { plateau: k + 1, fichier: f3mf, pieces: pieces.map(p => p.stl), masse_g: a.masse_g, filament_m: a.filament_m, temps_s: a.temps_s,
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
  fs.rmSync(dirF, { recursive: true, force: true });
  fs.writeFileSync(path.join(sortie, `${nom}-tranchage.json`), JSON.stringify(bilan, null, 2) + "\n");
  /* Manifeste de generer-stl complété : tranchage par plateau, filament et mapping AMS, versions */
  const filamentInfo = { matiere: m.matiere.toUpperCase(), profil: P.filament, couleur,
    coloris: m.coloris ? m.coloris.id : null, coloris_label: m.coloris ? m.coloris.label : null };
  m.tranchage = { bambu_studio: bilan.bambu_studio, image: process.env.EVARYSTH_IMAGE || opt("docker") || null,
    profils: { machine: P.machine, process: P.process, filament: P.filament, bundle_bbl: lireBundle() } };
  m.impression.tranches = bilan.plateaux.map(e => ({ plateau: e.plateau, fichier: e.fichier, masse_g: e.masse_g, filament_m: e.filament_m,
    temps_min: Math.round(e.temps_s / 60), controle_ok: e.controle.ok,
    filaments: [{ filament: 1, ...filamentInfo }],
    ams: [{ filament: 1, coloris: filamentInfo.coloris, couleur, matiere: filamentInfo.matiere, emplacement_conseille: EMPLACEMENT_AMS }] }));
  m.masse_g = Math.round(bilan.plateaux.reduce((s, e) => s + e.masse_g, 0) * 100) / 100;
  m.temps_min = Math.round(bilan.plateaux.reduce((s, e) => s + e.temps_s, 0) / 60);
  fs.writeFileSync(fm, JSON.stringify(m, null, 2) + "\n");
  const ko = bilan.plateaux.some(p => !p.controle.ok || (p.reproductible && !Object.values(p.reproductible).every(Boolean)));
  if (ko) process.exit(2);
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
}

function lireBundle() {
  try { return JSON.parse(fs.readFileSync(path.join(PROFILS, "origine.json"), "utf8")).bundle_bbl; } catch { return null; }
}
