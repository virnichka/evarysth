/* Chaîne de fabrication (docs/chaine-fabrication.md, Fabrication · phase 2a) : génération des fichiers au paiement.
   - versionSite : SHA du site publié (version.json, écrit par pages.yml), noté dans les metadata Stripe au paiement ;
   - lancerFabrication : webhook payé → un workflow_dispatch de .github/workflows/fabrication.yml par article ;
   - routeRetour : POST /fabrication/retour, rappel du workflow signé HMAC (FABRICATION_HMAC) → colonnes du Sheet ;
   - relancerDeclenchements : tâche planifiée, nouvel essai des déclenchements en échec.
   Éteint tant que GH_ACTIONS_TOKEN ou FABRICATION_HMAC manque : rien n'est déclenché, une ligne de Journal le note,
   la commande suit son cours comme avant. Colonnes de « Commandes CF » (Génération, SHA, Masse g, Temps min,
   Plateaux, Motif génération) lues et écrites par leur nom ; absentes → ignorées, sans erreur.
   N° d'article : CF-AAAA-NNNN-<n° d'article> (numéro de la commande EV, préfixe CF, n° d'article en chiffres ; les
   n° CF fournisseur ont une LETTRE en suffixe, aucune confusion). Il est attribué au paiement, ne change jamais
   (contrairement au n° CF, qui suit le fabricant choisi) et ne contient aucune donnée client : seul identifiant passé
   à GitHub (journaux publics), avec produit, cotes, coloris, quantité et SHA. */
import { googleConfigure, entetes, lireColonnes, ecrireLigne } from "./google.js";
import { CF, ONGLET, ONGLET_CF, journaliser } from "./sheet.js";
import { appelStripe, signer } from "./stripe.js";
import { egal } from "./jeton.js";

export const DEPOT = "virnichka/evarysth", WORKFLOW = "fabrication.yml", BRANCHE = "main";
export const URL_SITE = "https://www.evarysth.fr";
export const COLS = { generation: "Génération", sha: "SHA", masse: "Masse g", temps: "Temps min", plateaux: "Plateaux", motif: "Motif génération" };
export const GEN = { attente: "a_declencher", cours: "en_cours", prete: "prete", echec: "echec" };
export const NON_CONFIGUREE = "fabrication_non_configuree";
export const ESSAIS_MAX = 6;                 /* déclenchements (1 au paiement + 5 par la tâche planifiée, toutes les 10 min) */
export const TOLERANCE_S = 300;              /* rappel signé : horodatage à ± 5 min (au-delà : rejeu refusé) */
const TAILLE_MAX = 4000;

export const fabricationConfiguree = env => Boolean(env.GH_ACTIONS_TOKEN && env.FABRICATION_HMAC);

const json = (d, statut = 200) => new Response(JSON.stringify(d), { status: statut, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/* ─── SHA du site ─────────────────────────────────────────────────────────────────────────────────────────────── */
let cacheVersion = null;
export const viderCacheVersion = () => { cacheVersion = null; };
/* SHA (40 hex) du site publié, "" si indisponible ; gardé 60 s ; ne lève jamais (le paiement n'en dépend pas) */
export async function versionSite(env, maintenant = Date.now()) {
  if (cacheVersion && maintenant - cacheVersion.t < 60_000) return cacheVersion.sha;
  let sha = "";
  try {
    const r = await fetch(`${(env.SITE_URL || URL_SITE).replace(/\/+$/, "")}/version.json`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) { const d = await r.json(); if (/^[0-9a-f]{40}$/.test((d && d.sha) || "")) sha = d.sha; }
  } catch { /* site injoignable : SHA vide, repli au webhook */ }
  cacheVersion = { t: maintenant, sha };
  return sha;
}

/* ─── N° d'article ────────────────────────────────────────────────────────────────────────────────────────────── */
export const refArticle = (numeroEV, n) => `${String(numeroEV).replace(/^EV-/, "CF-")}-${n}`;
export function lireRef(ref) {
  const m = /^CF-(\d{4})-(\d{4,})-(\d{1,3})$/.exec(String(ref || ""));
  return m ? { ev: `EV-${m[1]}-${m[2]}`, n: String(Number(m[3])) } : null;
}

/* Articles à fabriquer d'une commande (hors emballage cadeau), dans l'ordre des « Article n° » du Sheet.
   lignes : [{ quantite, meta }] (métadonnées du produit Stripe, voir commande.js metaLigne) */
export function articlesFabrication(numeroEV, lignes, sha) {
  return lignes.filter(l => (l.meta || {}).produit !== "emballage-cadeau").map((l, i) => {
    const m = l.meta || {};
    return { n: String(i + 1), inputs: { cf: refArticle(numeroEV, i + 1), produit: m.produit || "", cotes: m.cotes_mm || "{}",
      coloris: m.coloris || "", quantite: String(l.quantite || 1), sha } };
  });
}

/* ─── Déclenchement GitHub Actions ────────────────────────────────────────────────────────────────────────────── */
export class ErreurDeclenchement extends Error {}
export async function declencher(env, inputs) {
  let r;
  try {
    r = await fetch(`https://api.github.com/repos/${env.GITHUB_DEPOT || DEPOT}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GH_ACTIONS_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "evarysth-checkout", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: BRANCHE, inputs })
    });
  } catch (e) { throw new ErreurDeclenchement(`GitHub injoignable : ${e.message}`.slice(0, 120)); }
  if (r.status !== 204 && r.status !== 200) {
    let msg = ""; try { msg = ((await r.json()) || {}).message || ""; } catch { /* corps illisible */ }
    throw new ErreurDeclenchement(`GitHub ${r.status}${msg ? ` : ${msg}` : ""}`.slice(0, 160));
  }
}

/* Colonnes de suivi présentes dans « Commandes CF » (les autres sont ignorées) */
const colonnesSuivi = cols => Object.values(COLS).filter(n => n in cols);
async function ecrireSuivi(env, cols, ligne, valeurs) {
  const presentes = Object.fromEntries(Object.entries(valeurs).filter(([k]) => k in cols));
  if (Object.keys(presentes).length) await ecrireLigne(env, ONGLET_CF, cols, ligne, presentes);
}
const cellule = (lu, nom, i) => String(((lu[nom] || [])[i]) ?? "").trim();
const essaiDe = motif => Number((/essai (\d+)\//.exec(motif || "") || [])[1] || 1);

/* Un article : déclenche et renvoie les valeurs de suivi à écrire */
async function declencherArticle(env, a, essai) {
  try {
    await declencher(env, a.inputs);
    return { ok: true, valeurs: { [COLS.generation]: GEN.cours, [COLS.sha]: a.inputs.sha, [COLS.motif]: "" } };
  } catch (e) {
    console.error("Fabrication : déclenchement en échec", a.inputs.cf, e.message);
    const fin = essai >= ESSAIS_MAX;
    return { ok: false, valeurs: { [COLS.generation]: fin ? GEN.echec : GEN.attente, [COLS.sha]: a.inputs.sha,
      [COLS.motif]: fin ? `déclenchement impossible après ${ESSAIS_MAX} essais (${e.message})` : `déclenchement en échec (${e.message}), essai ${essai}/${ESSAIS_MAX}` } };
  }
}

/* Webhook payé (après le Sheet). fiche : celle du webhook (commande = n° EV, nouvelle = première réception).
   Ne lève jamais : la commande ne dépend pas de la fabrication. Renvoie un bilan (tests, journaux). */
export async function lancerFabrication(env, fiche, shaPaiement) {
  try {
    if (!fiche.commande) return { inactive: "sheet" };                 /* sans Sheet : pas de n° EV, rien à suivre */
    if (!fabricationConfiguree(env)) {
      if (fiche.nouvelle) {
        console.warn("Fabrication non configurée (GH_ACTIONS_TOKEN, FABRICATION_HMAC) : rien n'est déclenché.");
        await journaliser(env, { numero: fiche.commande, nouveau: NON_CONFIGUREE, auteur: "worker" })
          .catch(e => console.error("Journal : fabrication non configurée", e.message));
      }
      return { inactive: "configuration" };
    }
    const sha = /^[0-9a-f]{40}$/.test(shaPaiement || "") ? shaPaiement : await versionSite(env);
    const arts = articlesFabrication(fiche.commande, fiche.lignes || [], sha);
    const cols = await entetes(env, ONGLET_CF);
    const suivi = COLS.generation in cols;
    /* Sans colonne Génération : premier passage seulement (un webhook rejoué ne relance rien) */
    if (!suivi && !fiche.nouvelle) return { deja: true };
    let lu = null;
    if (suivi) lu = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art, COLS.generation]);
    const bilan = { declenches: [], ignores: [], echecs: [] };
    for (const a of arts) {
      const i = lu ? lu[CF.ev].findIndex((x, k) => x.trim() === fiche.commande && cellule(lu, CF.art, k) === a.n) : -1;
      if (lu && i >= 0 && cellule(lu, COLS.generation, i)) { bilan.ignores.push(a.inputs.cf); continue; }   /* déjà déclenché */
      if (!sha) {
        if (i >= 0) await ecrireSuivi(env, cols, i + 2, { [COLS.generation]: GEN.echec, [COLS.motif]: "SHA du site inconnu (version.json illisible)" });
        bilan.echecs.push(a.inputs.cf);
        continue;
      }
      const r = await declencherArticle(env, a, 1);
      (r.ok ? bilan.declenches : bilan.echecs).push(a.inputs.cf);
      if (i >= 0) await ecrireSuivi(env, cols, i + 2, r.valeurs);
    }
    if (bilan.declenches.length || bilan.echecs.length) console.log("Fabrication", { declenches: bilan.declenches, echecs: bilan.echecs });
    return bilan;
  } catch (e) {
    console.error("Fabrication", e.message);
    return { erreur: e.message };
  }
}

/* Tâche planifiée : nouvel essai des articles « a_declencher » (lignes Stripe relues : rien n'est recopié dans le Sheet) */
export async function relancerDeclenchements(env) {
  try {
    if (!googleConfigure(env) || !fabricationConfiguree(env)) return { inactive: true };
    const cols = await entetes(env, ONGLET_CF);
    if (!(COLS.generation in cols)) return { inactive: "colonnes" };
    const lu = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art, ...colonnesSuivi(cols)]);
    const attente = lu[CF.ev].map((ev, i) => ({ ev: ev.trim(), n: cellule(lu, CF.art, i), ligne: i + 2, motif: cellule(lu, COLS.motif, i),
      sha: cellule(lu, COLS.sha, i), gen: cellule(lu, COLS.generation, i) })).filter(l => l.ev && l.gen === GEN.attente);
    if (!attente.length) return { relances: [] };
    const colsEV = await entetes(env, ONGLET);
    const ev = await lireColonnes(env, ONGLET, colsEV, ["Commande", "Stripe session id"]);
    const sidDe = n => cellule(ev, "Stripe session id", ev.Commande.findIndex(x => x.trim() === n));
    const bilan = { relances: [], echecs: [] }, sessions = {};
    for (const l of attente) {
      try {
        const sid = sidDe(l.ev);
        if (!sid) throw new Error("session Stripe introuvable");
        sessions[sid] ??= await Promise.all([appelStripe(env, "GET", `checkout/sessions/${sid}`),
          appelStripe(env, "GET", `checkout/sessions/${sid}/line_items`, { limit: 100, expand: ["data.price.product"] })]);
        const [s, li] = sessions[sid];
        const sha = /^[0-9a-f]{40}$/.test(l.sha) ? l.sha : ((s.metadata && s.metadata.sha) || await versionSite(env));
        const lignes = li.data.map(x => ({ quantite: x.quantity, meta: (x.price && x.price.product && x.price.product.metadata) || {} }));
        const a = articlesFabrication(l.ev, lignes, sha).find(x => x.n === l.n);
        if (!a) throw new Error("article introuvable dans la commande Stripe");
        const r = await declencherArticle(env, a, essaiDe(l.motif) + 1);
        await ecrireSuivi(env, cols, l.ligne, r.valeurs);
        (r.ok ? bilan.relances : bilan.echecs).push(a.inputs.cf);
      } catch (e) {
        bilan.echecs.push(refArticle(l.ev, l.n));
        console.error("Fabrication : nouvel essai impossible", refArticle(l.ev, l.n), e.message);
      }
    }
    if (bilan.relances.length || bilan.echecs.length) console.log("Fabrication : nouveaux essais", bilan);
    return bilan;
  } catch (e) {
    console.error("Fabrication : nouveaux essais", e.message);
    return { erreur: e.message };
  }
}

/* ─── Rappel du workflow : POST /fabrication/retour ───────────────────────────────────────────────────────────── */
/* En-têtes X-Evarysth-Horodatage (secondes) et X-Evarysth-Signature = hex(HMAC-SHA256(FABRICATION_HMAC, ts + "." + corps)).
   Signature comparée en temps constant ; horodatage à ± 5 min (rejeu refusé) ; 401 sinon. */
export async function verifierRappel(corps, ts, sig, secret, maintenant = Date.now() / 1000) {
  if (!secret || !/^\d{9,11}$/.test(ts || "") || !/^[0-9a-f]{64}$/.test(sig || "")) return false;
  if (Math.abs(maintenant - Number(ts)) > TOLERANCE_S) return false;
  return egal(await signer(secret, `${ts}.${corps}`), sig);
}

const nombre = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? "" : Number(v));
export async function routeRetour(req, env, maintenant = Date.now() / 1000) {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  if (!env.FABRICATION_HMAC) return json({ error: "Fabrication non configurée." }, 503);
  const corps = await req.text();
  if (corps.length > TAILLE_MAX) return json({ error: "Requête trop volumineuse." }, 413);
  if (!(await verifierRappel(corps, req.headers.get("X-Evarysth-Horodatage"), req.headers.get("X-Evarysth-Signature"), env.FABRICATION_HMAC, maintenant)))
    return json({ error: "Signature invalide." }, 401);
  let b;
  try { b = JSON.parse(corps); } catch { return json({ error: "Requête illisible." }, 400); }
  const ref = lireRef(b.cf);
  if (!ref || ![GEN.prete, GEN.echec].includes(b.statut) || !/^[0-9a-f]{40}$/.test(b.sha || "")) return json({ error: "Rappel invalide." }, 400);
  console.log("Fabrication : rappel", { cf: b.cf, statut: b.statut, plateaux: b.plateaux ?? null });
  if (!googleConfigure(env)) return json({ recu: true, sheet: false }, 202);
  const cols = await entetes(env, ONGLET_CF);
  if (!(COLS.generation in cols)) return json({ recu: true, colonnes: false });
  const lu = await lireColonnes(env, ONGLET_CF, cols, [CF.ev, CF.art, ...colonnesSuivi(cols)]);
  const i = lu[CF.ev].findIndex((x, k) => x.trim() === ref.ev && cellule(lu, CF.art, k) === ref.n);
  if (i < 0) return json({ error: "Article introuvable." }, 404);
  const shaLigne = cellule(lu, COLS.sha, i);
  /* Fichiers figés au SHA du paiement : le rappel d'un run à un autre SHA ne remplace pas le suivi en cours */
  if (shaLigne && shaLigne !== b.sha) return json({ error: "SHA différent de celui de l'article.", sha: shaLigne.slice(0, 12) }, 409);
  await ecrireSuivi(env, cols, i + 2, {
    [COLS.generation]: b.statut, [COLS.sha]: b.sha, [COLS.masse]: nombre(b.masse_g), [COLS.temps]: nombre(b.temps_min),
    [COLS.plateaux]: nombre(b.plateaux), [COLS.motif]: String(b.motif || "").slice(0, 300)
  });
  return json({ recu: true });
}
