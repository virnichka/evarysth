#!/usr/bin/env node
/* Evarysth — contrôle géométrique de tous les produits, à toutes les combinaisons min/défaut/max de leurs cotes :
   étanchéité, nombre de solides déclaré, cotes fonctionnelles par coupe (± 0,05 mm), paroi minimale, fiche
   d'impression (pièces posées dans le volume de la Bambu Lab, surface d'appui, exemplaires par plateau) et écart
   à la référence figée (tools/references-geometrie.json : boîte, volume, solides).
   Usage : node tools/verifier-geometrie.mjs [produit…] [--detail] [--mettre-a-jour]
     --detail        : une ligne par cote mesurée ;
     --mettre-a-jour : réécrit la référence des produits vérifiés après avoir affiché les écarts
                       (changement de forme voulu ; à committer avec le modèle).
   Code de sortie 1 au moindre écart. Les mêmes contrôles tournent dans les tests : cd tools && node --test. */
import fs from "node:fs";
import path from "node:path";
import { RACINE, produits, combinaisons, modele, cotes, jeu as jeuProduit } from "./lib/moteur.mjs";
import { verifierCombinaison, valeurReference, ecartReference } from "./lib/controles.mjs";
import { piecesImpression, maxParPlateau, ecartPlateau } from "./lib/impression.mjs";

export const FICHIER_REF = path.join(RACINE, "tools/references-geometrie.json");
const args = process.argv.slice(2);
const maj = args.includes("--mettre-a-jour"), detail = args.includes("--detail");
const ids = args.filter(a => !a.startsWith("--"));
const liste = produits.filter(p => p.model && (!ids.length || ids.includes(p.id)));
if (ids.length && liste.length !== ids.length) { console.error(`Produit inconnu : ${ids.filter(i => !liste.some(p => p.id === i)).join(", ")}`); process.exit(1); }
const refs = fs.existsSync(FICHIER_REF) ? JSON.parse(fs.readFileSync(FICHIER_REF, "utf8")) : {};

const f = (x, k = 3) => x.toLocaleString("fr-FR", { minimumFractionDigits: k, maximumFractionDigits: k });
let ko = 0, changes = 0;
const lignes = [];
for (const p of liste) {
  const ref = maj ? undefined : (refs[p.id] || null);
  const neuves = {};
  let n = 0, err = 0, ms = 0, ecartMax = 0, paroiMax = 0, plateaux = 0;
  for (const v of combinaisons(p.custom.params)) {
    const { erreurs, details: d } = await verifierCombinaison(p, v, { reference: ref });
    n++; ms += d.ms;
    if (d.etanche && d.volume) {
      neuves[d.cle] = valeurReference(d);
      if (maj) {
        const avant = refs[p.id] && refs[p.id][d.cle];
        const e = avant ? ecartReference(avant, d) : "nouvelle combinaison";
        if (e) { changes++; console.log(`~ ${p.id} ${d.cle} : ${e}`); }
      }
    }
    for (const c of d.cotes || []) {
      ecartMax = Math.max(ecartMax, Math.abs(c.ecart));
      if (detail) console.log(`  ${p.id} ${d.cle} | ${c.nom} | ${f(c.attendu)} | ${Number.isFinite(c.valeur) ? f(c.valeur) : "—"} | ${c.ok ? "ok" : "HORS TOLÉRANCE"}`);
    }
    if (d.paroi) paroiMax = Math.max(paroiMax, d.paroi.perte);
    plateaux = Math.max(plateaux, d.plateaux || 0);
    if (erreurs.length) { err++; ko += erreurs.length; for (const e of erreurs) console.error(`✗ ${p.id} ${d.cle} : ${e}`); }
  }
  /* Exemplaires par plateau aux cotes par défaut */
  let parPlateau = "—";
  if (p.impression) {
    const { kit, calc } = await modele(p.model);
    const b = kit.bilan(calc(cotes(p), jeuProduit(p)));
    const pcs = piecesImpression(b.mf, p.impression), e = ecartPlateau(p.impression, pcs);
    parPlateau = p.impression.plateaux ? `${p.impression.plateaux} plateaux / ex.` : `${p.impression.parPlateau} (max ${maxParPlateau(pcs)})`;
    pcs.forEach(q => q.mf.delete()); kit.flush();
    if (e) { ko++; err++; console.error(`✗ ${p.id} : ${e}`); }
  }
  if (maj) {
    for (const k of Object.keys(refs[p.id] || {})) if (!neuves[k]) { changes++; console.log(`~ ${p.id} ${k} : combinaison retirée`); }
    refs[p.id] = neuves;
  }
  lignes.push(`| ${p.id} | ${n} | ${err ? `**${err} en écart**` : "ok"} | ${f(ecartMax)} | ${f(paroiMax, 2)} | ${plateaux} | ${parPlateau} | ${Math.round(ms / n)} ms |`);
}
console.log("| Produit | Comb. | Résultat | Écart max des cotes (mm) | Paroi : perte max (mm²) | Plateaux max | Par plateau (défaut) | Calcul moyen |");
console.log("|---|---|---|---|---|---|---|---|");
for (const l of lignes) console.log(l);
if (maj) {
  /* Une ligne par combinaison : diff lisible en revue */
  const txt = Object.keys(refs).sort().map(id => `  ${JSON.stringify(id)}: {\n`
    + Object.entries(refs[id]).map(([k, x]) => `    ${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(",\n") + "\n  }").join(",\n");
  fs.writeFileSync(FICHIER_REF, `{\n${txt}\n}\n`);
  console.log(`Référence mise à jour (${changes} écart(s)) : ${path.relative(RACINE, FICHIER_REF)}`);
}
if (ko) { console.error(`${ko} écart(s)`); process.exit(1); }
