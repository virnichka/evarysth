/* Lecture du panier envoyé par le site et préparation de la session Stripe Checkout.
   Le navigateur n'envoie AUCUN prix : tout est recalculé ici depuis le catalogue. */
import { EVARYSTH } from "./catalogue.js";

const LETTRES = "ABCDEFGH";
const MAX_LIGNES = 30;
const MAX_QTE = 99;
export const LIVRAISON_CENTS = 490;          /* identique à SHIPPING dans assets/js/cart.js */
export const PAYS_LIVRAISON = ["FR", "BE", "LU", "MC"];
export const URL_CGV = "https://www.evarysth.fr/cgv/";
/* Emballage cadeau : prix fixé ici, jamais lu dans la requête du navigateur (identique à GIFT dans cart.js) */
export const CADEAU_CENTS = 300;
export const MESSAGE_CADEAU_MAX = 200;

export class ErreurPanier extends Error {}

const surGrille = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-9;

export function lirePanier(corps) {
  const items = corps && corps.items;
  if (!Array.isArray(items) || !items.length) throw new ErreurPanier("Votre panier est vide.");
  if (items.length > MAX_LIGNES) throw new ErreurPanier(`Pas plus de ${MAX_LIGNES} lignes par commande.`);
  return items.map((it, i) => lireLigne(it || {}, i + 1));
}

function lireLigne(it, n) {
  const p = typeof it.id === "string" && EVARYSTH.getProduct(it.id);
  if (!p) throw new ErreurPanier(`Ligne ${n} : produit inconnu.`);
  const { qty } = it;
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTE)
    throw new ErreurPanier(`Ligne ${n} : quantité invalide (1 à ${MAX_QTE}).`);

  let values, taille = null;
  if (it.mode === "standard") {
    taille = Number.isInteger(it.variant) ? p.variants.options[it.variant] : null;
    if (!taille) throw new ErreurPanier(`Ligne ${n} : taille standard inconnue.`);
    values = { ...taille.values };
  } else if (it.mode === "custom") {
    const v = it.values && typeof it.values === "object" ? it.values : {};
    const cles = p.custom.params.map(prm => prm.key);
    if (Object.keys(v).some(k => !cles.includes(k))) throw new ErreurPanier(`Ligne ${n} : cote inconnue.`);
    values = {};
    for (const prm of p.custom.params) {
      const x = v[prm.key];
      if (typeof x !== "number" || !Number.isFinite(x) || x < prm.min || x > prm.max || !surGrille(x, prm.step))
        throw new ErreurPanier(`Ligne ${n} : « ${prm.label} » doit être comprise entre ${prm.min} et ${prm.max} mm (pas de ${prm.step} mm).`);
      values[prm.key] = x;
    }
  } else throw new ErreurPanier(`Ligne ${n} : version inconnue.`);

  const colors = p.colors || [];
  let coloris = null;
  if (colors.length) {
    coloris = colors.find(c => c.id === it.color);
    if (!coloris) throw new ErreurPanier(`Ligne ${n} : coloris inconnu.`);
  }
  const prix = EVARYSTH.priceFor(p, it.mode, values);
  return { p, mode: it.mode, taille, values, coloris, qty, unitCents: Math.round(prix * 100) };
}

/* Option cadeau : seuls `cadeau: true` et `message` sont lus ; tout autre champ (prix…) est ignoré */
export function lireCadeau(corps) {
  if (!corps || corps.cadeau !== true) return null;
  const brut = corps.message == null ? "" : corps.message;
  if (typeof brut !== "string") throw new ErreurPanier("Message cadeau illisible.");
  /* Une seule ligne, sans caractères de contrôle */
  const message = brut.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (message.length > MESSAGE_CADEAU_MAX)
    throw new ErreurPanier(`Le message cadeau ne doit pas dépasser ${MESSAGE_CADEAU_MAX} caractères.`);
  return { message };
}

/* Texte lisible par le client (page Stripe, reçu, facture) */
export function descriptionLigne(l) {
  const parts = l.mode === "custom"
    ? l.p.custom.params.map((prm, i) => `${LETTRES[i]} · ${prm.label} : ${l.values[prm.key]} mm`)
    : [`${l.p.variants.label} : ${l.taille.label} (${l.taille.hint})`];
  parts.push(l.coloris ? `Coloris : ${l.coloris.label}` : "Nylon PA12 noir mat");
  return parts.join(" · ");
}

/* Fiche de fabrication, lisible par une machine (métadonnées du produit Stripe) */
export function metaLigne(l, catalogue) {
  return {
    produit: l.p.id,
    mode: l.mode,
    ...(l.taille ? { taille: l.taille.label } : {}),
    cotes_mm: JSON.stringify(l.values),
    coloris: l.coloris ? l.coloris.id : "",
    prix_unitaire_cents: String(l.unitCents),
    catalogue
  };
}

/* Panier compact pour les métadonnées de la session (≤ 500 caractères) */
export function panierCompact(lignes) {
  const s = lignes.map(l => [
    l.p.id,
    l.mode === "custom" ? "sm" : "std",
    l.mode === "custom" ? Object.entries(l.values).map(([k, v]) => k + v).join(",") : l.taille.label,
    l.coloris ? l.coloris.id : "-",
    "x" + l.qty
  ].join(":")).join("|");
  return s.length > 500 ? s.slice(0, 497) + "…" : s;
}

export function nouvelleReference(date = new Date()) {
  const j = date.toISOString().slice(2, 10).replace(/-/g, "");
  const alea = [...crypto.getRandomValues(new Uint8Array(4))].map(b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  return `EV-${j}-${alea}`;
}

const LIGNE_CADEAU = {
  quantity: 1,
  price_data: {
    currency: "eur",
    unit_amount: CADEAU_CENTS,
    product_data: { name: "Emballage cadeau", metadata: { produit: "emballage-cadeau" } }
  }
};

export function parametresSession(lignes, { base, retour, ref, promotionCode, catalogue, environnement, cadeau = null, consentement = false }) {
  const surMesure = lignes.some(l => l.mode === "custom");
  const cgv = `[conditions générales de vente](${URL_CGV})`;
  const avertissement = surMesure ? " Les pièces sur-mesure sont fabriquées selon vos cotes : elles ne bénéficient pas du droit de rétractation (art. L221-28 3° du Code de la consommation)." : "";
  return {
    mode: "payment",
    locale: "fr",
    client_reference_id: ref,
    success_url: `${base}commande/merci/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${retour}?panier=annule`,
    line_items: lignes.map(l => ({
      quantity: l.qty,
      price_data: {
        currency: "eur",
        unit_amount: l.unitCents,
        product_data: {
          name: `${l.p.name} — ${l.mode === "custom" ? "Sur-mesure" : "Standard"}`,
          description: descriptionLigne(l),
          metadata: metaLigne(l, catalogue)
        }
      }
    })).concat(cadeau ? [LIGNE_CADEAU] : []),
    shipping_address_collection: { allowed_countries: PAYS_LIVRAISON },
    shipping_options: [{
      shipping_rate_data: {
        display_name: "Livraison suivie",
        type: "fixed_amount",
        fixed_amount: { amount: LIVRAISON_CENTS, currency: "eur" }
      }
    }],
    ...(promotionCode ? { discounts: [{ promotion_code: promotionCode }] } : { allow_promotion_codes: true }),
    invoice_creation: { enabled: true, invoice_data: { metadata: { ref } } },
    payment_intent_data: { description: `Commande ${ref}`, metadata: { ref } },
    metadata: {
      ref, panier: panierCompact(lignes), catalogue, environnement,
      cadeau: cadeau ? "oui" : "non",
      ...(cadeau && cadeau.message ? { message_cadeau: cadeau.message } : {})
    },
    /* Case « J'accepte les CGV » : seulement si l'URL des CGV est renseignée dans Stripe (sinon Stripe refuse) */
    ...(consentement ? { consent_collection: { terms_of_service: "required" } } : {}),
    custom_text: consentement
      ? {
          terms_of_service_acceptance: { message: `J'accepte les ${cgv} d'Evarysth.` },
          ...(surMesure ? { submit: { message: avertissement.trim() } } : {})
        }
      : { submit: { message: `En validant, vous acceptez nos ${cgv}.` + avertissement } }
  };
}
