/* E-mail « Nouvelle commande » envoyé au vendeur par l'API Brevo (transactionnel).
   Secrets Cloudflare : BREVO_API_KEY, ORDER_EMAIL (destinataire : jamais dans le dépôt, il est public).
   Variable : EMAIL_FROM (expéditeur authentifié dans Brevo). */
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
  return `${f.environnement === "test" ? "[TEST] " : ""}Nouvelle commande ${f.ref} — ${eur(f.total_eur)}`;
}

export function contenu(f) {
  const lignes = f.lignes.map(ligneLisible);
  const a = (f.livraison && f.livraison.adresse) || {};
  const adresse = [f.livraison && f.livraison.nom, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean);
  const stripe = f.payment_intent ? `https://dashboard.stripe.com/${f.environnement === "test" ? "test/" : ""}payments/${f.payment_intent}` : "";

  const texte = [
    sujet(f), "",
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
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Evarysth", email: env.EMAIL_FROM || "commandes@evarysth.fr" },
      to: env.ORDER_EMAIL.split(",").map(e => ({ email: e.trim() })).filter(e => e.email),
      ...(f.client && f.client.email ? { replyTo: { email: f.client.email, ...(f.client.nom ? { name: f.client.nom } : {}) } } : {}),
      subject: sujet(f),
      htmlContent: html,
      textContent: texte,
      tags: ["commande", f.environnement]
    })
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 300)}`);
  return true;
}
