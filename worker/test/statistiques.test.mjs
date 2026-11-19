/* Lecture des statistiques Umami (statistiques.js) : formats successifs de l'API, repli « path » → « url », blocs en échec */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyser, joursPeriode, liste, lireStatistiques, produitDe, totaux } from "../src/statistiques.js";

test("totaux : valeur seule ou { value, prev }", () => {
  assert.deepEqual(totaux({ pageviews: 10, visitors: 4, visits: 5, bounces: 2, totaltime: 50 }), { visiteurs: 4, visites: 5, pagesVues: 10, rebond: 0.4, duree: 10 });
  assert.deepEqual(totaux({ pageviews: { value: 10, prev: 3 }, visitors: { value: 4 }, visits: { value: 0 }, bounces: { value: 0 }, totaltime: { value: 0 } }),
    { visiteurs: 4, visites: 0, pagesVues: 10, rebond: null, duree: null });
});

test("liste : { x, y } ou { value, total }", () => {
  assert.deepEqual(liste([{ x: "a", y: 2 }, { value: "b", total: "3" }]), [{ x: "a", y: 2 }, { x: "b", y: 3 }]);
  assert.deepEqual(liste({ data: [{ name: "c", count: 1 }] }), [{ x: "c", y: 1 }]);
  assert.deepEqual(liste(null), []);
});

test("produitDe : adresse de fiche, ancienne ancre #p-", () => {
  assert.equal(produitDe("/produits/cintre-sac/"), "cintre-sac");
  assert.equal(produitDe("/produits/cintre-sac/#vue"), "cintre-sac");
  assert.equal(produitDe("/#p-crochet-balcon"), "crochet-balcon");
  assert.equal(produitDe("/catalogue/"), null);
});

test("joursPeriode : un jour de Paris par jour, bornes comprises", () => {
  const fin = Date.parse("2026-11-13T22:00:00Z");   // 23 h à Paris
  const j = joursPeriode(fin - 7 * 86400_000, fin);
  assert.equal(j.at(-1), "2026-11-13");
  assert.equal(j[0], "2026-11-06");
  assert.equal(j.length, 8);
});

test("lireStatistiques : repli sur le type « url », bloc en échec isolé, série complétée par des zéros", async () => {
  const appels = [];
  const fetchFn = async url => {
    const u = new URL(url), p = u.pathname.replace(/^\/v1\/websites\/[^/]+/, ""), t = u.searchParams.get("type");
    appels.push(p + (t ? `:${t}` : ""));
    const rep = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (p === "/metrics" && t === "path") return rep({ error: "type" }, 400);
    if (p === "/metrics" && t === "url") return rep([{ x: "/produits/cintre-sac/", y: 4 }]);
    if (p === "/stats") return rep({ pageviews: { value: 9, prev: 1 }, visitors: { value: 3 }, visits: { value: 3 }, bounces: { value: 1 }, totaltime: { value: 30 } });
    if (p === "/pageviews") return rep({ pageviews: [{ x: "2026-11-12T00:00:00Z", y: 4 }], sessions: [{ x: "2026-11-12 00:00:00", y: 2 }] });
    if (p === "/event-data/values") return rep({ error: "x" }, 500);
    return rep([]);
  };
  const maintenant = Date.parse("2026-11-13T12:00:00Z");
  const s = analyser(await lireStatistiques({ UMAMI_API_KEY: "k" }, 7, { maintenant, fetchFn }));
  assert.ok(appels.includes("/metrics:path") && appels.includes("/metrics:url"));
  assert.equal(s.courant.pagesVues, 9);
  assert.equal(s.produits.find(p => p.id === "cintre-sac").vues, 4);
  assert.equal(s.produits.find(p => p.id === "cintre-sac").paniers, null, "ajouts au panier indisponibles, pas zéro");
  assert.ok(s.erreurs.paniers.includes("500"));
  assert.equal(s.serie.length, 8);
  assert.deepEqual(s.serie.find(j => j.date === "2026-11-12"), { date: "2026-11-12", vues: 4, visites: 2 });
  assert.equal(s.serie.filter(j => j.visites).length, 1);
});
