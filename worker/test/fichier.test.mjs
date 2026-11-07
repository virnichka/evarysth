/* Tests des STL standards (bloc E) : R2 simulé, aucun appel réel */
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { creerJeton } from "../src/jeton.js";
import { creerJetonFichier, liensStandards, segmentTaille, verifierJetonFichier } from "../src/fichier.js";

const OCTETS = new TextEncoder().encode("solid boite\nendsolid boite\n");
const fauxR2 = objets => ({
  async head(cle) { return objets[cle] ? { size: objets[cle].length } : null; },
  async get(cle) { return objets[cle] ? { size: objets[cle].length, body: new Blob([objets[cle]]).stream() } : null; }
});
const env = { HMAC_SECRET: "secret-de-test", STL: fauxR2({ "boite-rugged/m.stl": OCTETS, "rampe/12.zip": OCTETS }) };
const appeler = (jeton, e = env, methode = "GET") => worker.fetch(new Request(`https://w.dev/fichier/${jeton}`, { method: methode }), e);

test("segment de taille : minuscules, sans accents ni symboles", () => {
  assert.equal(segmentTaille("M"), "m");
  assert.equal(segmentTaille("Moyenne"), "moyenne");
  assert.equal(segmentTaille("Ø 12"), "12");
  assert.equal(segmentTaille("Très large"), "tres-large");
});

test("jeton valide → STL téléchargé (en-têtes de pièce jointe, non indexé)", async () => {
  const r = await appeler(await creerJetonFichier(env, { cle: "boite-rugged/m.stl" }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "model/stl");
  assert.match(r.headers.get("Content-Disposition"), /attachment; filename="boite-rugged-m\.stl"/);
  assert.match(r.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), OCTETS);
  const h = await appeler(await creerJetonFichier(env, { cle: "rampe/12.zip" }), env, "HEAD");
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("Content-Type"), "application/zip");
});

test("jeton falsifié, expiré, lien fournisseur ou objet absent → refus", async () => {
  const j = await creerJetonFichier(env, { cle: "boite-rugged/m.stl" });
  assert.equal((await appeler(j.slice(0, -3) + "xyz")).status, 403, "signature falsifiée");
  const autreCle = j.split("."); autreCle[1] = Buffer.from("boite-rugged/l.stl").toString("base64url");
  assert.equal((await appeler(autreCle.join("."))).status, 403, "clé changée");
  assert.equal((await appeler(await creerJetonFichier({ HMAC_SECRET: "autre" }, { cle: "boite-rugged/m.stl" }))).status, 403, "autre secret");
  assert.equal((await appeler(await creerJetonFichier(env, { cle: "boite-rugged/m.stl", maintenant: Date.now() - 20 * 86400_000 }))).status, 410, "expiré");
  assert.equal((await appeler(await creerJeton(env, { commande: "EV-2026-0001", action: "accepter", fabricant: "A" }))).status, 403, "lien fournisseur");
  assert.equal((await appeler("n%27importe.quoi")).status, 403);
  assert.equal((await appeler(await creerJetonFichier(env, { cle: "boite-rugged/s.stl" }))).status, 404, "objet absent");
  assert.equal((await appeler(j, env, "POST")).status, 405);
  await assert.rejects(creerJetonFichier(env, { cle: "../secret.stl" }), /invalide/);
  await assert.rejects(verifierJetonFichier(env, "fichier.x.1.y"), /invalide/);
});

test("sans binding R2 (ou sans HMAC_SECRET) : 503 propre ; aucun lien proposé", async () => {
  const j = await creerJetonFichier(env, { cle: "boite-rugged/m.stl" });
  for (const e of [{ HMAC_SECRET: "secret-de-test" }, { STL: env.STL }, {}]) {
    const r = await appeler(j, e);
    assert.equal(r.status, 503);
    assert.match(await r.text(), /indisponibles/);
    assert.equal(await liensStandards(e, "boite-rugged · M · Noir mat · ×1", "https://w.dev"), "");
  }
});

test("liens des lignes standard : sur-mesure et fichiers absents ignorés, doublons fusionnés", async () => {
  const un = await liensStandards(env, "boite-rugged · M · Noir mat · ×1", "https://w.dev");
  assert.match(un, /^https:\/\/w\.dev\/fichier\/fichier\.[^ ]+$/);
  assert.equal((await verifierJetonFichier(env, un.split("/fichier/")[1])).cle, "boite-rugged/m.stl");
  const deux = await liensStandards(env, ["boite-rugged · M · Noir mat · ×1", "boite-rugged · M · Sable · ×2", "rampe · Ø 12 · Noir mat · ×1",
    "boite-rugged · a=142 b=60 · Noir mat · ×1", "boite-rugged · L · Noir mat · ×1"].join("\n"), "https://w.dev");
  const lignes = deux.split("\n");
  assert.equal(lignes.length, 2);
  assert.match(lignes[0], /^boite-rugged M : https:\/\/w\.dev\/fichier\//);
  assert.match(lignes[1], /^rampe Ø 12 : https:\/\/w\.dev\/fichier\//);
  assert.equal(await liensStandards(env, "boite-rugged · a=142 b=60 · Noir mat · ×1", "https://w.dev"), "");
});
