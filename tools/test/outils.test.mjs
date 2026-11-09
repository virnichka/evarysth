/* Evarysth — tests des outils de contrôle eux-mêmes (mesures par coupe, paroi, rotations, rangement) */
import test from "node:test";
import assert from "node:assert/strict";
import { modele } from "../lib/moteur.mjs";
import { mesurerCote, mesurerParoi, repereConstruction } from "../lib/controles.mjs";
import { rotationPropre, ranger, PLATEAU } from "../lib/impression.mjs";

const { kit } = await modele("passe-cable");

test("mesures par coupe sur un tube connu (Ø 40 / Ø 30, axe Y)", () => {
  const s = kit.join(kit.cyl(20, 10, 15)).translate(5, 0, 0).rotateY(0.4);   // pose : centrage, translation, rotation
  const mf = repereConstruction(s, s.mf);
  const m = c => mesurerCote(mf, { nom: "t", axe: "y", en: [0, 0, 0], attendu: 0, tol: 1e9, ...c }).valeur;
  assert.ok(Math.abs(m({ mesure: "trou" }) - 30) < 0.05);
  assert.ok(Math.abs(m({ mesure: "diametre" }) - 40) < 0.05);
  assert.ok(Math.abs(m({ mesure: "largeur", selon: "x" }) - 30) < 0.05);
  assert.ok(Math.abs(m({ mesure: "etendue", selon: "z" }) - 40) < 0.05);
  assert.ok(Math.abs(m({ mesure: "boite", selon: "y" }) - 10) < 1e-6);
  const r = mesurerCote(mf, { nom: "t", axe: "y", en: [0, 0, 0], mesure: "trou", attendu: 30.2 });
  assert.equal(r.ok, false, "un écart de 0,2 mm est refusé");
  mf.delete(); kit.flush();
});

test("paroi : une paroi de 0,8 mm est refusée, une de 2 mm acceptée", () => {
  const fine = kit.join(kit.cyl(20, 10, 19.2)), epaisse = kit.join(kit.cyl(20, 10, 18));
  assert.equal(mesurerParoi(fine.mf, { min: 1.2 }, kit).ok, false);
  assert.equal(mesurerParoi(epaisse.mf, { min: 1.2 }, kit).ok, true);
  kit.flush();
});

test("orientation : rotations propres seulement", () => {
  assert.ok(rotationPropre([[1, 0, 0], [0, 0, -1], [0, 1, 0]]));
  assert.ok(!rotationPropre([[1, 0, 0], [0, 0, 1], [0, 1, 0]]), "déterminant −1 (miroir)");
  assert.ok(!rotationPropre([[2, 0, 0], [0, 1, 0], [0, 0, 1]]), "non orthonormée");
});

test("rangement : pièces dans le plateau, sans recouvrement", () => {
  const pcs = [{ taille: [200, 120, 10] }, { taille: [120, 100, 10] }, { taille: [60, 60, 5] }, { taille: [300, 10, 10], erreur: "hors volume" }];
  const plateaux = ranger(pcs, 3);
  for (const poses of plateaux) {
    for (const a of poses) assert.ok(a.x + a.w <= PLATEAU[0] && a.y + a.d <= PLATEAU[1]);
    for (const a of poses) for (const b of poses) if (a !== b)
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y, "recouvrement");
  }
  assert.equal(plateaux.flat().length, 9, "la pièce hors volume n'est pas rangée");
});
