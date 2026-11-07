/* Correctifs de l'audit de sécurité : paiement différé, journaux sans donnée personnelle,
   /session sans e-mail en clair, erreurs Stripe non recopiées au visiteur. Aucun appel réel. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { signer } from "../src/stripe.js";

const SITE = "https://www.evarysth.fr";
const env = {
  CHECKOUT_MODE: "test", ALLOWED_ORIGINS: SITE, STRIPE_SECRET_KEY: "sk_test_factice", STRIPE_WEBHOOK_SECRET: "whsec_factice",
  BREVO_API_KEY: "xkeysib-factice", ORDER_EMAIL: "atelier@example.com",
  /* Secrets Google factices : le back-office est « configuré », on vérifie qu'il n'est pas appelé */
  GOOGLE_SA_EMAIL: "w@p.iam.gserviceaccount.com", GOOGLE_SA_KEY: "pas-une-cle", SHEET_ID: "id-factice"
};

let appels, brevo, journal;
const vrai = { fetch: globalThis.fetch, log: console.log, warn: console.warn, error: console.error };
beforeEach(() => {
  appels = []; brevo = []; journal = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    appels.push(u.host + u.pathname);
    const rep = (d, status = 200) => new Response(JSON.stringify(d), { status });
    if (u.host === "api.brevo.com") { brevo.push(JSON.parse(init.body)); return rep({ messageId: "m" }, 201); }
    if (u.pathname.endsWith("/line_items")) return rep({ data: [{ description: "Boîte — Standard", quantity: 2, amount_total: 5000, price: { product: { metadata: {} } } }] });
    if (u.pathname === "/v1/checkout/sessions/cs_test_existe1234")
      return rep({ metadata: { ref: "EV-1" }, payment_status: "paid", amount_total: 5490, total_details: {}, customer_details: { email: "camille.test@example.com" }, line_items: { data: [] } });
    if (u.pathname.startsWith("/v1/checkout/sessions/"))
      return rep({ error: { message: "No such checkout.session: cs_test_inconnu123", code: "resource_missing" } }, 404);
    if (u.pathname === "/v1/checkout/sessions") return rep({ error: { message: "Invalid API Key provided: sk_test_****tice" } }, 401);
    throw new Error("appel inattendu " + url);
  };
  console.log = (...a) => journal.push(a.join(" ")); console.warn = console.error = (...a) => journal.push(a.join(" "));
});
afterEach(() => { globalThis.fetch = vrai.fetch; console.log = vrai.log; console.warn = vrai.warn; console.error = vrai.error; });

const session = statut => ({ id: "cs_test_sepa", payment_status: statut, amount_total: 5490, metadata: { ref: "EV-SEPA", cadeau: "oui", message_cadeau: "Joyeux anniversaire Camille" },
  customer_details: { name: "Camille Test", email: "camille.test@example.com" },
  collected_information: { shipping_details: { name: "Camille Test", address: { line1: "1 rue des Lilas", postal_code: "75011", city: "Paris", country: "FR" } } } });
async function webhook(type, statut) {
  const corps = JSON.stringify({ type, livemode: false, data: { object: session(statut) } });
  const t = Math.floor(Date.now() / 1000);
  const entete = `t=${t},v1=${await signer(env.STRIPE_WEBHOOK_SECRET, `${t}.${corps}`)}`;
  return worker.fetch(new Request("https://w.dev/webhook", { method: "POST", headers: { "Stripe-Signature": entete }, body: corps }), env);
}

test("webhook paiement différé (unpaid) : ni back-office ni e-mail client, l'atelier est prévenu « ne pas fabriquer »", async () => {
  assert.equal((await webhook("checkout.session.completed", "unpaid")).status, 200);
  assert.ok(!appels.some(a => /google/.test(a)), "aucun appel Google (Sheet, jeton)");
  assert.equal(brevo.length, 1);
  assert.deepEqual(brevo[0].to, [{ email: "atelier@example.com" }]);
  assert.match(brevo[0].subject, /^\[TEST\] \[PAIEMENT EN ATTENTE\] Nouvelle commande EV-SEPA/);
  assert.match(brevo[0].textContent, /ne pas fabriquer/);
  assert.match(brevo[0].htmlContent, /ne pas fabriquer/);
});

test("webhook async_payment_succeeded : traité comme une commande payée", async () => {
  /* Sheet configuré mais clé factice : le back-office est tenté (preuve que la commande est traitée), puis 503 */
  const r = await webhook("checkout.session.async_payment_succeeded", "paid");
  assert.equal(r.status, 503);
  assert.equal(brevo.length, 1);
  assert.doesNotMatch(brevo[0].subject, /ATTENTE/);
});

test("webhook : événement non lié aux commandes ignoré", async () => {
  assert.equal((await webhook("checkout.session.async_payment_failed", "unpaid")).status, 200);
  assert.equal(brevo.length, 0);
});

test("journaux du Worker : aucune donnée personnelle (nom, e-mail, adresse, message cadeau)", async () => {
  await webhook("checkout.session.completed", "unpaid");
  const tout = journal.join("\n");
  assert.match(tout, /EV-SEPA/);
  assert.doesNotMatch(tout, /Camille|camille\.test@|Lilas|75011|anniversaire/);
});

const get = chemin => worker.fetch(new Request(`https://w.dev${chemin}`, { headers: { Origin: SITE } }), env);

test("/session : e-mail masqué ; session inconnue → 404 sans le message brut de Stripe", async () => {
  const ok = await (await get("/session?id=cs_test_existe1234")).json();
  assert.equal(ok.email, "c•••@example.com");
  const r = await get("/session?id=cs_test_inconnu123");
  assert.equal(r.status, 404);
  assert.doesNotMatch(await r.text(), /No such|cs_test_inconnu/);
});

test("/checkout : erreur Stripe → message générique, détail seulement dans les journaux", async () => {
  const r = await worker.fetch(new Request("https://w.dev/checkout", { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE },
    body: JSON.stringify({ items: [{ id: "boite-rugged", mode: "standard", variant: 0, qty: 1, color: "noir" }] }) }), env);
  assert.equal(r.status, 502);
  const texte = await r.text();
  assert.doesNotMatch(texte, /API Key|sk_test/);
  assert.match(texte, /Réessayez/);
  assert.match(journal.join("\n"), /Invalid API Key/);
});
