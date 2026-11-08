/* E-mail « Nouvelle commande » envoyé au vendeur par l'API Brevo (transactionnel).
   Secrets Cloudflare : BREVO_API_KEY, ORDER_EMAIL (destinataire : jamais dans le dépôt, il est public).
   Variables : EMAIL_FROM (expéditeur authentifié dans Brevo), REPLY_TO (réponse par défaut si le client n'a pas d'e-mail). */
import { EVARYSTH } from "./catalogue.js";

const LETTRES = "ABCDEFGH";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = n => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/* Une ligne de la fiche, lisible par l'atelier : cotes avec leurs libellés du catalogue */
export function ligneLisible(l) {
  const m = l.meta || {};
  const p = m.produit && EVARYSTH.getProduct(m.produit);
  let cotes = [];
  try {
    const v = JSON.parse(m.cotes_mm || "{}");
    cotes = Object.entries(v).map(([k, x]) => {
      const i = p ? p.custom.params.findIndex(prm => prm.key === k) : -1;
      return i >= 0 ? `${LETTRES[i]} · ${p.custom.params[i].label} : ${x} mm` : `${k} : ${x} mm`;
    });
  } catch { /* métadonnées absentes ou anciennes */ }
  const col = p && (p.colors || []).find(c => c.id === m.coloris);
  return {
    nom: l.nom,
    quantite: l.quantite,
    total: l.total,
    version: m.mode === "custom" ? "Sur-mesure" : m.mode === "standard" ? `Standard${m.taille ? " — " + m.taille : ""}` : "",
    cotes,
    coloris: col ? col.label : m.coloris || ""
  };
}

export function sujet(f) {
  return `${f.environnement === "test" ? "[TEST] " : ""}${f.attente ? "[PAIEMENT EN ATTENTE] " : ""}Nouvelle commande ${f.ref} — ${eur(f.total_eur)}`;
}

export function contenu(f) {
  const lignes = f.lignes.map(ligneLisible);
  const a = (f.livraison && f.livraison.adresse) || {};
  const adresse = [f.livraison && f.livraison.nom, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean);
  const stripe = f.payment_intent ? `https://dashboard.stripe.com/${f.environnement === "test" ? "test/" : ""}payments/${f.payment_intent}` : "";

  const texte = [
    sujet(f), "",
    f.attente ? "Paiement pas encore confirmé par Stripe : ne pas fabriquer. La commande sera ajoutée au back-office à la confirmation du paiement.\n" : "",
    f.commande ? `Back-office : ${f.commande}` : "",
    ...lignes.flatMap(l => [`• ${l.nom} × ${l.quantite} (${eur(l.total)})`, ...[l.version, ...l.cotes, l.coloris && `Coloris : ${l.coloris}`].filter(Boolean).map(x => "    " + x)]),
    "",
    f.cadeau ? `Emballage cadeau : oui${f.cadeau.message ? `\nMessage à joindre : « ${f.cadeau.message} »` : ""}` : "Emballage cadeau : non",
    "",
    "Livraison :", ...adresse.map(x => "  " + x),
    "",
    `Client : ${(f.client && f.client.nom) || "—"} <${(f.client && f.client.email) || "—"}>`,
    `Total payé : ${eur(f.total_eur)} (paiement : ${f.paiement})`,
    stripe && `Stripe : ${stripe}`
  ].filter(x => x !== "").join("\n").replace(/\n(?=Emballage|Livraison|Client)/g, "\n\n");

  const td = 'style="padding:10px 0;border-bottom:1px solid #e4dfd4;vertical-align:top"';
  const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f1ea;font:15px/1.5 Arial,sans-serif;color:#1a1a18">
<div style="max-width:600px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 4px">${f.environnement === "test" ? '<span style="color:#b42318">[TEST]</span> ' : ""}Nouvelle commande ${esc(f.ref)}</h1>
${f.attente ? '<p style="margin:0 0 8px;color:#b42318"><b>Paiement pas encore confirmé par Stripe : ne pas fabriquer.</b> La commande sera ajoutée au back-office à la confirmation du paiement.</p>' : ""}
${f.commande ? `<p style="margin:0 0 4px;color:#5c5a52">Back-office : <b>${esc(f.commande)}</b></p>` : ""}
<p style="margin:0 0 16px;color:#5c5a52">Total payé : <b>${esc(eur(f.total_eur))}</b> · paiement : ${esc(f.paiement)}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e4dfd4">${lignes.map(l => `<tr>
<td ${td}><b>${esc(l.nom)}</b> × ${esc(l.quantite)}<br><span style="color:#5c5a52;font-size:14px">${[l.version, ...l.cotes, l.coloris && "Coloris : " + l.coloris].filter(Boolean).map(esc).join("<br>")}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #e4dfd4;white-space:nowrap;vertical-align:top">${esc(eur(l.total))}</td></tr>`).join("")}</table>
<p style="margin:16px 0"><b>Emballage cadeau :</b> ${f.cadeau ? "oui" + (f.cadeau.message ? `<br>Message à joindre : « ${esc(f.cadeau.message)} »` : "") : "non"}</p>
<p style="margin:16px 0"><b>Livraison</b><br>${adresse.map(esc).join("<br>") || "—"}</p>
<p style="margin:16px 0"><b>Client</b><br>${esc((f.client && f.client.nom) || "—")}<br>${esc((f.client && f.client.email) || "—")}</p>
${stripe ? `<p style="margin:16px 0"><a href="${esc(stripe)}" style="color:#ff5a1f">Voir le paiement dans Stripe</a></p>` : ""}
</div></body></html>`;
  return { texte, html };
}

/* Envoi ; renvoie false (sans erreur) si la configuration manque, lève une erreur si Brevo refuse */
export async function envoyerFiche(env, f) {
  if (!env.BREVO_API_KEY || !env.ORDER_EMAIL) {
    console.warn("E-mail de commande non envoyé : secret BREVO_API_KEY ou ORDER_EMAIL manquant.");
    return false;
  }
  const { texte, html } = contenu(f);
  await envoyerBrevo(env, {
    to: env.ORDER_EMAIL.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
    // Répondre écrit au client ; sans e-mail client, à l'adresse de contact publique
    replyTo: f.client && f.client.email
      ? { email: f.client.email, ...(f.client.nom ? { name: f.client.nom } : {}) }
      : { email: env.REPLY_TO || "contact@evarysth.fr", name: "Evarysth" },
    subject: sujet(f),
    htmlContent: html,
    textContent: texte,
    tags: ["commande", f.environnement]
  });
  return true;
}

async function envoyerBrevo(env, message) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Evarysth", email: env.EMAIL_FROM || "commandes@evarysth.fr" }, ...message })
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 300)}`);
}

/* E-mail client « commande reçue » (n° du back-office), envoyé une seule fois, à l'ajout de la commande au Sheet */
export function contenuClient(f, { numero, type }) {
  const lignes = f.lignes.map(ligneLisible);
  const nom = (f.client && f.client.nom) || "";
  const suite = type === "sur-mesure"
    ? "Votre pièce est fabriquée à vos cotes : nous préparons son fichier, puis elle part en fabrication. Nous vous écrirons à son expédition."
    : "Elle part en fabrication ; nous vous écrirons à son expédition.";
  const sujetClient = `${f.environnement === "test" ? "[TEST] " : ""}Commande ${numero} reçue — Evarysth`;
  const texte = [
    `Bonjour${nom ? " " + nom : ""},`, "",
    `Merci pour votre commande ${numero} : elle est bien reçue et payée.`, suite, "",
    ...lignes.map(l => `• ${l.nom} × ${l.quantite} (${eur(l.total)})${[l.version, ...l.cotes, l.coloris && "Coloris : " + l.coloris].filter(Boolean).map(x => "\n    " + x).join("")}`),
    "", `Total payé : ${eur(f.total_eur)}`, "",
    "Une question ? Répondez simplement à cet e-mail en rappelant votre n° de commande.", "", "Evarysth"
  ].join("\n");
  const html = `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f1ea;font:15px/1.5 Arial,sans-serif;color:#1a1a18">
<div style="max-width:600px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${f.environnement === "test" ? '<span style="color:#b42318">[TEST]</span> ' : ""}Commande ${esc(numero)} reçue</h1>
<p style="margin:0 0 8px">Bonjour${nom ? " " + esc(nom) : ""},</p>
<p style="margin:0 0 16px">Merci pour votre commande <b>${esc(numero)}</b> : elle est bien reçue et payée. ${esc(suite)}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e4dfd4">${lignes.map(l => `<tr>
<td style="padding:10px 0;border-bottom:1px solid #e4dfd4;vertical-align:top"><b>${esc(l.nom)}</b> × ${esc(l.quantite)}<br><span style="color:#5c5a52;font-size:14px">${[l.version, ...l.cotes, l.coloris && "Coloris : " + l.coloris].filter(Boolean).map(esc).join("<br>")}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid #e4dfd4;white-space:nowrap;vertical-align:top">${esc(eur(l.total))}</td></tr>`).join("")}</table>
<p style="margin:16px 0">Total payé : <b>${esc(eur(f.total_eur))}</b></p>
<p style="margin:16px 0;color:#5c5a52">Une question ? Répondez simplement à cet e-mail en rappelant votre n° de commande.</p>
<p style="margin:16px 0">Evarysth</p>
</div></body></html>`;
  return { sujet: sujetClient, texte, html };
}

/* Renvoie false (sans erreur) si la clé Brevo ou l'e-mail du client manque ; lève une erreur si Brevo refuse */
export async function envoyerConfirmationClient(env, f, commande) {
  const email = f.client && f.client.email;
  if (!env.BREVO_API_KEY || !email) {
    console.warn("E-mail « commande reçue » non envoyé : clé Brevo ou e-mail client manquant.");
    return false;
  }
  const { sujet: objet, texte, html } = contenuClient(f, commande);
  await envoyerBrevo(env, {
    to: [{ email, ...(f.client.nom ? { name: f.client.nom } : {}) }],
    replyTo: { email: env.REPLY_TO || "contact@evarysth.fr", name: "Evarysth" },
    subject: objet,
    htmlContent: html,
    textContent: texte,
    tags: ["commande-recue", f.environnement]
  });
  return true;
}

/* ——— Bloc D : e-mails envoyés par la tâche planifiée selon le statut (planifie.js) ——— */
export const envoyerEmail = envoyerBrevo;
const prefixe = test => (test ? "[TEST] " : "");
const page = (titre, paragraphes) => `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#f4f1ea;font:15px/1.5 Arial,sans-serif;color:#1a1a18">
<div style="max-width:600px;margin:0 auto;padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${esc(titre)}</h1>
${paragraphes.map(p => (p.lien ? `<p style="margin:16px 0"><a href="${esc(p.lien)}" style="display:inline-block;background:#1a1a18;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(p.texte)}</a></p>`
    : `<p style="margin:0 0 12px;white-space:pre-line">${esc(p)}</p>`)).join("\n")}
</div></body></html>`;
const texteBrut = paragraphes => paragraphes.map(p => (p.lien ? `${p.texte} : ${p.lien}` : p)).join("\n\n");

/* Fabricant : commande à fabriquer. `livraison` (nom + adresse) seulement s'il livre le client lui-même. */
export function contenuFabricant({ numero, piece, lienStl, delai, livraison, liens, test }) {
  const titre = `${prefixe(test)}Commande ${numero} à fabriquer`;
  const p = [
    "Bonjour,",
    `Voici une nouvelle commande Evarysth à fabriquer : ${numero}.`,
    `Pièces (produit · taille ou cotes en mm · coloris · quantité) :\n${piece || "—"}`,
    `Fichier STL : ${lienStl || "fourni séparément"}`,
    ...(delai ? [`Délai convenu : ${delai} jours.`] : []),
    livraison ? `À expédier directement au client :\n${livraison}` : "Pièce à nous renvoyer (vous ne livrez pas le client directement).",
    "Merci de confirmer la prise en charge, puis l'expédition, avec les boutons ci-dessous (liens valables 14 jours) :",
    { texte: "J'accepte la commande", lien: liens.accepter },
    { texte: "Déclarer l'expédition", lien: liens.expedier },
    ...(liens.refuser ? ["Vous ne pouvez pas la fabriquer (délai, matière, machine indisponible…) ? Dites-le-nous, nous la confierons à un autre atelier :",
      { texte: "Je ne peux pas la fabriquer", lien: liens.refuser }] : []),
    "Une question ? Répondez à cet e-mail en rappelant le n° de commande.", "Evarysth"
  ];
  return { sujet: titre, texte: texteBrut(p), html: page(titre, p) };
}

/* Client : commande expédiée, avec transporteur et n° de suivi */
/* Client : un colis est parti. articles = contenu du colis quand la commande en compte plusieurs (sinon null) ;
   reste = d'autres articles de la commande ne sont pas encore partis. */
export function contenuExpedition({ numero, nom, transporteur, suivi, test, articles = null, reste = false }) {
  const titre = `${prefixe(test)}Commande ${numero} ${reste ? "en partie expédiée" : "expédiée"} — Evarysth`;
  const p = [
    `Bonjour${nom ? " " + nom : ""},`,
    articles
      ? `Un colis de votre commande ${numero} vient d'être expédié :\n${articles.map(a => "• " + a).join("\n")}`
      : `Votre commande ${numero} vient d'être expédiée.`,
    ...(articles ? [reste
      ? "Le reste de la commande est fabriqué séparément et vous sera envoyé dans un autre colis : vous recevrez un e-mail à son expédition."
      : "Votre commande est expédiée en plusieurs colis : avec celui-ci, elle est entièrement en route."] : []),
    `Transporteur : ${transporteur || "—"}\nN° de suivi : ${suivi || "—"}`,
    "Une question ? Répondez simplement à cet e-mail en rappelant votre n° de commande.", "Evarysth"
  ];
  return { sujet: titre, texte: texteBrut(p), html: page(titre, p) };
}

/* Propriétaire : pas d'acceptation du fabricant 48 h après l'envoi */
export function contenuRelance({ numero, fabricant, depuis, test }) {
  const titre = `${prefixe(test)}Relance : ${numero} pas encore acceptée`;
  const p = [
    `La commande ${numero} a été envoyée au fabricant ${fabricant || "—"} le ${depuis} (heure de Paris) et n'est toujours pas acceptée.`,
    "À vérifier avec lui. Pour changer de fabricant : dans /admin, ouvrir la commande, pli de cette commande fournisseur, « Retirer au fabricant » (il est prévenu, ses liens ne fonctionnent plus), puis valider avec un autre fabricant. Cette relance n'est envoyée qu'une fois par commande fournisseur."
  ];
  return { sujet: titre, texte: texteBrut(p), html: page(titre, p) };
}

/* Propriétaire : le fabricant a refusé une commande fournisseur ; ses articles sont de nouveau à valider */
export function contenuRefus({ numero, fabricant, motif, piece, lien, test }) {
  const titre = `${prefixe(test)}Refus : ${numero} à confier à un autre fabricant`;
  const p = [
    `Le fabricant ${fabricant || "—"} ne peut pas fabriquer la commande ${numero}.`,
    `Motif : ${motif || "non précisé"}`,
    `Pièces :\n${piece || "—"}`,
    "Les articles sont de nouveau « à valider » : choisissez un autre fabricant (ses anciens liens ne fonctionnent plus).",
    ...(lien ? [{ texte: "Ouvrir la commande", lien }] : [])
  ];
  return { sujet: titre, texte: texteBrut(p), html: page(titre, p) };
}

/* Fabricant : commande fournisseur retirée par le propriétaire */
export function contenuRetrait({ numero, piece, motif, test }) {
  const titre = `${prefixe(test)}Commande ${numero} annulée de votre côté`;
  const p = [
    "Bonjour,",
    `La commande ${numero} ne vous est plus confiée : merci de ne pas la fabriquer ni l'expédier. Les liens de l'e-mail de commande ne fonctionnent plus.`,
    `Pièces concernées :\n${piece || "—"}`,
    ...(motif ? [`Motif : ${motif}`] : []),
    "Si vous l'aviez déjà commencée, répondez à cet e-mail en rappelant le n° de commande.", "Evarysth"
  ];
  return { sujet: titre, texte: texteBrut(p), html: page(titre, p) };
}
