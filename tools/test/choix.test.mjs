/* Evarysth — paramètre « choix » (README, « Paramètre choix ») : format des choix du catalogue, puis, sur un produit
   fictif hors catalogue (modèle tools/fixtures/essai-choix.js) : barème (grille + un point par option), prix
   (supplément par option, « Dès »), rapport et invariants des prix, combinaisons et contrôles géométriques. */
import test from "node:test";
import assert from "node:assert/strict";
import { charger, SCRIPTS_PRIX, axes, grille, pointsOptions, empreinte } from "../lib/bareme.mjs";
import { combinaisons, cotes, modele } from "../lib/moteur.mjs";
import { verifierCombinaison } from "../lib/controles.mjs";
import { rapport, invariants, valeursAxe } from "../rapport-prix.mjs";

const E = charger(SCRIPTS_PRIX);
const json = x => JSON.stringify(x);

/* Produit fictif : largeur a (mm) + plot b (choix) ; barème fictif : 3 nœuds sur a, plot « cube » par défaut */
const essai = {
  id: "essai-choix", model: "essai-choix", universe: "meubles", matiere: "pla", name: "Essai choix",
  variants: { label: "Configuration", options: [
    { label: "Simple", hint: "sans plot", values: { a: 60, b: "aucun" } },
    { label: "Cube", hint: "plot cube", values: { a: 60, b: "cube" } },
    { label: "Large", hint: "plot rond", values: { a: 100, b: "cylindre" } }] },
  impression: { matiere: "pla", orientation: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], supports: false, parPlateau: 1, remarques: "Essai" },
  custom: { params: [
    { key: "a", label: "Largeur", min: 40, max: 100, step: 1, def: 60 },
    { key: "b", label: "Plot", type: "choix", def: "cube",
      options: [{ id: "cube", label: "Cube" }, { id: "cylindre", label: "Cylindre" }, { id: "aucun", label: "Sans plot" }] }] }
};
const BAREME = { matiere: "pla", axes: { a: [40, 60, 100] }, points: [[10, 600], [12, 700], [20, 1000]],
  options: { b: { cube: [12, 700], cylindre: [11.5, 690], aucun: [10, 640] } } };
const avecEssai = () => {
  const F = charger(SCRIPTS_PRIX);
  F.products = [essai];
  F.bareme.produits[essai.id] = BAREME;
  return F;
};

test("catalogue : paramètres choix bien formés (clé d'une lettre, ≥ 2 options, ids uniques [a-z0-9-], défaut et tailles connus)", () => {
  for (const p of [...E.products, essai]) {
    for (const q of p.custom ? p.custom.params.filter(E.estChoix) : []) {
      const ids = q.options.map(o => o.id), m = `${p.id} ${q.key}`;
      assert.match(q.key, /^[a-z]$/, `${m} : clé d'une lettre (chaîne de fabrication)`);
      assert.ok(ids.length >= 2, `${m} : au moins 2 options`);
      assert.equal(new Set(ids).size, ids.length, `${m} : ids uniques`);
      for (const o of q.options) {
        assert.match(o.id, /^[a-z][a-z0-9-]{0,29}$/, `${m} : id « ${o.id} » (minuscules, chiffres, tirets)`);
        assert.ok(typeof o.label === "string" && o.label.length > 0, `${m} : libellé de ${o.id}`);
      }
      assert.ok(ids.includes(q.def), `${m} : défaut parmi les options`);
      for (const t of p.variants.options) assert.ok(ids.includes(t.values[q.key]), `${m} : taille ${t.label}`);
    }
  }
});

test("data.js : types de paramètre et libellés (texteCote, sansCote)", () => {
  const [a, b] = essai.custom.params, compte = { type: "compte", unite: ["chargeur", "chargeurs"] };
  assert.ok(E.estChoix(b) && !E.estMm(b) && !E.estCompte(b));
  assert.ok(E.estMm(a) && !E.estMm(compte));
  assert.equal(E.option(b, "aucun").label, "Sans plot");
  assert.equal(E.option(b, "x"), undefined);
  assert.equal(E.texteCote(b, "cylindre"), "Cylindre");
  assert.equal(E.texteCote(a, 60), "60 mm");
  assert.equal(E.texteCote(compte, 2), "2 chargeurs");
  assert.ok(!E.sansCote(essai));
  assert.ok(E.sansCote({ custom: { params: [b, { ...compte, key: "c" }] } }));
});

test("barème : grille sur les cotes (choix par défaut), un point par option, empreinte qui suit les options", () => {
  assert.equal(json(axes(essai)), json({ a: [40, 50, 60, 80, 100] }), "1 paramètre en mm : 5 nœuds, le choix n'est pas un axe");
  assert.equal(json(grille(essai)), json([40, 50, 60, 80, 100].map(a => ({ b: "cube", a }))));
  assert.equal(json(pointsOptions(essai)), json(["cube", "cylindre", "aucun"].map(o => ({ cle: "b", option: o, cotes: { a: 60, b: o } }))));
  const sans = { ...essai, custom: { params: [essai.custom.params[1]] } };
  assert.equal(json(axes(sans)), "{}");
  assert.equal(json(grille(sans)), json([{ b: "cube" }]), "sans cote : un seul point de grille");
  const e = empreinte(essai, E), b = essai.custom.params[1];
  const plus = { ...essai, custom: { params: [essai.custom.params[0], { ...b, options: [...b.options, { id: "sphere", label: "Sphère" }] }] } };
  assert.notEqual(empreinte(plus, E), e, "option ajoutée : barème périmé");
  assert.equal(empreinte({ ...essai, custom: { params: [essai.custom.params[0], { ...b, options: b.options.map(o => ({ ...o, label: o.label + " !" })) }] } }, E), e,
    "libellé changé : barème inchangé");
});

test("prix : grille + supplément de l'option, « Dès » au moins cher des options, option inconnue refusée", () => {
  const F = avecEssai(), est = v => Math.round(F.estimation(essai, v).cm3 * 1000) / 1000;
  assert.equal(est({ a: 60, b: "cube" }), 12);
  assert.equal(est({ a: 60, b: "aucun" }), 10);
  assert.equal(est({ a: 100, b: "aucun" }), 18, "20 + (10 − 12)");
  assert.equal(est({ a: 80, b: "cylindre" }), 15.5, "16 + (11,5 − 12)");
  assert.equal(Math.round(F.estimation(essai, { a: 100, b: "cylindre" }).temps_min * 60), 990);
  assert.equal(F.estimation(essai, { a: 60, b: "sphere" }), null);
  assert.throws(() => F.priceFor(essai, "custom", { a: 60, b: "sphere" }), /Prix indisponible/);
  const tous = ["cube", "cylindre", "aucun"].map(b => F.priceFor(essai, "custom", { a: 40, b }));
  assert.equal(F.prixDes(essai), Math.min(...tous));
  assert.equal(F.priceFor(essai, "standard", { a: 60, b: "aucun" }), F.priceFor(essai, "custom", { a: 60, b: "aucun" }));
});

test("rapport des prix : balayage de toutes les options, invariants tenus", () => {
  const F = avecEssai(), r = rapport(F), p = r.produits[0];
  assert.equal(json(valeursAxe(essai.custom.params[1])), json(["cube", "cylindre", "aucun"]));
  assert.equal(p.balayage.points, valeursAxe(essai.custom.params[0]).length * 3);
  assert.equal(p.reperes.max.cotes.b, "cube", "repères min/max : choix à leur option par défaut");
  assert.equal(json(invariants(r, F)), "[]");
});

test("géométrie : combinaisons (chaque option, cotes min et max) et contrôles du modèle", async () => {
  const cs = combinaisons(essai.custom.params);
  assert.equal(json(cs), json([
    { a: 40, b: "cube" }, { a: 60, b: "cube" }, { a: 100, b: "cube" },
    { a: 40, b: "cylindre" }, { a: 40, b: "aucun" }, { a: 100, b: "cylindre" }, { a: 100, b: "aucun" }]));
  const deux = [...essai.custom.params, { key: "c", label: "Trou", type: "choix", def: "x", options: ["x", "y", "z", "w"].map(id => ({ id, label: id })) }];
  const jeux = combinaisons(deux.slice(1));
  assert.ok(jeux.length < 3 * 4 && ["cube", "cylindre", "aucun"].every(o => jeux.some(v => v.b === o)) && ["x", "y", "z", "w"].every(o => jeux.some(v => v.c === o)),
    "chaque option contrôlée, sans le produit complet");
  assert.ok(jeux.some(v => v.b !== "cube" && v.c !== "x"), "un mélange sans option par défaut");
  assert.equal(json(cotes(essai, { valeurs: { a: "70", b: "aucun" } })), json({ a: 70, b: "aucun" }), "valeurs en ligne de commande");
  assert.equal(json(cotes(essai, { taille: "Large" })), json({ a: 100, b: "cylindre" }));
  assert.throws(() => cotes(essai, { valeurs: { b: "sphere" } }), /Option b = sphere inconnue/);
  await modele("essai-choix", "tools/fixtures/essai-choix.js");
  for (const v of cs) {
    const { erreurs, details } = await verifierCombinaison(essai, v);
    assert.equal(erreurs.join(" ; "), "", json(v));
    assert.equal(details.cotes.length, v.b === "aucun" ? 1 : 2);
  }
});
