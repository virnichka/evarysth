/* Tâche planifiée (cron toutes les 10 min). Onglet « Commandes CF » (une ligne par article) :
   1. n° de commande fournisseur : pour les articles pas encore envoyés au fabricant dont le fabricant est
      choisi, regroupe ceux d'une même commande EV et d'un même fabricant sous un n° CF-AAAA-NNNN-X (lettre stable tant
      que le groupe ne change pas ; fabricant effacé → n° effacé) ;
   2. transporteur et n° de suivi saisis sur une ligne d'une CF : recopiés sur les lignes de la même CF qui n'en ont pas ;
   3. lignes où Statut ≠ Dernier statut notifié, groupées par CF et statut : envoie l'e-mail dû (envoyee_fabricant →
      fabricant, un e-mail par CF ; expediee → client), puis seulement après un envoi réussi écrit « Dernier statut
      notifié » et journalise (une ligne par CF, auteur proprietaire s'il n'est pas déjà dans le Journal) ;
      relance au propriétaire (une seule par CF) si pas d'acceptee 48 h après l'envoi ;
   4. onglet « Commandes EV » : statut client calculé à partir des statuts de ses articles (incident, remboursee et
      annulee mis à la main ne sont jamais écrasés) et liste de ses n° CF.
   Inactive sans secrets Google ; un e-mail dont le secret manque n'est pas envoyé et la ligne attend (aucune erreur).
   Lignes retrouvées par leur clé (Commande EV + Article n°, ou n° EV), jamais par leur position. */
import { entetes, googleConfigure, lettreColonne, lireColonnes } from "./google.js";
import { creerJeton, jetonConfigure } from "./jeton.js";
import { liensStandards } from "./fichier.js";
import { EVARYSTH } from "./catalogue.js";
import { contenuExpedition, contenuFabricant, contenuRelance, envoyerEmail } from "./email.js";
import { CF, dateParis, FABRICANTS, JOURNAL, journaliser, majArticle, majCommande, ONGLET, ONGLET_CF } from "./sheet.js";

export const STATUTS = ["payee", "fichier_a_produire", "envoyee_fabricant", "acceptee", "expediee", "livree", "incident", "remboursee", "annulee"];
export const STATUTS_EV = ["payee", "en_fabrication", "partiellement_expediee", "expediee", "livree", "incident", "remboursee", "annulee"];
const MANUELS_EV = ["incident", "remboursee", "annulee"];        /* statut EV mis à la main : jamais recalculé */
const A_ENVOYER = ["payee", "fichier_a_produire"];
/* Article pas encore envoyé au fabricant (son n° CF peut encore changer) : statut d'avant l'envoi, ou e-mail
   fabricant pas encore parti (fabricant et envoyee_fabricant choisis d'un coup, avant le passage de la tâche) */
const pasEnvoye = l => A_ENVOYER.includes(l.statut) || !l.notifie || A_ENVOYER.includes(l.notifie);
export const RELANCE = "relance_48h";               /* valeur « Nouveau statut » de la ligne de Journal qui marque la relance */
export const DELAI_RELANCE_MS = 48 * 3600_000;
const URL_WORKER = "https://evarysth-checkout.virnichka.workers.dev";
const COLS_CF = [CF.num, CF.ev, CF.art, "Statut", "Article", "Fabricant", "Lien STL", "Transporteur", "N° de suivi", "Dernier statut notifié"];
const COLS_EV = ["Commande", "Statut", "Client", "Stripe session id"];
const oui = v => /^oui$/i.test(String(v || "").trim());
const repondreA = env => ({ email: env.REPLY_TO || "contact@evarysth.fr", name: "Evarysth" });
/* Article tel que le client le lit : nom du produit à la place de son identifiant */
const pourClient = a => { const [id, ...reste] = a.split(" · "); const p = EVARYSTH.getProduct(id.trim()); return [p ? p.name : id, ...reste].join(" · "); };
const estTest = (env, sid) => String(sid || "").startsWith("cs_test_") || env.CHECKOUT_MODE !== "live";

/* « AAAA-MM-JJ HH:MM » heure de Paris → ms (NaN si illisible) */
export function parisVersMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || "").trim());
  if (!m) return NaN;
  const naif = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
  const vu = dateParis(new Date(naif));                         /* même instant affiché à Paris → décalage */
  const [, a, mo, j, h, mi] = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(vu).map(Number);
  return naif - (Date.UTC(a, mo - 1, j, h, mi) - naif);
}

/* Fiche du fabricant par son nom (onglet Fabricants) */
async function lireFabricants(env) {
  const cols = await entetes(env, FABRICANTS);
  const noms = ["Nom", "E-mail", "Délai (jours)", "Livre le client"].filter(n => n in cols);
  const v = await lireColonnes(env, FABRICANTS, cols, noms);
  const fabs = {};
  (v.Nom || []).forEach((n, i) => { if (n.trim()) fabs[n.trim()] = { email: (v["E-mail"] || [])[i] || "", delai: (v["Délai (jours)"] || [])[i] || "", livre: oui((v["Livre le client"] || [])[i]) }; });
  return fabs;
}

/* Journal → par commande : lignes dans l'ordre { date, ancien, nouveau, auteur } */
async function lireJournal(env) {
  const cols = await entetes(env, JOURNAL);
  const v = await lireColonnes(env, JOURNAL, cols, ["Date", "Commande", "Ancien statut", "Nouveau statut", "Auteur"]);
  const parCommande = {};
  v.Commande.forEach((n, i) => { if (n) (parCommande[n] ||= []).push({ date: v.Date[i] || "", ancien: v["Ancien statut"][i] || "", nouveau: (v["Nouveau statut"][i] || "").trim() }); });
  return parCommande;
}

const dernierStatut = lignes => [...(lignes || [])].reverse().find(l => STATUTS.includes(l.nouveau) || STATUTS_EV.includes(l.nouveau));

/* N° CF voulus pour les articles d'une commande EV (même ordre que `lignes`) */
export function numerosCF(numeroEV, lignes) {
  const base = numeroEV.replace(/^EV-/, "CF-");
  const voulu = lignes.map(l => l.cf);
  const pris = new Set(lignes.filter(l => !pasEnvoye(l) && l.cf).map(l => l.cf));
  const groupes = new Map();
  lignes.forEach((l, i) => {
    if (!pasEnvoye(l)) return;
    const f = l.fabricant.trim();
    if (!f) { voulu[i] = ""; return; }
    if (!groupes.has(f)) groupes.set(f, []);
    groupes.get(f).push(i);
  });
  const nouveaux = [];
  for (const idx of groupes.values()) {                 /* 1er passage : un groupe inchangé garde son n° */
    const actuels = [...new Set(idx.map(i => lignes[i].cf))];
    const n = actuels[0];
    if (actuels.length === 1 && n && n.startsWith(base + "-") && !pris.has(n)) { pris.add(n); idx.forEach(i => (voulu[i] = n)); }
    else nouveaux.push(idx);
  }
  for (const idx of nouveaux) {                         /* 2e passage : 1re lettre libre */
    let k = 0;
    while (pris.has(`${base}-${lettreColonne(k)}`)) k++;
    const n = `${base}-${lettreColonne(k)}`;
    pris.add(n); idx.forEach(i => (voulu[i] = n));
  }
  return voulu;
}

/* Statut client d'une commande EV d'après les statuts de ses articles (null : aucun article) */
export function statutEV(statuts) {
  if (!statuts.length) return null;
  const s = statuts.filter(x => !["annulee", "remboursee"].includes(x));
  if (!s.length) return statuts.includes("remboursee") ? "remboursee" : "annulee";
  const parti = x => x === "expediee" || x === "livree";
  if (s.includes("incident")) return "incident";
  if (s.every(x => x === "livree")) return "livree";
  if (s.every(parti)) return "expediee";
  if (s.some(parti)) return "partiellement_expediee";
  if (s.some(x => x === "envoyee_fabricant" || x === "acceptee")) return "en_fabrication";
  return "payee";
}

/* Liens STL d'un groupe d'articles : Lien STL saisi sur la ligne, sinon fichier standard de R2 (bloc E) ;
   un seul lien → l'URL seule, sinon « produit taille : URL » par article ; aucun → "" (« fourni séparément ») */
async function liensGroupe(env, lignes, base) {
  const liens = [];
  for (const l of lignes) {
    const url = l.stl.trim() || await liensStandards(env, l.article, base).catch(e => { console.warn("R2", e.message); return ""; });
    if (url) liens.push({ nom: l.article.split(" · ").slice(0, 2).join(" "), url });
  }
  return liens.length === 1 ? liens[0].url : liens.map(x => `${x.nom} : ${x.url}`).join("\n");
}

/* E-mail dû pour un groupe (même CF, même statut). Renvoie true (envoyé ou aucun e-mail prévu), ou une raison si le groupe attend. */
async function envoyerSelonStatut(env, g, ev, tous, fabs) {
  const test = estTest(env, ev.sid);
  if (g.statut === "envoyee_fabricant") {
    if (!g.cf) return "fabricant à choisir";
    if (!env.BREVO_API_KEY || !jetonConfigure(env)) return "secret BREVO_API_KEY ou HMAC_SECRET manquant";
    const nom = g.lignes[0].fabricant.trim(), f = fabs[nom];
    if (!f || !/@/.test(f.email)) return `fabricant « ${nom || "—"} » sans e-mail dans l'onglet Fabricants`;
    const base = (env.WORKER_URL || URL_WORKER).replace(/\/+$/, "");
    const lien = async action => `${base}/f/${await creerJeton(env, { commande: g.cf, action, fabricant: nom })}`;
    const [nomClient = "", , adresse = ""] = ev.client.split("\n");
    const m = contenuFabricant({ numero: g.cf, piece: g.lignes.map(l => l.article).join("\n"), lienStl: await liensGroupe(env, g.lignes, base),
      delai: f.delai, test, livraison: f.livre ? [nomClient, adresse].filter(Boolean).join("\n") : null,
      liens: { accepter: await lien("accepter"), expedier: await lien("expedier") } });
    await envoyerEmail(env, { to: [{ email: f.email.trim(), name: nom }], replyTo: repondreA(env), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["fabricant", test ? "test" : "live"] });
  } else if (g.statut === "expediee") {
    const [nom = "", email = ""] = ev.client.split("\n");
    if (!env.BREVO_API_KEY) return "secret BREVO_API_KEY manquant";
    if (!/@/.test(email)) return true;                         /* pas d'e-mail client : rien à envoyer */
    const avec = g.lignes.find(l => l.transporteur || l.suivi) || g.lignes[0];
    const autres = tous.filter(l => !g.lignes.includes(l) && !["annulee", "remboursee"].includes(l.statut));
    const m = contenuExpedition({ numero: ev.numero, nom: nom.trim(), transporteur: avec.transporteur, suivi: avec.suivi, test,
      articles: autres.length ? g.lignes.map(l => pourClient(l.article)) : null,
      reste: autres.some(l => l.statut !== "expediee" && l.statut !== "livree") });
    await envoyerEmail(env, { to: [{ email: email.trim(), ...(nom.trim() ? { name: nom.trim() } : {}) }], replyTo: repondreA(env), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["expedition", test ? "test" : "live"] });
  }
  return true;
}

async function relancer(env, cf, fabricant, sid, journal, maintenant) {
  if (!env.BREVO_API_KEY || !env.ORDER_EMAIL) return false;
  const lignes = journal[cf] || [];
  if (lignes.some(l => l.nouveau === RELANCE)) return false;
  const envoi = [...lignes].reverse().find(l => l.nouveau === "envoyee_fabricant");
  const t = envoi ? parisVersMs(envoi.date) : NaN;
  if (!(maintenant - t >= DELAI_RELANCE_MS)) return false;
  const test = estTest(env, sid);
  const m = contenuRelance({ numero: cf, fabricant, depuis: envoi.date, test });
  await envoyerEmail(env, { to: env.ORDER_EMAIL.split(",").map(e => ({ email: e.trim() })).filter(e => e.email), subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ["relance", test ? "test" : "live"] });
  await journaliser(env, { numero: cf, ancien: "envoyee_fabricant", nouveau: RELANCE, auteur: "worker" });
  (journal[cf] ||= []).push({ date: dateParis(), nouveau: RELANCE });
  return true;
}

/* Journalise un changement de statut s'il n'est pas déjà la dernière ligne de ce n° dans le Journal */
async function journaliserSiNouveau(env, journal, numero, ancien, nouveau, auteur) {
  const dernier = dernierStatut(journal[numero]);
  if (dernier && dernier.nouveau === nouveau) return;
  await journaliser(env, { numero, ancien: dernier ? dernier.nouveau : ancien, nouveau, auteur });
  (journal[numero] ||= []).push({ date: dateParis(), ancien, nouveau });
}

/* Un passage. Renvoie un bilan { attribuees, notifiees, attente, erreurs, relances, commandes } (ou { inactive: true }). */
export async function tachePlanifiee(env, maintenant = Date.now()) {
  if (!googleConfigure(env)) return { inactive: true };
  const [colsCF, colsEV] = await Promise.all([entetes(env, ONGLET_CF), entetes(env, ONGLET)]);
  const avecListe = "Commandes CF" in colsEV;
  const [v, e, fabs, journal] = await Promise.all([
    lireColonnes(env, ONGLET_CF, colsCF, COLS_CF),
    lireColonnes(env, ONGLET, colsEV, avecListe ? [...COLS_EV, "Commandes CF"] : COLS_EV),
    lireFabricants(env), lireJournal(env)]);
  const bilan = { attribuees: [], notifiees: [], attente: [], erreurs: [], relances: [], commandes: [] };

  const evs = {};
  e.Commande.forEach((n, i) => { n = n.trim(); if (n) evs[n] = { numero: n, statut: (e.Statut[i] || "").trim(), client: e.Client[i] || "", sid: e["Stripe session id"][i] || "", liste: avecListe ? e["Commandes CF"][i] || "" : null }; });
  const lignes = v[CF.ev].map((n, i) => ({ ev: n.trim(), n: (v[CF.art][i] || "").trim(), cf: (v[CF.num][i] || "").trim(), statut: (v.Statut[i] || "").trim(),
    article: v.Article[i] || "", fabricant: v.Fabricant[i] || "", stl: v["Lien STL"][i] || "", transporteur: v.Transporteur[i] || "",
    suivi: v["N° de suivi"][i] || "", notifie: (v["Dernier statut notifié"][i] || "").trim() })).filter(l => l.ev && l.n);
  const parEV = {};
  for (const l of lignes) (parEV[l.ev] ||= []).push(l);

  /* 1. n° CF */
  for (const [numero, ls] of Object.entries(parEV)) {
    const voulu = numerosCF(numero, ls);
    for (const [i, l] of ls.entries()) {
      if (voulu[i] === l.cf) continue;
      try { await majArticle(env, numero, l.n, { [CF.num]: voulu[i] }); bilan.attribuees.push(`${numero} n° ${l.n} : ${voulu[i] || "—"}`); l.cf = voulu[i]; }
      catch (x) { bilan.erreurs.push(`${numero} n° ${l.n} : ${x.message}`); }
    }
  }

  /* 2. suivi recopié dans la CF */
  const parCF = {};
  for (const l of lignes) if (l.cf) (parCF[l.cf] ||= []).push(l);
  for (const ls of Object.values(parCF)) {
    const modele = ls.find(l => l.transporteur.trim() && l.suivi.trim());
    if (!modele) continue;
    for (const l of ls) {
      if (l.transporteur.trim() || l.suivi.trim()) continue;
      try { await majArticle(env, l.ev, l.n, { Transporteur: modele.transporteur, "N° de suivi": modele.suivi }); l.transporteur = modele.transporteur; l.suivi = modele.suivi; }
      catch (x) { bilan.erreurs.push(`${l.cf} : ${x.message}`); }
    }
  }

  /* 3. notifications, par CF et statut */
  const groupes = new Map();
  for (const l of lignes) {
    if (!STATUTS.includes(l.statut) || l.statut === l.notifie) continue;
    const cle = `${l.cf || l.ev + " n° " + l.n}|${l.statut}`;
    if (!groupes.has(cle)) groupes.set(cle, { cf: l.cf, numero: l.cf || l.ev, ev: l.ev, statut: l.statut, lignes: [] });
    groupes.get(cle).lignes.push(l);
  }
  for (const g of groupes.values()) {
    const ev = evs[g.ev] || { numero: g.ev, client: "", sid: "" };
    try {
      const r = await envoyerSelonStatut(env, g, ev, parEV[g.ev], fabs);
      if (r !== true) { bilan.attente.push(`${g.numero} : ${r}`); continue; }
      const ancien = g.lignes[0].notifie;
      for (const l of g.lignes) { await majArticle(env, l.ev, l.n, { "Dernier statut notifié": g.statut }); l.notifie = g.statut; }
      await journaliserSiNouveau(env, journal, g.numero, ancien, g.statut, "proprietaire");
      bilan.notifiees.push(`${g.numero} : ${g.statut}`);
    } catch (x) {
      bilan.erreurs.push(`${g.numero} : ${x.message}`);       /* groupe suivant quand même ; celui-ci sera retenté */
    }
  }
  for (const [cf, ls] of Object.entries(parCF)) {
    if (!ls.some(l => l.statut === "envoyee_fabricant" && l.notifie === "envoyee_fabricant")) continue;
    try { if (await relancer(env, cf, ls[0].fabricant, (evs[ls[0].ev] || {}).sid, journal, maintenant)) bilan.relances.push(cf); }
    catch (x) { bilan.erreurs.push(`${cf} : ${x.message}`); }
  }

  /* 4. commandes EV : statut client et liste des CF */
  for (const [numero, ls] of Object.entries(parEV)) {
    const c = evs[numero];
    if (!c) continue;
    const maj = {};
    const s = statutEV(ls.filter(l => STATUTS.includes(l.statut)).map(l => l.statut));
    if (s && s !== c.statut && !MANUELS_EV.includes(c.statut)) maj.Statut = s;
    const liste = [...new Set(ls.map(l => l.cf).filter(Boolean))].sort().join("\n");
    if (c.liste !== null && liste !== c.liste.trim()) maj["Commandes CF"] = liste;
    if (!Object.keys(maj).length) continue;
    try {
      await majCommande(env, numero, maj);
      if (maj.Statut) { await journaliserSiNouveau(env, journal, numero, c.statut, maj.Statut, "worker"); bilan.commandes.push(`${numero} : ${maj.Statut}`); }
    } catch (x) { bilan.erreurs.push(`${numero} : ${x.message}`); }
  }
  return bilan;
}

/* Handler `scheduled` : ne lève jamais (journaux Cloudflare seulement) */
export async function lancerTache(env) {
  try {
    const b = await tachePlanifiee(env);
    if (b.inactive) return b;
    if (b.erreurs.length) console.error("Tâche planifiée : erreurs", b.erreurs);
    if (b.attente.length) console.warn("Tâche planifiée : en attente", b.attente);
    if (b.attribuees.length || b.notifiees.length || b.relances.length || b.commandes.length)
      console.log("Tâche planifiée", { attribuees: b.attribuees, notifiees: b.notifiees, relances: b.relances, commandes: b.commandes });
    return b;
  } catch (e) {
    console.error("Tâche planifiée : Sheet indisponible", e.message);
    return { erreur: e.message };
  }
}
