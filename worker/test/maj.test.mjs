/* Tests de la vérification manuelle GET /maj (tâche simulée, aucun appel réel) */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { routeMaj } from "../src/maj.js";

const url = cle => new URL(`https://w.example/maj${cle === undefined ? "" : `?cle=${encodeURIComponent(cle)}`}`);
const bilan = { notifiees: ["EV-2026-0001 : envoyee_fabricant"], relances: [], attente: [], erreurs: [] };

test("sans ADMIN_KEY : 503, tâche non lancée", async () => {
  let lancee = false;
  const r = await routeMaj(url("x"), {}, async () => { lancee = true; return bilan; });
  assert.equal(r.status, 503); assert.equal(lancee, false);
});

test("clé absente ou fausse : 403, tâche non lancée", async () => {
  let lancee = false;
  const t = async () => { lancee = true; return bilan; };
  assert.equal((await routeMaj(url(), { ADMIN_KEY: "bonne-cle" }, t)).status, 403);
  assert.equal((await routeMaj(url("mauvaise"), { ADMIN_KEY: "bonne-cle" }, t)).status, 403);
  assert.equal(lancee, false);
});

test("bonne clé : lance la tâche et affiche le bilan", async () => {
  const r = await routeMaj(url("bonne-cle"), { ADMIN_KEY: "bonne-cle" }, async () => bilan);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  const html = await r.text();
  assert.match(html, /Vérification faite/); assert.match(html, /E-mails de statut envoyés : 1/); assert.match(html, /EV-2026-0001/);
});

test("Sheet inactif ou indisponible : pas de 200", async () => {
  assert.equal((await routeMaj(url("k"), { ADMIN_KEY: "k" }, async () => ({ inactive: true }))).status, 503);
  assert.equal((await routeMaj(url("k"), { ADMIN_KEY: "k" }, async () => ({ erreur: "boom" }))).status, 502);
});

test("route branchée dans le Worker", async () => {
  const r = await worker.fetch(new Request("https://w.example/maj?cle=x"), {});
  assert.equal(r.status, 503);
});
