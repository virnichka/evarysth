/* Evarysth — fichiers d'impression : marge avant, rangement sur plateaux, quantité, manifeste, 3MF non tranché. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ranger, PLATEAU, MARGE_AVANT, UTILE } from "../lib/impression.mjs";

const OUTILS = path.resolve(import.meta.dirname, "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fab-test-"));
const node = (script, args) => spawnSync(process.execPath, [path.join(OUTILS, script), ...args], { encoding: "utf8" });
const disjoints = (a, b) => a.max[0] <= b.min[0] || b.max[0] <= a.min[0] || a.max[1] <= b.min[1] || b.max[1] <= a.min[1];

test("rangement : bande avant de 10 mm laissée libre (ligne de chargement de la P2S)", () => {
  assert.ok(MARGE_AVANT >= 10);
  const pcs = [{ taille: [80, 60, 10] }, { taille: [40, 30, 5] }];
  for (const poses of ranger(pcs, 12)) for (const p of poses) {
    assert.ok(p.y >= MARGE_AVANT, `pièce à y = ${p.y}`);
    assert.ok(p.x + p.w <= PLATEAU[0] && p.y + p.d <= PLATEAU[1]);
  }
});

test("rangement : deux règles d'orientation, la moins gourmande en plateaux est gardée", () => {
  /* boite-rugged aux cotes par défaut : 2 coques de 122,8 × 158,8 côte à côte (côté long selon Y) tiennent sur 1 plateau */
  const pcs = [{ taille: [122.8, 158.8, 44] }, { taille: [122.8, 158.8, 17.8] }];
  assert.equal(ranger(pcs).length, 1);
  assert.ok(ranger(pcs)[0].every(p => p.y >= MARGE_AVANT));
});

test("rangement : pièce plus profonde que la surface utile → seule, posée à Y = 0, signalée hors_marge", () => {
  const pcs = [{ taille: [252.8, 253.8, 30] }, { taille: [20, 20, 5] }];
  const pl = ranger(pcs);
  assert.equal(pl.length, 2);
  assert.deepEqual(pl[0].map(p => [p.piece, p.y, p.hors_marge]), [[0, 0, true]]);
  assert.ok(pl[1].every(p => !p.hors_marge && p.y >= MARGE_AVANT));
  assert.equal(UTILE[1], PLATEAU[1] - MARGE_AVANT);
});

test("generer-stl --quantite=7 --coloris --cf --3mf : exemplaires sur plusieurs plateaux, manifeste enrichi, 3MF lisible", () => {
  const d = tmp();
  const r = node("generer-stl.mjs", ["passe-cable", "a=60", "--impression", "--quantite=7", "--coloris=marine", "--cf=CF-2026-0001-1", "--3mf", `--sortie=${d}`]);
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(d, "passe-cable-a60-impression.json"), "utf8"));
  assert.equal(m.cf, "CF-2026-0001-1");
  assert.equal(m.quantite, 7);
  assert.deepEqual(m.coloris, { id: "marine", label: "Bleu nuit", hex: "#2e3e5c" });
  assert.equal(m.matiere, "pla");
  assert.equal(m.jeu, 0.2);
  assert.equal(m.moteur.node, process.versions.node);
  assert.equal(m.impression.marge_avant_mm, MARGE_AVANT);
  assert.equal(m.impression.pieces.length, 2);
  assert.ok(m.impression.plateaux.length >= 2, "7 exemplaires ne tiennent pas sur un plateau");
  const toutes = m.impression.plateaux.flat();
  assert.equal(toutes.length, 14);
  for (let ex = 1; ex <= 7; ex++) assert.deepEqual(toutes.filter(p => p.exemplaire === ex).map(p => p.piece).sort(), [1, 2], `exemplaire ${ex} complet`);
  for (const ps of m.impression.plateaux) {
    for (const p of ps) {
      assert.ok(fs.existsSync(path.join(d, p.stl)));
      assert.match(p.stl, /-ex\d\.stl$/);
      assert.ok(p.boite.min[1] >= MARGE_AVANT - 0.01 && p.boite.max[0] <= PLATEAU[0] + 0.01 && p.boite.max[1] <= PLATEAU[1] + 0.01);
    }
    for (const a of ps) for (const b of ps) if (a !== b) assert.ok(disjoints(a.boite, b.boite), "recouvrement");
  }
  assert.equal(m.impression.troismf.length, m.impression.plateaux.length);
  const z = fs.readFileSync(path.join(d, m.impression.troismf[0]));
  assert.equal(z.readUInt32LE(0), 0x04034b50, "archive zip");
  const texte = z.toString("latin1");
  for (const e of ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]) assert.ok(texte.includes(e), e);
  fs.rmSync(d, { recursive: true, force: true });
});

test("generer-stl : coloris inconnu et quantité invalide refusés", () => {
  assert.notEqual(node("generer-stl.mjs", ["passe-cable", "--impression", "--coloris=rose", "--sortie=/tmp/x"]).status, 0);
  assert.notEqual(node("generer-stl.mjs", ["passe-cable", "--impression", "--quantite=0", "--sortie=/tmp/x"]).status, 0);
  assert.notEqual(node("generer-stl.mjs", ["passe-cable", "--quantite=2", "--sortie=/tmp/x"]).status, 0, "--quantite sans --impression");
});

