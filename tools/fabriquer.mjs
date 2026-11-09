#!/usr/bin/env node
/* Evarysth · chaîne de fabrication : fichiers d'un article payé, dans un dossier prêt à envoyer dans R2
   (commandes/<CF>/<SHA court>/). Appelé par .github/workflows/fabrication.yml ; utilisable à la main.
   Usage : node tools/fabriquer.mjs --cf=<n°> --produit=<id> --cotes='{"a":60}' [--coloris=<id>] [--quantite=<n>]
           [--sha=<sha du site>] [--docker=<image>] [--sortie=<dossier>]
   Étapes : generer-stl --impression --quantite --3mf (contrôles de géométrie compris) → trancher.mjs si la matière a
   un profil à l'atelier (PLA, PETG) → fiche-impression.mjs → dossier de sortie :
     manifeste.json, *.stl, plateau-<n>.3mf (non tranché), plateau-<n>.gcode.3mf (PLA/PETG), fiche.html
   et bilan.json (pour le rappel /fabrication/retour : statut, masse, temps, plateaux, motif ; jamais envoyé dans R2).
   Code de sortie : 0 fichiers prêts, 1 échec (motif dans bilan.json). Aucune donnée client : les entrées ne sont que
   n° d'article, produit, cotes, coloris, quantité, SHA. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };

/* Entrées acceptées (mêmes règles que le workflow et le Worker) */
export const FORMATS = {
  cf: /^CF-[0-9A-Z]{4,}-[0-9]{4,}-[0-9A-Z]{1,4}$/,
  produit: /^[a-z0-9][a-z0-9-]{0,60}$/,
  coloris: /^[a-z0-9-]{0,40}$/,
  sha: /^[0-9a-f]{40}$/
};
export function lireCotes(texte) {
  let c;
  try { c = JSON.parse(texte); } catch { throw new Error("cotes : JSON illisible"); }
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("cotes : objet { clé: mm } attendu");
  const e = Object.entries(c);
  if (!e.length || e.length > 6 || !e.every(([k, v]) => /^[a-z]$/.test(k) && typeof v === "number" && Number.isFinite(v)))
    throw new Error("cotes : 1 à 6 clés d'une lettre, valeurs numériques");
  return c;
}

function lancer(script, argv) {
  const r = spawnSync(process.execPath, [path.join(RACINE, "tools", script), ...argv], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20 });
  process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
  const motif = ((r.stderr || "").match(/Erreur : ([^\n]*)/) || [])[1];
  return { code: r.status, motif };
}

async function principal() {
  const e = { cf: opt("cf"), produit: opt("produit"), coloris: opt("coloris") || "", sha: opt("sha") || null };
  for (const k of ["cf", "produit"]) if (!FORMATS[k].test(e[k] || "")) throw new Error(`${k} : valeur refusée`);
  if (!FORMATS.coloris.test(e.coloris)) throw new Error("coloris : valeur refusée");
  if (e.sha && !FORMATS.sha.test(e.sha)) throw new Error("sha : 40 caractères hexadécimaux attendus");
  const cotes = lireCotes(opt("cotes") || "");
  const quantite = Number(opt("quantite") || 1);
  if (!Number.isInteger(quantite) || quantite < 1 || quantite > 99) throw new Error("quantite : entier de 1 à 99");
  const sortie = path.resolve(opt("sortie") || path.join(RACINE, "sortie-fabrication"));
  const travail = path.join(sortie, ".travail");
  fs.rmSync(sortie, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });

  const t0 = Date.now();
  const g = lancer("generer-stl.mjs", [e.produit, ...Object.entries(cotes).map(([k, v]) => `${k}=${v}`), "--impression", "--3mf",
    `--quantite=${quantite}`, `--cf=${e.cf}`, ...(e.coloris ? [`--coloris=${e.coloris}`] : []), `--sortie=${travail}`]);
  if (g.code !== 0) return echec(sortie, `génération : ${g.motif || "erreur"}`);
  const fm = fs.readdirSync(travail).find(f => f.endsWith("-impression.json"));
  const tGen = Date.now();
  const tr = lancer("trancher.mjs", [path.join(travail, fm), ...(opt("docker") ? [`--docker=${opt("docker")}`] : [])]);
  const tranche = tr.code === 0;
  if (tr.code !== 0 && tr.code !== 3) return echec(sortie, `tranchage : ${tr.motif || `contrôle du fichier tranché en écart (code ${tr.code})`}`);
  const tTr = Date.now();

  /* Dossier final : noms stables (plateau-<n>…), manifeste réécrit avec ces noms */
  const m = JSON.parse(fs.readFileSync(path.join(travail, fm), "utf8"));
  const copier = (de, vers) => fs.copyFileSync(path.join(travail, de), path.join(sortie, vers));
  m.impression.plateaux.forEach(ps => ps.forEach(p => copier(p.stl, p.stl)));
  m.impression.troismf = (m.impression.troismf || []).map((f, k) => { copier(f, `plateau-${k + 1}.3mf`); return `plateau-${k + 1}.3mf`; });
  for (const t of m.impression.tranches || []) { copier(t.fichier, `plateau-${t.plateau}.gcode.3mf`); t.fichier = `plateau-${t.plateau}.gcode.3mf`; }
  Object.assign(m, {
    cf: e.cf, sha: e.sha || (m.git && m.git.sha), statut: "prete",
    atelier: tranche ? "oui" : "non (matière sans profil à l'atelier : fabricant externe)",
    versions: { node: process.versions.node, manifold3d: m.moteur && m.moteur.manifold3d, bambu_studio: m.tranchage ? m.tranchage.bambu_studio : null,
      image: process.env.EVARYSTH_IMAGE || opt("docker") || null, profils: m.tranchage ? m.tranchage.profils : null },
    durees_s: { generation: Math.round((tGen - t0) / 100) / 10, tranchage: Math.round((tTr - tGen) / 100) / 10 }
  });
  m.fichiers = fs.readdirSync(sortie).filter(f => !f.startsWith(".")).sort().concat("fiche.html", "manifeste.json");
  fs.writeFileSync(path.join(sortie, "manifeste.json"), JSON.stringify(m, null, 2) + "\n");
  const f = lancer("fiche-impression.mjs", [path.join(sortie, "manifeste.json"), `--sortie=${path.join(sortie, "fiche.html")}`]);
  if (f.code !== 0) return echec(sortie, `fiche : ${f.motif || "erreur"}`);
  fs.rmSync(travail, { recursive: true, force: true });
  const bilan = { cf: e.cf, sha: m.sha, statut: "prete", masse_g: m.masse_g ?? null, temps_min: m.temps_min ?? null,
    plateaux: m.impression.plateaux.length, motif: tranche ? "" : `${String(m.matiere).toUpperCase()} : non tranché (fabricant externe)` };
  fs.writeFileSync(path.join(path.dirname(sortie), "bilan.json"), JSON.stringify(bilan) + "\n");
  console.log(`Prêt : ${m.fichiers.length} fichiers dans ${path.relative(process.cwd(), sortie) || "."} — ${bilan.plateaux} plateau(x)`
    + (tranche ? `, ${bilan.masse_g} g, ${bilan.temps_min} min` : ", non tranché"));
  return 0;
}

function echec(sortie, motif) {
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  const bilan = { cf: opt("cf") || "", sha: opt("sha") || "", statut: "echec", masse_g: null, temps_min: null, plateaux: null, motif: motif.slice(0, 300) };
  fs.writeFileSync(path.join(path.dirname(sortie), "bilan.json"), JSON.stringify(bilan) + "\n");
  console.error(`Échec : ${bilan.motif}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().then(c => process.exit(c), x => process.exit(echec(path.resolve(opt("sortie") || path.join(RACINE, "sortie-fabrication")), x.message)));
}
