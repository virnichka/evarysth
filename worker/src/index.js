/* Evarysth — Worker de paiement (Cloudflare Workers + Stripe Checkout)
   POST /checkout   panier du site → session Stripe Checkout → { url }
   POST /promo      vérifie un code promo Stripe → { code, rate, amount }
   GET  /session    résumé d'une commande payée (page commande/merci/)
   POST /webhook    événements Stripe signés (checkout.session.completed → Sheet back-office, e-mail client, fiche de fabrication) */
import { versionCatalogue } from "./catalogue.js";
import { ErreurPanier, lireCadeau, lirePanier, nouvelleReference, parametresSession } from "./commande.js";
import { appelStripe, ErreurStripe, verifierSignature } from "./stripe.js";
import { envoyerConfirmationClient, envoyerFiche } from "./email.js";
import { googleConfigure } from "./google.js";
import { enregistrerCommande, journaliserCreation, majCommande } from "./sheet.js";

const TAILLE_MAX = 20000;

const origines = env => (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

/* En mode test, une clé live est refusée (et inversement) : impossible d'encaisser par erreur */
function cleConforme(env) {
  const k = env.STRIPE_SECRET_KEY || "";
  return env.CHECKOUT_MODE === "live" ? /^(sk|rk)_live_/.test(k) : /^(sk|rk)_test_/.test(k);
}

function json(donnees, statut = 200, origine) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(origine ? { "Access-Control-Allow-Origin": origine, Vary: "Origin" } : {})
    }
  });
}

async function lireJson(req) {
  const texte = await req.text();
  if (texte.length > TAILLE_MAX) throw new ErreurPanier("Panier trop volumineux.");
  try { return JSON.parse(texte); } catch { throw new ErreurPanier("Requête illisible."); }
}

/* Adresse de retour : uniquement sur le site qui a fait la demande */
function adresseSurSite(valeur, origine, defaut) {
  try {
    const u = new URL(valeur);
    return u.origin === origine ? u.origin + u.pathname : defaut;
  } catch { return defaut; }
}

/* Code promo Stripe → { id, code, rate, amount } ou { erreur } (gère les deux formes de l'API) */
async function trouverPromo(env, code) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{2,40}$/.test(code)) return { erreur: "Code non reconnu." };
  const liste = await appelStripe(env, "GET", "promotion_codes", { code, limit: 1 });
  const pc = liste.data && liste.data[0];
  if (!pc) return { erreur: "Code non reconnu." };
  if (!pc.active || (pc.expires_at && pc.expires_at * 1000 < Date.now())) return { erreur: "Ce code n'est plus actif." };
  let coupon = pc.coupon || (pc.promotion && pc.promotion.coupon);
  if (typeof coupon === "string") coupon = await appelStripe(env, "GET", `coupons/${encodeURIComponent(coupon)}`);
  if (!coupon || coupon.valid === false) return { erreur: "Ce code a expiré ou a déjà été utilisé." };
  const euros = coupon.amount_off && (!coupon.currency || coupon.currency === "eur") ? coupon.amount_off / 100 : 0;
  return { id: pc.id, code: pc.code, rate: (coupon.percent_off || 0) / 100, amount: euros };
}

async function creerSession(req, env, origine) {
  const corps = await lireJson(req);
  const lignes = lirePanier(corps);
  const cadeau = lireCadeau(corps);
  let promotionCode = null;
  if (corps.promo) {
    const promo = await trouverPromo(env, corps.promo);
    if (promo.erreur) return json({ error: `${promo.erreur} Retirez le code promo du panier.` }, 400, origine);
    promotionCode = promo.id;
  }
  const base = adresseSurSite(corps.base, origine, origine + "/");
  const ref = nouvelleReference();
  const options = {
    base: base.endsWith("/") ? base : origine + "/",
    retour: adresseSurSite(corps.retour, origine, base),
    ref,
    promotionCode,
    cadeau,
    catalogue: await versionCatalogue(),
    environnement: env.CHECKOUT_MODE === "live" ? "live" : "test"
  };
  /* Case CGV obligatoire sur la page Stripe ; si le compte n'a pas d'URL de CGV (Stripe → Paramètres → Public details),
     Stripe refuse : on repasse au texte seul. CGV_STRIPE = "non" dans wrangler.toml coupe l'essai. */
  let consentement = env.CGV_STRIPE !== "non", session;
  try {
    session = await appelStripe(env, "POST", "checkout/sessions", parametresSession(lignes, { ...options, consentement }));
  } catch (e) {
    if (!(consentement && e instanceof ErreurStripe && /terms of service|consent/i.test(e.message))) throw e;
    console.warn("CGV non renseignées dans Stripe : case de consentement désactivée.", e.message);
    consentement = false;
    session = await appelStripe(env, "POST", "checkout/sessions", parametresSession(lignes, { ...options, consentement }));
  }
  return json({ url: session.url, ref, cgv: consentement ? "case" : "texte" }, 200, origine);
}

async function verifierPromo(req, env, origine) {
  const { code } = await lireJson(req);
  const promo = await trouverPromo(env, String(code || "").trim());
  /* Réponse 200 même si le code est faux : pas d'erreur réseau dans la console du client */
  if (promo.erreur) return json({ valide: false, error: promo.erreur }, 200, origine);
  return json({ valide: true, code: promo.code, rate: promo.rate, amount: promo.amount }, 200, origine);
}

async function resumeSession(url, env, origine) {
  const id = url.searchParams.get("id") || "";
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(id)) return json({ error: "Commande introuvable." }, 404, origine);
  const s = await appelStripe(env, "GET", `checkout/sessions/${id}`, { expand: ["line_items.data.price.product"] });
  if (!s.metadata || !s.metadata.ref) return json({ error: "Commande introuvable." }, 404, origine);
  const t = s.total_details || {};
  return json({
    ref: s.metadata.ref,
    statut: s.payment_status,
    environnement: s.livemode ? "live" : "test",
    total: s.amount_total / 100,
    livraison: (t.amount_shipping || 0) / 100,
    remise: (t.amount_discount || 0) / 100,
    email: s.customer_details && s.customer_details.email,
    cadeau: s.metadata.cadeau === "oui",
    message_cadeau: s.metadata.message_cadeau || "",
    lignes: ((s.line_items && s.line_items.data) || []).map(li => ({
      nom: li.description,
      detail: li.price && li.price.product && li.price.product.description,
      quantite: li.quantity,
      total: li.amount_total / 100
    }))
  }, 200, origine);
}

/* Back-office (Google Sheet) : inactif tant que GOOGLE_SA_EMAIL, GOOGLE_SA_KEY et SHEET_ID ne sont pas tous définis.
   Ajoute la commande (sans doublon), envoie au client l'e-mail « commande reçue » (une seule fois), journalise.
   Renvoie l'erreur Google éventuelle (le webhook répond alors 5xx) ; fiche.commande reçoit le n° EV-AAAA-NNNN. */
async function backOffice(env, fiche, session) {
  if (!googleConfigure(env)) {
    if (env.GOOGLE_SA_EMAIL || env.GOOGLE_SA_KEY || env.SHEET_ID) console.warn("Sheet inactif : GOOGLE_SA_EMAIL, GOOGLE_SA_KEY et SHEET_ID sont tous nécessaires.");
    return null;
  }
  try {
    const cmd = await enregistrerCommande(env, fiche, session);
    fiche.commande = cmd.numero;
    if (cmd.nouveau) {
      /* Échec de l'e-mail client : journalisé seulement (« Dernier statut notifié » reste vide) */
      try {
        if (await envoyerConfirmationClient(env, fiche, cmd)) {
          await majCommande(env, cmd.numero, { "Dernier statut notifié": cmd.statut })
            .catch(e => console.error("Sheet : Dernier statut notifié", e.message));
        }
      } catch (e) { console.error("E-mail « commande reçue »", cmd.numero, e.message); }
    }
    await journaliserCreation(env, cmd.numero, cmd.statut);
    return null;
  } catch (e) {
    console.error("Sheet", e.statut || "", e.message);
    return e;
  }
}

async function recevoirWebhook(req, env) {
  const corps = await req.text();
  if (!(await verifierSignature(corps, req.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET)))
    return json({ error: "Signature invalide." }, 400);
  const evt = JSON.parse(corps);
  if (evt.type === "checkout.session.completed") {
    const s = evt.data.object;
    const li = await appelStripe(env, "GET", `checkout/sessions/${s.id}/line_items`, { limit: 100, expand: ["data.price.product"] });
    const livraison = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
    /* Fiche de fabrication : envoyée par e-mail (Brevo) et visible dans les journaux du Worker */
    const fiche = {
      fiche: "commande",
      ref: s.metadata && s.metadata.ref,
      environnement: evt.livemode ? "live" : "test",
      paiement: s.payment_status,
      total_eur: s.amount_total / 100,
      client: s.customer_details && { nom: s.customer_details.name, email: s.customer_details.email },
      livraison: { nom: livraison.name, adresse: livraison.address },
      cadeau: s.metadata && s.metadata.cadeau === "oui" ? { emballage: true, message: s.metadata.message_cadeau || "" } : null,
      payment_intent: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent && s.payment_intent.id,
      lignes: li.data.map(l => ({
        nom: l.description, quantite: l.quantity, total: l.amount_total / 100,
        meta: (l.price && l.price.product && l.price.product.metadata) || {}
      }))
    };
    const erreurSheet = await backOffice(env, fiche, s);
    console.log(JSON.stringify(fiche));
    /* En cas d'échec, réponse 500 : Stripe renverra l'événement (rien n'est perdu) */
    try { await envoyerFiche(env, fiche); }
    catch (e) { console.error("E-mail de commande", e.message); return json({ error: "E-mail non envoyé." }, 500); }
    /* Google en erreur : la fiche est partie, mais 503 pour que Stripe renvoie l'événement (pas de doublon dans le Sheet) */
    if (erreurSheet) return json({ error: "Back-office indisponible." }, 503);
  }
  return json({ recu: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origine = req.headers.get("Origin");
    const autorisee = origine && origines(env).includes(origine) ? origine : null;

    if (req.method === "OPTIONS") {
      if (!autorisee) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": autorisee,
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin"
        }
      });
    }
    if (url.pathname === "/" && req.method === "GET")
      return json({ service: "evarysth-checkout", mode: env.CHECKOUT_MODE === "live" ? "live" : "test" });

    const route = `${req.method} ${url.pathname}`;
    const routesSite = ["POST /checkout", "POST /promo", "GET /session"];
    if (!routesSite.includes(route) && route !== "POST /webhook") return json({ error: "Introuvable." }, 404);
    if (routesSite.includes(route) && !autorisee) return json({ error: "Origine non autorisée." }, 403);
    if (!cleConforme(env)) return json({ error: "Paiement indisponible (configuration)." }, 503, autorisee);

    try {
      if (route === "POST /checkout") return await creerSession(req, env, autorisee);
      if (route === "POST /promo") return await verifierPromo(req, env, autorisee);
      if (route === "GET /session") return await resumeSession(url, env, autorisee);
      return await recevoirWebhook(req, env);
    } catch (e) {
      if (e instanceof ErreurPanier) return json({ error: e.message }, 400, autorisee);
      if (e instanceof ErreurStripe) {
        console.error("Stripe", e.statut, e.code, e.message);
        return json({ error: `Le paiement n'a pas pu être préparé : ${e.message}` }, 502, autorisee);
      }
      console.error(e);
      return json({ error: "Erreur interne." }, 500, autorisee);
    }
  }
};
