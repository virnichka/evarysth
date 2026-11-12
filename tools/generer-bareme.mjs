#!/usr/bin/env node
/* Evarysth · barème des prix sur-mesure (docs/fabrication.md, « Barème des prix »).
   Tranche une grille de cotes par produit (tools/lib/bareme.mjs) et écrit assets/js/bareme.js : volume de filament (cm³)
   et temps estimé (s) par point, lus par EVARYSTH.estimation (prix.js, barème lissé) par interpolation.
   Usage :
     node tools/generer-bareme.mjs [id…] [--tous] [--docker=<image>]     tranche les produits donnés (défaut : barèmes
                                                                          absents ou périmés) et met à jour bareme.js
     node tools/generer-bareme.mjs <id> --partiel=<f.json> [--docker=…]   tranche un produit vers un fichier partiel
                                                                          (matrice du workflow bareme.yml)
     node tools/generer-bareme.mjs --assembler <f.json…>                  fusionne des partiels dans bareme.js
     node tools/generer-bareme.mjs --perimes                              liste JSON des produits à retrancher
     node tools/generer-bareme.mjs --verifier [--tableau]                 empreintes (échec si périmé), avertissement
                                                                          si un prix standard est sous la formule ; --tableau :
                                                                          prix par produit (Markdown)
   Tranchage : generer-stl --impression (1 exemplaire) puis trancher.mjs (profil de l'atelier ; ASA, PA12, PA-CF estimés
   avec le profil PETG). Fichier généré : jamais édité à la main. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { RACINE, FICHIER, SCRIPTS_PRIX, VERSION_GRILLE, PROFIL, charger, avecBareme, matiereImpression, grille, axes, empreinte, perimes } from "./lib/bareme.mjs";

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const libres = args.filter(x => !x.startsWith("--"));
const CI = !!process.env.GITHUB_ACTIONS;

function lancer(script, argv, admis = [0]) {
  const r = spawnSync(process.execPath, [path.join(RACINE, "tools", script), ...argv], { cwd: RACINE, encoding: "utf8", maxBuffer: 64 << 20 });
  if (!admis.includes(r.status)) throw new Error(`${script} ${argv.join(" ")} : code ${r.status}\n${(r.stderr || r.stdout || "").slice(-1500)}`);
  return r;
}

/* Un point de la grille : cm³ de filament (masse tranchée / densité du profil) et temps (s), tous plateaux */
function trancherPoint(p, cotes, densiteProfil) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bareme-${p.id}-`));
  try {
    lancer("generer-stl.mjs", [p.id, ...Object.entries(cotes).map(([k, v]) => `${k}=${v}`), "--impression", `--sortie=${dir}`]);
    const fm = fs.readdirSync(dir).find(f => f.endsWith("-impression.json"));
    /* Code 2 = contrôle du .gcode.3mf en écart (position des pièces sur le plateau…) : masse et temps restent valables pour
       le barème ; signalé, à corriger côté fabrication. */
    const r = lancer("trancher.mjs", [path.join(dir, fm), `--profil-filament=${PROFIL[matiereImpression(p)]}`, ...(opt("docker") ? [`--docker=${opt("docker")}`] : [])], [0, 2]);
    if (r.status === 2) {
      const m = `${p.id} ${JSON.stringify(cotes)} : contrôle du fichier tranché en écart (${((r.stdout.match(/contrôle ÉCHEC : ([^\n]*)/) || [])[1] || "voir journal").slice(0, 200)}) ; masse et temps gardés`;
      console.log(CI ? `::warning title=Barème · contrôle de tranchage::${m}` : `Avertissement : ${m}`);
    }
    const t = JSON.parse(fs.readFileSync(path.join(dir, fm.replace(/-impression\.json$/, "-tranchage.json")), "utf8"));
    const g = t.plateaux.reduce((s, x) => s + x.masse_g, 0), s = t.plateaux.reduce((s, x) => s + x.temps_s, 0);
    return { cm3: Math.round(g / densiteProfil * 100) / 100, s: Math.round(s), plateaux: t.plateaux.length, bambu: t.bambu_studio };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function trancherProduit(E, p) {
  const prof = PROFIL[matiereImpression(p)];
  const json = JSON.parse(fs.readFileSync(path.join(RACINE, `fabrication/profils/p2s/filament-${prof}.json`), "utf8"));
  const densite = Number(json.filament_density[0]);
  const t0 = Date.now(), points = [];
  let bambu = null;
  for (const c of grille(p)) {
    const r = trancherPoint(p, c, densite);
    bambu ??= r.bambu;
    points.push([r.cm3, r.s]);
    console.log(`${p.id} ${JSON.stringify(c)} : ${r.cm3} cm³, ${Math.round(r.s / 60)} min, ${r.plateaux} plateau(x)`);
  }
  console.log(`${p.id} : ${points.length} points tranchés en ${Math.round((Date.now() - t0) / 1000)} s`);
  return { empreinte: empreinte(p, E), matiere: matiereImpression(p), profil: prof, bambu_studio: bambu, axes: axes(p), points };
}

/* bareme.js : une ligne par produit, ordre de data.js, produits retirés du catalogue supprimés */
function ecrire(E, nouveaux) {
  const ancien = (E.bareme && E.bareme.produits) || {};
  const tous = { ...ancien, ...nouveaux };
  const lignes = E.products.filter(avecBareme).filter(p => tous[p.id]).map(p => `    ${JSON.stringify(p.id)}: ${JSON.stringify(tous[p.id])}`);
  fs.writeFileSync(path.join(RACINE, FICHIER), `/* Evarysth — barème des prix sur-mesure. FICHIER GÉNÉRÉ par tools/generer-bareme.mjs (workflow « Barème »,
   bareme.yml) : ne pas modifier à la main. Par produit : empreinte des entrées (périmée → job geometrie rouge), matière,
   profil de tranchage, axes de la grille (mm) et points [cm³ de filament, temps estimé en s], premier axe = rang le plus
   lent. Lu par EVARYSTH.estimation (prix.js), qui le lisse sans le modifier. */
window.EVARYSTH = window.EVARYSTH || {};
EVARYSTH.bareme = {
  version: ${VERSION_GRILLE},
  produits: {
${lignes.join(",\n")}
  }
};
`);
  console.log(`${FICHIER} : ${lignes.length} produits (${Object.keys(nouveaux).length} mis à jour)`);
}

/* Tableau des prix (Markdown) : prix aux cotes min / défaut / max (masse, temps) et des tailles standard ;
   invariants : node tools/rapport-prix.mjs --verifier */
function tableau(E) {
  const lignes = ["| Produit | Matière | Min / défaut / max | Tailles standard |", "|---|---|---|---|"];
  for (const p of E.products.filter(avecBareme)) {
    const ext = ["min", "def", "max"].map(k => Object.fromEntries(p.custom.params.map(q => [q.key, q[k]])));
    const r = ext.map(v => E.prixDetail(p, v));
    if (r.some(x => !x)) { lignes.push(`| ${p.id} | — | barème absent | |`); continue; }
    lignes.push(`| ${p.id} | ${E.matieres[matiereImpression(p)].court} | ${r.map(x => `${x.prix} €`).join(" / ")}`
      + ` <br>(${r.map(x => `${Math.round(x.masse_g)} g, ${Math.round(x.temps_min)} min`).join(" / ")})`
      + ` | ${(p.variants ? p.variants.options : []).map(o => `${o.label} ${E.priceFor(p, "standard", o.values)} €`).join(" <br>")} |`);
  }
  return lignes.join("\n");
}

function principal() {
  if (args.includes("--perimes")) { console.log(JSON.stringify(perimes())); return 0; }
  const E = charger(SCRIPTS_PRIX);
  if (args.includes("--verifier")) {
    const p = perimes(E);
    if (args.includes("--tableau")) console.log(tableau(E));
    if (p.length) {
      const m = `Barème périmé ou absent : ${p.join(", ")}. Lancer le workflow « Barème des prix sur-mesure » (bareme.yml) sur la branche, `
        + `ou localement node tools/generer-bareme.mjs ${p.join(" ")} (Bambu Studio requis).`;
      console.error(CI ? `::error title=Barème périmé::${m}` : `Erreur : ${m}`);
      return 1;
    }
    console.log(`Barème à jour : ${E.products.filter(avecBareme).length} produits.`);
    return 0;
  }
  if (args.includes("--assembler")) {
    const n = {};
    for (const f of libres) Object.assign(n, JSON.parse(fs.readFileSync(f, "utf8")));
    ecrire(E, n);
    return 0;
  }
  const ids = libres.length ? libres : args.includes("--tous") ? E.products.filter(avecBareme).map(p => p.id) : perimes(E);
  for (const id of ids) {
    const p = E.getProduct(id);
    if (!p || !avecBareme(p)) throw new Error(`${id} : produit inconnu ou sans sur-mesure`);
  }
  if (!ids.length) { console.log("Barème déjà à jour : rien à trancher."); return 0; }
  const n = {};
  for (const id of ids) n[id] = trancherProduit(E, E.getProduct(id));
  if (opt("partiel")) fs.writeFileSync(opt("partiel"), JSON.stringify(n) + "\n");
  else ecrire(E, n);
  return 0;
}

try { process.exit(principal()); } catch (e) { console.error(`Erreur : ${e.message}`); process.exit(1); }
