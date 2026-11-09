#!/usr/bin/env node
/* Evarysth — génère le STL d'un produit avec le même calcul que l'aperçu du site, jeu de la matière compris.
   Usage : node tools/generer-stl.mjs <produit> [a=… b=… c=…] [--taille=<libellé|1-3>] [--impression] [--quantite=<n>]
           [--coloris=<id>] [--cf=<n° CF>] [--sortie=<dossier>] [--forcer]
   Sortie (ignorée par git), dans sortie-stl/ :
     sans --impression : <produit>-<cotes>.stl (repère Z en haut, pièces assemblées comme sur le site) + .json (manifeste) ;
     --impression      : pièces séparées, orientées selon la fiche d'impression (data.js), posées à z = 0 et rangées
                         sur le plateau de la Bambu Lab (256 × 256 mm) : <produit>-<cotes>-plateau<n>-<pièce>.stl,
                         un fichier par pièce dans les coordonnées du plateau, + manifeste (position de chaque pièce) ;
                         --quantite=n : n exemplaires répartis sur autant de plateaux que nécessaire (fichiers -ex<k>) ;
                         bande avant de 10 mm laissée libre (ligne de chargement de la P2S, voir lib/impression.mjs).
   --coloris=<id> : coloris du produit (data.js), noté dans le manifeste (couleur passée au tranchage) ; défaut : le 1er.
   --cf=<n°>      : n° de l'article (chaîne de fabrication), noté dans le manifeste.
   --3mf          : avec --impression, un 3MF non tranché par plateau (<nom>-plateau<n>.3mf : pièces en place, couleur du
                    coloris), pour un fabricant externe ou un autre trancheur.
   Erreur franche si une cote sort des bornes de data.js, si le maillage n'est pas étanche, si le nombre de solides
   diffère de celui que déclare le modèle, si une cote fonctionnelle, la paroi minimale ou la fiche d'impression
   (pièce hors du volume, sans appui) est en écart (mêmes contrôles que tools/verifier-geometrie.mjs) ;
   --forcer écrit quand même le fichier, pour diagnostic (signalé dans le manifeste).
   Dépendances : cd tools && npm ci. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { RACINE, THREE, MANIFOLD_VERSION, produit, cotes, modele, stlBinaire, solidesAttendus, jeu as jeuProduit } from "./lib/moteur.mjs";
import { verifierCombinaison } from "./lib/controles.mjs";
import { piecesImpression, ranger, placer, PLATEAU, MARGE_AVANT } from "./lib/impression.mjs";
import { modele3mf, archive3mf } from "./lib/troismf.mjs";

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
const id = args.find(x => !x.startsWith("--") && !x.includes("="));
const forcer = args.includes("--forcer"), impression = args.includes("--impression");
const quantite = Number(opt("quantite") ?? 1);
if (!id) { console.error("Usage : node tools/generer-stl.mjs <produit> [a=… b=…] [--taille=…] [--impression] [--sortie=…] [--forcer]"); process.exit(1); }

try {
  const p = produit(id);
  if (!Number.isInteger(quantite) || quantite < 1 || quantite > 99) throw new Error("--quantite : entier de 1 à 99");
  if (quantite > 1 && !impression) throw new Error("--quantite ne sert qu'avec --impression");
  const colors = p.colors || [], col = opt("coloris") ? colors.find(c => c.id === opt("coloris")) : colors[0];
  if (opt("coloris") && !col) throw new Error(`${p.id} : coloris « ${opt("coloris")} » inconnu (${colors.map(c => c.id).join(", ") || "aucun"})`);
  const valeurs = Object.fromEntries(args.filter(x => !x.startsWith("--") && x.includes("=")).map(x => x.split("=")));
  const v = cotes(p, { taille: opt("taille"), valeurs }), jeu = jeuProduit(p);
  const { erreurs } = await verifierCombinaison(p, v, { impression });
  if (erreurs.length && !forcer) throw new Error(`${p.id} :\n- ${erreurs.join("\n- ")}\n--forcer pour écrire quand même (diagnostic).`);
  const { kit, calc, build } = await modele(p.model);
  const r = calc(v, jeu), b = kit.bilan(r), attendu = solidesAttendus(build, { ...v, jeu });
  if (!b.mf) throw new Error(`${p.id} : maillage non étanche, rien à écrire`);
  const r2 = x => Math.round(x * 1000) / 1000;
  let sha = null, sale = null;
  try {
    sha = execSync("git rev-parse HEAD", { cwd: RACINE }).toString().trim();
    sale = execSync("git status --porcelain -- assets/js", { cwd: RACINE }).toString().trim() !== "";
  } catch { /* hors dépôt git */ }
  const nom = `${p.id}-${Object.entries(v).map(([k, x]) => `${k}${x}`).join("-")}`;
  const dir = path.resolve(RACINE, opt("sortie") || "sortie-stl");
  fs.mkdirSync(dir, { recursive: true });
  const boite = mf => { const bb = mf.boundingBox(); return { min: [...bb.min].map(r2), max: [...bb.max].map(r2), taille: [0, 1, 2].map(i => r2(bb.max[i] - bb.min[i])) }; };
  const manifeste = {
    ...(opt("cf") ? { cf: opt("cf") } : {}),
    produit: p.id, modele: p.model, cotes: v, taille: opt("taille") ?? null, matiere: p.impression ? p.impression.matiere : p.matiere, jeu,
    coloris: col ? { id: col.id, label: col.label, hex: col.hex } : null, quantite,
    git: { sha, modifie: sale }, moteur: { manifold3d: MANIFOLD_VERSION, three: THREE.REVISION, node: process.versions.node },
    etanche: b.etanche, horsKit: b.horsKit, volume_mm3: r2(b.volume), solides: b.solides, solides_attendus: attendu ?? null,
    controles: erreurs.length ? { ok: false, erreurs } : { ok: true }, date: new Date().toISOString()
  };
  if (!impression) {
    /* Repère Z vers le haut (l'aperçu est en Y vers le haut) : rotation propre de +90° autour de X */
    const mf = b.mf.rotate([90, 0, 0]), stl = stlBinaire(mf);
    Object.assign(manifeste, { boite: boite(mf), triangles: stl.readUInt32LE(80), repere: "Z vers le haut (aperçu : Y vers le haut, tourné de +90° autour de X)", stl: `${nom}.stl` });
    fs.writeFileSync(path.join(dir, `${nom}.stl`), stl);
    mf.delete();
    console.log(`${path.relative(RACINE, path.join(dir, nom))}.stl — ${manifeste.boite.taille.join(" × ")} mm, ${Math.round(b.volume)} mm³, `
      + `${b.etanche ? "étanche" : "NON ÉTANCHE"}, ${b.solides} solide(s)${erreurs.length ? `, ${erreurs.length} écart(s) (--forcer)` : ""}`);
  } else {
    if (!p.impression) throw new Error(`${p.id} : pas de fiche d'impression dans data.js`);
    const pcs = piecesImpression(b.mf, p.impression), plateaux = ranger(pcs, quantite);
    const fiche = p.impression;
    manifeste.impression = { plateau_mm: PLATEAU, marge_avant_mm: MARGE_AVANT, orientation: fiche.orientation, supports: fiche.supports,
      remarques: fiche.remarques, pieces: pcs.map((q, i) => ({ piece: i + 1, nom: q.nom || null, taille: q.taille.map(r2), volume_mm3: r2(q.volume),
        orientation: (fiche.pieces && fiche.pieces[i] && fiche.pieces[i].orientation) || fiche.orientation, ...(q.erreur ? { erreur: q.erreur } : {}) })),
      plateaux: [] };
    const avec3mf = args.includes("--3mf");
    plateaux.forEach((poses, k) => {
      const objets = [];
      const liste = poses.map(po => {
        const q = pcs[po.piece], mf = placer(q, po), stl = stlBinaire(mf);
        const f = `${nom}-plateau${k + 1}-${po.piece + 1}${q.nom ? "-" + q.nom.normalize("NFD").replace(/[^\w-]/g, "") : ""}${quantite > 1 ? `-ex${po.copie + 1}` : ""}.stl`;
        fs.writeFileSync(path.join(dir, f), stl);
        const e = { piece: po.piece + 1, nom: q.nom || null, exemplaire: po.copie + 1, stl: f, boite: boite(mf), tourne_z_90: po.tourne,
          appui_mm2: r2(q.appui), volume_mm3: r2(q.volume), ...(po.hors_marge ? { hors_marge_avant: true } : {}) };
        if (avec3mf) objets.push({ nom: f.replace(/\.stl$/, ""), mesh: mf.getMesh() });
        if (po.hors_marge) console.warn(`Attention : ${f} plus profond que la surface utile, posé à Y = 0 (marge avant de ${MARGE_AVANT} mm non tenue).`);
        mf.delete();
        return e;
      });
      manifeste.impression.plateaux.push(liste);
      if (avec3mf) {
        const f3 = `${nom}-plateau${k + 1}.3mf`;
        fs.writeFileSync(path.join(dir, f3), archive3mf(modele3mf(objets, { matiere: String(manifeste.matiere).toUpperCase(), couleur: col && col.hex,
          titre: `${p.name} — plateau ${k + 1}` })));
        (manifeste.impression.troismf ||= []).push(f3);
      }
    });
    pcs.filter(q => q.erreur).forEach((q, i) => console.error(`Pièce hors volume : ${q.erreur}`));
    pcs.forEach(q => q.mf.delete());
    const n = plateaux.reduce((s, x) => s + x.length, 0);
    console.log(`${path.relative(RACINE, path.join(dir, nom))}-plateau*.stl — ${n} pièce(s)${quantite > 1 ? ` (${quantite} exemplaires)` : ""} sur ${plateaux.length} plateau(x), `
      + `supports : ${fiche.supports ? "oui" : "non"}${erreurs.length ? `, ${erreurs.length} écart(s) (--forcer)` : ""}`);
  }
  fs.writeFileSync(path.join(dir, `${nom}${impression ? "-impression" : ""}.json`), JSON.stringify(manifeste, null, 2) + "\n");
  kit.flush();
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
}
