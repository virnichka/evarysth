/* Tests de la vérification manuelle /maj (tâche simulée, aucun appel réel) :
   GET affiche un formulaire, POST (champ « cle ») lance la tâche ; la clé ne passe jamais dans l'adresse. */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { routeMaj } from "../src/maj.js";

const post = cle => new Request("https://w.example/maj", {
  method: "POST", body: cle === undefined ? new URLSearchParams() : new URLSearchParams({ cle })
});
const get = (q = "") => new Request(`https://w.example/maj${q}`);
const bilan = { notifiees: ["EV-2026-0001 : envoyee_fabricant"], relances: [], attente: [], erreurs: [] };
const espion = () => { const s = { lancee: false }; s.t = async () => { s.lancee = true; return bilan; }; return s; };

test("sans ADMIN_KEY : 503, tâche non lancée", async () => {
  const s = espion();
  assert.equal((await routeMaj(post("x"), {}, s.t)).status, 503);
  assert.equal(s.lancee, false);
});

test("GET : formulaire en POST, rien n'est lancé, même avec l'ancien ?cle= (bonne clé comprise)", async () => {
  const s = espion(), env = { ADMIN_KEY: "bonne-cle" };
  const r = await routeMaj(get(), env, s.t);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<form method="post" action="\/maj">/); assert.match(html, /type="password"/);
  assert.match(r.headers.get("Content-Security-Policy"), /form-action 'self'/);
  const ancien = await routeMaj(get("?cle=bonne-cle"), env, s.t);
  assert.equal(ancien.status, 400);
  assert.match(await ancien.text(), /ne se met plus dans l(&#39;|')adresse/);
  assert.equal(s.lancee, false);
});

test("POST clé absente ou fausse : 403, tâche non lancée", async () => {
  const s = espion(), env = { ADMIN_KEY: "bonne-cle" };
  assert.equal((await routeMaj(post(), env, s.t)).status, 403);
  assert.equal((await routeMaj(post("mauvaise"), env, s.t)).status, 403);
  assert.equal((await routeMaj(post("bonne-cle-et-plus"), env, s.t)).status, 403);
  /* Corps JSON ou clé dans l'adresse : ignorés */
  const json = new Request("https://w.example/maj?cle=bonne-cle", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"cle":"bonne-cle"}' });
  assert.equal((await routeMaj(json, env, s.t)).status, 403);
  assert.equal(s.lancee, false);
});

test("POST bonne clé : lance la tâche et affiche le bilan", async () => {
  const r = await routeMaj(post("bonne-cle"), { ADMIN_KEY: "bonne-cle" }, async () => bilan);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  const html = await r.text();
  assert.match(html, /Vérification faite/); assert.match(html, /E-mails de statut envoyés : 1/); assert.match(html, /EV-2026-0001/);
});

test("Sheet inactif ou indisponible : pas de 200", async () => {
  assert.equal((await routeMaj(post("k"), { ADMIN_KEY: "k" }, async () => ({ inactive: true }))).status, 503);
  assert.equal((await routeMaj(post("k"), { ADMIN_KEY: "k" }, async () => ({ erreur: "boom" }))).status, 502);
});

test("route branchée dans le Worker (GET et POST, autres méthodes : 404)", async () => {
  assert.equal((await worker.fetch(get(), {})).status, 503);
  assert.equal((await worker.fetch(post("x"), {})).status, 503);
  assert.equal((await worker.fetch(new Request("https://w.example/maj", { method: "PUT" }), {})).status, 404);
});
