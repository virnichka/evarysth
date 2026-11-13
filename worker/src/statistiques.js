/* Statistiques du site (onglet Statistiques de /admin) : lues dans Umami Cloud par son API, côté Worker.
   Secret UMAMI_API_KEY (clé d'API Umami Cloud, en-tête x-umami-api-key) ; UMAMI_WEBSITE_ID facultatif (sinon celui
   d'index.html). Chaque bloc est demandé à part : un bloc en échec n'empêche pas les autres de s'afficher.
   Résultat gardé 10 min dans le cache du Worker (une période = une entrée), pour ne pas solliciter l'API à chaque visite.
   Lecture tolérante des réponses : les formats de l'API Umami ont varié d'une version à l'autre (valeur seule ou
   { value, prev }, chemins « path » ou « url », listes { x, y } ou { value, total }). */
import { EVARYSTH } from "./catalogue.js";

export const API_UMAMI = "https://api.umami.is/v1";
export const SITE_UMAMI = "c4454d44-ccb5-4bbd-ba65-54fc78c61b5b";   // identifiant du site dans index.html
export const PERIODES = [7, 30, 90];
export const EVENEMENT_PANIER = "Ajout panier";
const CACHE_S = 600, DELAI_MS = 8000, JOUR_MS = 86400_000, TZ = "Europe/Paris";

export const umamiConfigure = env => Boolean(env.UMAMI_API_KEY);

const nombre = v => { const n = Number(v && typeof v === "object" ? v.value : v); return Number.isFinite(n) ? n : 0; };
/* Liste de mesures → [{ x, y }] quel que soit le format */
export const liste = r => (Array.isArray(r) ? r : Array.isArray(r && r.data) ? r.data : [])
  .map(o => ({ x: String(o.x ?? o.value ?? o.name ?? ""), y: nombre(o.y ?? o.total ?? o.count ?? 0) }))
  .filter(o => o.x !== "" || o.y);

/* Totaux d'une période : visiteurs, visites, pages vues, taux de rebond, durée moyenne d'une visite (s) */
export function totaux(r) {
  const o = r || {}, visites = nombre(o.visits);
  return { visiteurs: nombre(o.visitors), visites, pagesVues: nombre(o.pageviews),
    rebond: visites ? nombre(o.bounces) / visites : null, duree: visites ? nombre(o.totaltime) / visites : null };
}

/* Fiche produit visée par une adresse : /produits/<id>/ (ou l'ancien #p-<id>) */
export function produitDe(chemin) {
  const m = /\/produits\/([a-z0-9-]+)/.exec(chemin) || /#p-([a-z0-9-]+)/.exec(chemin);
  return m ? m[1] : null;
}
const sansAncre = c => String(c).split(/[?#]/)[0] || "/";

/* Jours (date de Paris AAAA-MM-JJ) de la période, du plus ancien au plus récent */
const jourParis = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
export function joursPeriode(debut, fin) {
  const jours = [];
  for (let t = debut; t <= fin; t += JOUR_MS) { const j = jourParis(t); if (jours.at(-1) !== j) jours.push(j); }
  if (jours.at(-1) !== jourParis(fin)) jours.push(jourParis(fin));
  return jours;
}

async function appel(env, chemin, params, fetchFn) {
  const id = env.UMAMI_WEBSITE_ID || SITE_UMAMI;
  const u = new URL(`${API_UMAMI}/websites/${encodeURIComponent(id)}${chemin}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetchFn(u.toString(), { headers: { "x-umami-api-key": env.UMAMI_API_KEY, Accept: "application/json" },
    signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`Umami ${r.status}${r.status === 401 || r.status === 403 ? " (clé refusée)" : ""}`);
  return r.json();
}

/* Lecture brute des blocs d'une période → objet sérialisable (mis en cache) */
export async function lireStatistiques(env, jours, { maintenant = Date.now(), fetchFn = fetch } = {}) {
  const fin = maintenant, debut = fin - jours * JOUR_MS, periode = { startAt: debut, endAt: fin };
  const get = (chemin, p = {}) => appel(env, chemin, { ...periode, ...p }, fetchFn);
  /* Type de mesure des pages : « path » (API récente) puis « url » (API plus ancienne) */
  const pagesVues = () => get("/metrics", { type: "path", limit: 500 }).catch(() => get("/metrics", { type: "url", limit: 500 }));
  const blocs = {
    courant: () => get("/stats"),
    precedent: () => appel(env, "/stats", { startAt: debut - jours * JOUR_MS, endAt: debut }, fetchFn),
    serie: () => get("/pageviews", { unit: "day", timezone: TZ }),
    pages: pagesVues,
    sources: () => get("/metrics", { type: "referrer", limit: 10 }),
    appareils: () => get("/metrics", { type: "device", limit: 10 }),
    pays: () => get("/metrics", { type: "country", limit: 8 }),
    evenements: () => get("/metrics", { type: "event", limit: 20 }),
    paniers: () => get("/event-data/values", { event: EVENEMENT_PANIER, eventName: EVENEMENT_PANIER, propertyName: "produit" }),
    actifs: () => appel(env, "/active", {}, fetchFn)
  };
  const noms = Object.keys(blocs), res = await Promise.allSettled(noms.map(n => blocs[n]()));
  const brut = {}, erreurs = {};
  res.forEach((r, i) => { if (r.status === "fulfilled") brut[noms[i]] = r.value; else erreurs[noms[i]] = String(r.reason && r.reason.message || r.reason).slice(0, 120); });
  return { jours, debut, fin, brut, erreurs };
}

/* Mise en forme : totaux et écarts, série par jour, produits (vues de fiche, ajouts au panier), sources… */
export function analyser({ jours, debut, fin, brut, erreurs }) {
  const has = k => Object.hasOwn(brut, k);
  const courant = has("courant") ? totaux(brut.courant) : null;
  const precedent = has("precedent") ? totaux(brut.precedent) : null;
  const evenements = has("evenements") ? liste(brut.evenements) : null;
  const paniers = evenements ? (evenements.find(e => e.x === EVENEMENT_PANIER) || { y: 0 }).y : null;

  let serie = null;
  if (has("serie")) {
    const parJour = (k) => { const m = new Map(); for (const o of liste(brut.serie && brut.serie[k])) m.set(o.x.slice(0, 10), (m.get(o.x.slice(0, 10)) || 0) + o.y); return m; };
    const vues = parJour("pageviews"), visites = parJour("sessions");
    serie = joursPeriode(debut, fin).map(d => ({ date: d, vues: vues.get(d) || 0, visites: visites.get(d) || 0 }));
  }

  let produits = null, pages = null;
  if (has("pages")) {
    const vues = new Map(), autres = new Map();
    for (const { x, y } of liste(brut.pages)) {
      const id = produitDe(x);
      if (id) vues.set(id, (vues.get(id) || 0) + y);
      else { const c = sansAncre(x); autres.set(c, (autres.get(c) || 0) + y); }
    }
    const ajouts = new Map(has("paniers") ? liste(brut.paniers).map(o => [o.x, o.y]) : []);
    produits = EVARYSTH.products.map(p => ({ id: p.id, nom: p.name, vues: vues.get(p.id) || 0, paniers: has("paniers") ? ajouts.get(p.id) || 0 : null }))
      .sort((a, b) => b.vues - a.vues || (b.paniers || 0) - (a.paniers || 0) || a.nom.localeCompare(b.nom, "fr"));
    pages = [...autres].map(([chemin, n]) => ({ chemin, vues: n })).sort((a, b) => b.vues - a.vues).slice(0, 8);
  }
  const top = k => (has(k) ? liste(brut[k]).sort((a, b) => b.y - a.y) : null);
  const a = brut.actifs;
  const actifs = has("actifs") ? nombre(a && typeof a === "object" ? (a.visitors ?? a.x ?? a.value) : a) : null;
  return { jours, courant, precedent, paniers, serie, produits, pages, sources: top("sources"), appareils: top("appareils"), pays: top("pays"),
    evenements, actifs, erreurs };
}

/* Lecture avec cache du Worker (10 min) ; frais = true pour forcer une nouvelle lecture */
export async function statistiques(env, jours, { frais = false, maintenant = Date.now(), fetchFn = fetch } = {}) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  const cle = new Request(`https://cache.evarysth.invalid/statistiques/${env.UMAMI_WEBSITE_ID || SITE_UMAMI}/${jours}`);
  if (cache && !frais) {
    try { const r = await cache.match(cle); if (r) { const j = await r.json(); return { ...analyser(j), lu: j.lu }; } } catch (e) { console.warn("Statistiques : cache illisible", e.message); }
  }
  const brut = await lireStatistiques(env, jours, { maintenant, fetchFn });
  brut.lu = maintenant;
  /* Rien en cache si tout a échoué (clé refusée, panne) : le prochain affichage réessaie */
  if (cache && Object.keys(brut.brut).length) {
    try { await cache.put(cle, new Response(JSON.stringify(brut), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_S}` } })); }
    catch (e) { console.warn("Statistiques : cache non écrit", e.message); }
  }
  return { ...analyser(brut), lu: brut.lu };
}
