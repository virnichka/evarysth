/* Evarysth — tests de géométrie des produits : cd tools && node --test
   Pour chaque produit à modèle 3D et chaque combinaison min/défaut/max de ses cotes : maillage étanche, nombre de
   solides déclaré, cotes fonctionnelles (± 0,05 mm), paroi minimale, fiche d'impression (pièces dans le volume de la
   Bambu Lab, surface d'appui, pièces séparées), référence figée (tools/references-geometrie.json).
   Après un changement de forme voulu : node tools/verifier-geometrie.mjs --mettre-a-jour (affiche les écarts). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RACINE, produits, combinaisons, modele, cotes, jeu } from "../lib/moteur.mjs";
import { verifierCombinaison, cleCombinaison } from "../lib/controles.mjs";
import { piecesImpression, ecartPlateau, verifierFiche } from "../lib/impression.mjs";

const refs = JSON.parse(fs.readFileSync(path.join(RACINE, "tools/references-geometrie.json"), "utf8"));
const liste = produits.filter(p => p.model);

test("19 produits à modèle 3D, tous dans la référence figée, sans combinaison périmée", () => {
  assert.equal(liste.length, 19);
  assert.deepEqual(Object.keys(refs).sort(), liste.map(p => p.id).sort());
  for (const p of liste) {
    const cles = combinaisons(p.custom.params).map(v => cleCombinaison(cotes(p, { valeurs: v })));
    assert.deepEqual(Object.keys(refs[p.id]).sort(), cles.sort(), `${p.id} : combinaisons de la référence`);
  }
});

test("chaque matière a un jeu d'ajustement", () => {
  for (const [k, m] of Object.entries(EVARYSTH.matieres)) assert.ok(m.jeu > 0 && m.jeu < 1, `${k} : jeu ${m.jeu}`);
});

for (const p of liste) {
  test(p.id, async t => {
    await t.test("fiche d'impression", async () => {
      assert.deepEqual(verifierFiche(p).erreurs, []);
      const { kit, calc } = await modele(p.model);
      const b = kit.bilan(calc(cotes(p), jeu(p))), pcs = piecesImpression(b.mf, p.impression);
      const e = ecartPlateau(p.impression, pcs);
      pcs.forEach(q => q.mf.delete()); kit.flush();
      assert.equal(e, null);
    });
    for (const v of combinaisons(p.custom.params)) {
      await t.test(cleCombinaison(v), async () => {
        const { erreurs } = await verifierCombinaison(p, v, { reference: refs[p.id] });
        assert.deepEqual(erreurs, []);
      });
    }
  });
}
