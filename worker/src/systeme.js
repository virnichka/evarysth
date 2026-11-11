/* Entretien du système, sans commande ni e-mail (tâche planifiée du Worker, pilotage depuis /admin → Système) :
   - maintien de la clé Brevo : un appel en lecture par jour (la clé expire après 90 jours sans appel) ;
   - sauvegarde hebdomadaire du Sheet dans R2 (sauvegardes/evarysth-AAAA-MM-JJ.zip, 12 semaines gardées) ;
   - frais Stripe des commandes récentes renseignés dans le Sheet s'ils manquent (finances.js) ;
   - pause des ventes : interrupteur lu par POST /checkout (refus avec message), sans toucher au webhook (un paiement en
     cours est toujours enregistré).
   Les états tiennent dans R2 (systeme/*.json), sans onglet ni secret en plus. Sans binding R2, tout reste inactif. */
import { appelSheets, googleConfigure } from "./google.js";
import { dateParis } from "./sheet.js";
import { zipStocke } from "./zip.js";
import { completerFrais } from "./finances.js";

export const CLES = { brevo: "systeme/brevo.json", sauvegarde: "systeme/sauvegarde.json", pause: "systeme/pause.json" };
export const PERIODE_BREVO_MS = 24 * 3600_000, PERIODE_SAUVEGARDE_MS = 7 * 24 * 3600_000, REESSAI_MS = 3600_000;
export const SAUVEGARDES_GARDEES = 12;
export const MESSAGE_PAUSE = "Les commandes sont momentanément fermées. Votre panier est conservé sur cet appareil : revenez dans quelques jours.";

const bucket = env => (env.STL && typeof env.STL.get === "function" && typeof env.STL.put === "function" ? env.STL : null);
export const r2Disponible = env => Boolean(bucket(env));

export async function lireEtatR2(env, cle) {
  const b = bucket(env);
  if (!b) return null;
  try { const o = await b.get(cle); return o ? JSON.parse(await o.text()) : null; }
  catch (e) { console.warn("R2 : état illisible", cle, e.message); return null; }
}
export async function ecrireEtatR2(env, cle, valeur) {
  const b = bucket(env);
  if (!b) return false;
  await b.put(cle, JSON.stringify(valeur), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return true;
}

/* ── Clé Brevo ─────────────────────────────────────────────────────────────────────────────────────────────── */
/* Un appel en lecture (GET /v3/account) par jour, nouvel essai toutes les heures après un échec.
   forcer (bouton « Lancer la tâche maintenant » de /admin) : appel fait même si le dernier date de moins de 24 h / 1 h.
   Renvoie { inactif } | { saute } | { ok, detail }. */
export async function maintenirBrevo(env, maintenant = Date.now(), { forcer = false } = {}) {
  if (!env.BREVO_API_KEY || !bucket(env)) return { inactif: true };
  const e = await lireEtatR2(env, CLES.brevo);
  if (e && !forcer && maintenant - e.t < (e.ok ? PERIODE_BREVO_MS : REESSAI_MS)) return { saute: true };
  let ok = false, detail = "";
  try {
    const r = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": env.BREVO_API_KEY, Accept: "application/json" } });
    ok = r.ok;
    if (!ok) {
      /* Message de Brevo gardé : il distingue une clé invalide (401) d'un appel refusé (403 : IP non autorisée, droits…) */
      const m = await r.json().then(j => String(j.message || j.code || ""), () => "");
      detail = r.status === 401 ? "clé refusée (HTTP 401)" : r.status === 403 ? "appel refusé (HTTP 403)" : `HTTP ${r.status}`;
      if (m) detail += ` — Brevo : « ${m.replace(/\s+/g, " ").slice(0, 200)} »`;
    }
  } catch (x) { detail = "réseau injoignable"; }
  await ecrireEtatR2(env, CLES.brevo, { t: maintenant, ok, detail }).catch(x => console.warn("Brevo : état non noté", x.message));
  if (!ok) console.error("Brevo : appel de maintien en échec", detail);
  return { ok, detail };
}

/* ── Sauvegarde du Sheet ───────────────────────────────────────────────────────────────────────────────────── */
/* CSV lisible par Excel et Sheets (UTF-8 avec BOM, guillemets doublés, retours à la ligne gardés dans les cellules) */
export function enCsv(lignes) {
  const cell = c => { const s = String(c ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + lignes.map(l => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
export const nomFichier = titre => String(titre).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "onglet";

/* Une seule archive par sauvegarde (peu d'appels R2 : la tâche planifiée a un nombre d'appels limité par passage) */
const cleSauvegarde = date => `sauvegardes/evarysth-${date}.zip`;
async function elaguer(b, gardees) {
  const l = await b.list({ prefix: "sauvegardes/", limit: 1000 });
  const cles = (l.objects || []).map(o => o.key).sort();
  for (const k of cles.slice(0, Math.max(0, cles.length - gardees))) await b.delete(k);
}

/* Archive ZIP (une sauvegarde) : un CSV par onglet (valeurs affichées), formules des 3 premières lignes (en-têtes à
   formule), manifeste ; puis élagage (12 gardées). `force` : à la demande depuis /admin.
   Renvoie { inactif } | { saute } | état { ok, cle, onglets, lignes, t, tOk } (ne lève jamais). */
export async function sauvegarderSheet(env, { maintenant = Date.now(), force = false } = {}) {
  const b = bucket(env);
  if (!b || !googleConfigure(env)) return { inactif: true };
  const e = await lireEtatR2(env, CLES.sauvegarde);
  if (!force && e) {
    if (e.ok && e.tOk && maintenant - e.tOk < PERIODE_SAUVEGARDE_MS) return { saute: true };
    if (!e.ok && maintenant - e.t < REESSAI_MS) return { saute: true };
  }
  try {
    const meta = await appelSheets(env, "GET", "", { fields: "sheets.properties.title" });
    const titres = (meta.sheets || []).map(s => s.properties.title);
    if (!titres.length) throw new Error("classeur sans onglet");
    const quote = t => `'${t.replace(/'/g, "''")}'`;
    const valeurs = await appelSheets(env, "GET", "values:batchGet", { ranges: titres.map(quote), majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
    const formules = await appelSheets(env, "GET", "values:batchGet", { ranges: titres.map(t => `${quote(t)}!1:3`), majorDimension: "ROWS", valueRenderOption: "FORMULA" });
    const enc = new TextEncoder(), date = dateParis(new Date(maintenant));
    const fichiers = [], onglets = [];
    for (const [i, titre] of titres.entries()) {
      const lignes = (valeurs.valueRanges && valeurs.valueRanges[i] && valeurs.valueRanges[i].values) || [];
      fichiers.push({ nom: `${nomFichier(titre)}.csv`, octets: enc.encode(enCsv(lignes)) });
      onglets.push({ titre, fichier: `${nomFichier(titre)}.csv`, lignes: lignes.length });
    }
    const f = Object.fromEntries(titres.map((t, i) => [t, (formules.valueRanges && formules.valueRanges[i] && formules.valueRanges[i].values) || []]));
    fichiers.push({ nom: "formules-en-tetes.json", octets: enc.encode(JSON.stringify(f, null, 1)) });
    fichiers.push({ nom: "manifeste.json", octets: enc.encode(JSON.stringify({ date, onglets }, null, 1)) });
    const cle = cleSauvegarde(date.slice(0, 10));
    await b.put(cle, zipStocke(fichiers), { httpMetadata: { contentType: "application/zip" } });
    await elaguer(b, SAUVEGARDES_GARDEES).catch(x => console.warn("Sauvegarde : élagage", x.message));
    const etat = { t: maintenant, tOk: maintenant, ok: true, cle, onglets: onglets.length, lignes: onglets.reduce((n, o) => n + o.lignes, 0) };
    await ecrireEtatR2(env, CLES.sauvegarde, etat);
    return etat;
  } catch (x) {
    console.error("Sauvegarde du Sheet en échec", x.message);
    const etat = { ...(e || {}), t: maintenant, ok: false, detail: String(x.message).slice(0, 160) };
    await ecrireEtatR2(env, CLES.sauvegarde, etat).catch(() => {});
    return etat;
  }
}

/* Dernière sauvegarde réussie (téléchargement depuis /admin) : { nom, octets } ou null */
export async function derniereSauvegardeZip(env) {
  const b = bucket(env), e = await lireEtatR2(env, CLES.sauvegarde);
  if (!b || !e || !e.cle) return null;
  const o = await b.get(e.cle);
  return o ? { nom: e.cle.slice("sauvegardes/".length), octets: new Uint8Array(await o.arrayBuffer()) } : null;
}

/* ── Pause des ventes ──────────────────────────────────────────────────────────────────────────────────────── */
/* { active, message, depuis } ; illisible ou R2 absent → ventes ouvertes (jamais de blocage par erreur technique) */
export async function lirePause(env) {
  const e = await lireEtatR2(env, CLES.pause);
  return e && e.active ? { active: true, message: String(e.message || "").trim() || MESSAGE_PAUSE, depuis: e.depuis || "" } : { active: false, message: "", depuis: "" };
}
export async function reglerPause(env, { active, message = "" }) {
  const etat = active ? { active: true, message: String(message).trim().slice(0, 240), depuis: dateParis() } : { active: false, depuis: dateParis() };
  if (!await ecrireEtatR2(env, CLES.pause, etat)) throw new Error("R2 indisponible : la pause ne peut pas être enregistrée.");
  return etat;
}

/* Passage de la tâche planifiée : ne lève jamais */
export async function entretien(env, maintenant = Date.now(), { forcerBrevo = false } = {}) {
  const bilan = {};
  try { bilan.brevo = await maintenirBrevo(env, maintenant, { forcer: forcerBrevo }); } catch (e) { console.error("Entretien : Brevo", e.message); }
  try { bilan.sauvegarde = await sauvegarderSheet(env, { maintenant }); } catch (e) { console.error("Entretien : sauvegarde", e.message); }
  if (googleConfigure(env)) { try { bilan.frais = await completerFrais(env, maintenant); } catch (e) { console.error("Entretien : frais Stripe", e.message); } }
  return bilan;
}
