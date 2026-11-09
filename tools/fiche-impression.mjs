#!/usr/bin/env node
/* Evarysth · chaîne de fabrication : fiche d'impression d'un article (fiche.html), lisible par un fabricant.
   Usage : node tools/fiche-impression.mjs <manifeste …-impression.json> [--sortie=<fichier.html>]
   Source : le manifeste de generer-stl --impression (complété par trancher.mjs s'il a tourné) et data.js (libellés).
   Contenu : produit, n° d'article, matière, jeu, coloris, quantité, cotes, orientation, supports, remarques, pièces,
   plateaux (fichiers, masse et temps si tranché), contrôles. AUCUNE donnée client (le manifeste n'en contient pas).
   Page autonome (aucune ressource externe), imprimable. */
import fs from "node:fs";
import path from "node:path";
import { produit } from "./lib/moteur.mjs";

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const fichier = args.find(x => !x.startsWith("--"));

const e = s => String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const mm = x => `${String(Math.round(x * 10) / 10).replace(".", ",")} mm`;
const POSES = {
  "1,0,0,0,0,-1,0,1,0": "debout, comme sur la fiche du site (l'axe vertical du produit reste vertical)",
  "1,0,0,0,0,1,0,-1,0": "retournée, le dessus du produit contre le plateau",
  "1,0,0,0,1,0,0,0,1": "à plat, couchée sur sa face la plus large",
  "0,0,-1,0,1,0,1,0,0": "sur le côté"
};
const duree = min => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
const pose = o => POSES[(o || []).flat().join(",")] || "orientation propre au produit";

export function ficheHtml(m, p) {
  const params = (p.custom && p.custom.params) || [];
  const cotes = Object.entries(m.cotes || {}).map(([k, v]) => {
    const d = params.find(x => x.key === k);
    return `<tr><td>${e(d ? d.label : k)}</td><td>${e(k)}</td><td class="n">${e(v)} mm</td></tr>`;
  }).join("");
  const imp = m.impression || {}, tr = imp.tranches || [];
  const pieces = (imp.pieces || []).map(q => `<tr><td>${q.piece}</td><td>${e(q.nom || "pièce " + q.piece)}</td>`
    + `<td class="n">${q.taille.map(mm).join(" × ")}</td><td class="n">${String(Math.round(q.volume_mm3 / 100) / 10).replace(".", ",")} cm³</td><td>${e(pose(q.orientation))}</td></tr>`).join("");
  const plateaux = (imp.plateaux || []).map((ps, k) => {
    const t = tr.find(x => x.plateau === k + 1);
    const ams = t && t.ams && t.ams[0];
    return `<tr><td>${k + 1}</td><td>${ps.length}</td><td>${ps.map(x => e(x.stl)).join("<br>")}</td>`
      + `<td>${(imp.troismf && imp.troismf[k]) ? e(imp.troismf[k]) : "—"}${t ? `<br>${e(t.fichier)}` : ""}</td>`
      + `<td class="n">${t ? `${String(t.masse_g).replace(".", ",")} g<br>${duree(t.temps_min)}` : "—"}</td>`
      + `<td>${ams ? `AMS ${e(ams.emplacement_conseille)}` : "—"}${ps.some(x => x.hors_marge_avant) ? "<br><strong>pièce au ras du bord avant</strong>" : ""}</td></tr>`;
  }).join("");
  const col = m.coloris;
  const ok = m.controles && m.controles.ok;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fiche d'impression ${e(m.cf || "")} — ${e(p.name)}</title>
<style>
:root{--fond:#fff;--texte:#1b1b1b;--doux:#666;--trait:#ddd;--ok:#1f7a3a;--ko:#b3261e}
@media (prefers-color-scheme:dark){:root{--fond:#161616;--texte:#eee;--doux:#aaa;--trait:#333}}
body{background:var(--fond);color:var(--texte);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:960px;padding:16px}
h1{font-size:1.4em;margin:.2em 0}h2{font-size:1.1em;margin:1.4em 0 .4em;border-bottom:1px solid var(--trait)}
table{border-collapse:collapse;width:100%;font-size:.95em}td,th{border-bottom:1px solid var(--trait);padding:4px 6px;text-align:left;vertical-align:top}
.n{text-align:right;white-space:nowrap}.doux{color:var(--doux)}.pastille{display:inline-block;width:1em;height:1em;border-radius:3px;vertical-align:-2px;border:1px solid var(--trait)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px;margin:0}dt{color:var(--doux)}dd{margin:0}
.etat{font-weight:600;color:${ok ? "var(--ok)" : "var(--ko)"}}.tableau{overflow-x:auto}
@media print{body{max-width:none}}
</style></head><body>
<p class="doux">Evarysth · fiche d'impression</p>
<h1>${e(p.name)}${m.cf ? ` — ${e(m.cf)}` : ""}</h1>
<dl>
<dt>Produit</dt><dd>${e(m.produit)}${m.taille ? ` · taille ${e(m.taille)}` : ""}</dd>
<dt>Quantité</dt><dd>${e(m.quantite || 1)} exemplaire(s)</dd>
<dt>Matière</dt><dd><strong>${e(String(m.matiere).toUpperCase())}</strong></dd>
<dt>Jeu d'ajustement</dt><dd>${e(String(m.jeu).replace(".", ","))} mm (déjà compris dans les fichiers)</dd>
<dt>Coloris</dt><dd>${col ? `<span class="pastille" style="background:${e(col.hex)}"></span> ${e(col.label)} (${e(col.hex)})` : "—"}</dd>
<dt>Supports</dt><dd><strong>${imp.supports ? "oui" : "non"}</strong></dd>
<dt>Version</dt><dd>${m.git && m.git.sha ? e(m.git.sha.slice(0, 12)) : "—"}</dd>
</dl>
<h2>Cotes</h2>
<div class="tableau"><table><tr><th>Cote</th><th>Clé</th><th class="n">Valeur</th></tr>${cotes}</table></div>
<h2>Orientation et remarques</h2>
<p>Les fichiers sont <strong>déjà orientés et posés sur le plateau</strong> (z = 0) : ne pas les réorienter ni les mettre à l'échelle.
Plateau ${e((imp.plateau_mm || []).join(" × "))} mm, bande avant de ${e(imp.marge_avant_mm ?? 0)} mm laissée libre.</p>
<p>${e(imp.remarques || "")}</p>
<h2>Pièces (par exemplaire)</h2>
<div class="tableau"><table><tr><th>N°</th><th>Pièce</th><th class="n">Dimensions posée</th><th class="n">Volume</th><th>Orientation</th></tr>${pieces}</table></div>
<h2>Plateaux</h2>
<div class="tableau"><table><tr><th>N°</th><th>Pièces</th><th>STL</th><th>3MF</th><th class="n">Masse, temps</th><th>Filament</th></tr>${plateaux}</table></div>
${m.masse_g != null ? `<p>Total estimé (tranchage atelier, P2S, 0,20 mm) : ${String(m.masse_g).replace(".", ",")} g, ${duree(m.temps_min)}.</p>` : ""}
<h2>Contrôles</h2>
<p class="etat">${ok ? "Géométrie contrôlée : étanche, cotes et parois conformes." : "Contrôles en écart : " + e((m.controles && m.controles.erreurs || []).join(" ; "))}</p>
<p class="doux">Généré le ${e((m.date || "").slice(0, 10))} par tools/fiche-impression.mjs.</p>
</body></html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!fichier) { console.error("Usage : node tools/fiche-impression.mjs <manifeste-impression.json> [--sortie=fiche.html]"); process.exit(1); }
  try {
    const fm = path.resolve(fichier), m = JSON.parse(fs.readFileSync(fm, "utf8"));
    if (!m.impression) throw new Error(`${fichier} : pas un manifeste « --impression » de generer-stl`);
    const sortie = path.resolve(opt("sortie") || path.join(path.dirname(fm), "fiche.html"));
    fs.writeFileSync(sortie, ficheHtml(m, produit(m.produit)));
    console.log(path.relative(process.cwd(), sortie));
  } catch (x) {
    console.error(`Erreur : ${x.message}`);
    process.exit(1);
  }
}
