/* Evarysth — panier latéral (localStorage) */
(function () {
  const KEY = "evarysth.cart.v1";
  const SHIPPING = 4.9;
  const $ = s => document.querySelector(s);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = items => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* stockage indisponible */ } };
  let items = load();
  const PROMOS = { BIENVENUE10: 0.10 };           /* code de démonstration : -10 % */
  let promo = (EVARYSTH.store && EVARYSTH.store.get("evarysth.promo", "")) || "";

  /* Paiement Stripe en MODE TEST : actif seulement après ?checkout=test (mémorisé dans le navigateur),
     coupé par ?checkout=off. Sans ce drapeau, « Commander » garde le message de prototype.
     Code du service : worker/ (même adresse dans commande/merci/index.html). */
  const CHECKOUT_URL = "https://evarysth-checkout.virnichka.workers.dev";
  const FLAG = "evarysth.checkout";
  const paiement = (() => {
    if (!EVARYSTH.store) return false;
    const q = new URLSearchParams(location.search).get("checkout");
    if (q === "test") EVARYSTH.store.set(FLAG, "test");
    if (q === "off") EVARYSTH.store.set(FLAG, "");
    return EVARYSTH.store.get(FLAG, "") === "test";
  })();
  /* Remise d'un code vérifié chez Stripe : { code, rate, amount } */
  let remise = paiement ? EVARYSTH.store.get("evarysth.promo.remise", null) : null;
  const remiseActive = () => paiement
    ? (remise && remise.code === promo ? remise : null)
    : (PROMOS[promo] ? { code: promo, rate: PROMOS[promo], amount: 0 } : null);

  async function appelWorker(chemin, corps) {
    let r;
    try {
      r = await fetch(CHECKOUT_URL + chemin, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    } catch { throw new Error("Service de paiement injoignable. Réessayez dans un instant."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Service de paiement indisponible. Réessayez dans un instant.");
    return j;
  }

  /* Ligne envoyée au paiement : identifiants et cotes seulement, le prix est recalculé par le service */
  function ligneCommande(i) {
    const parts = String(i.key).split("|");          /* id|mode|taille|cotes|coloris (paniers plus anciens) */
    const p = EVARYSTH.getProduct(i.id);
    let variant = i.variant;
    if (i.mode === "standard" && !Number.isInteger(variant) && p) variant = p.variants.options.findIndex(o => o.label === parts[2]);
    return { id: i.id, mode: i.mode, variant, values: i.mode === "custom" ? i.values : undefined,
      color: i.color ?? (parts[4] || undefined), qty: i.qty };
  }

  async function payer() {
    const b = $("#cart-checkout"), m = $("#checkout-msg");
    b.disabled = true; b.textContent = "Redirection vers le paiement…"; m.hidden = true;
    try {
      const j = await appelWorker("/checkout", {
        items: items.map(ligneCommande),
        promo: remiseActive() ? promo : "",
        base: new URL(".", document.baseURI).href,
        retour: location.origin + location.pathname
      });
      location.href = j.url;
    } catch (e) {
      b.disabled = false; b.textContent = "Commander"; m.hidden = false; m.textContent = e.message;
    }
  }

  function mount() {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="overlay" data-cart-close></div>
      <aside class="drawer" id="cart" aria-hidden="true" aria-label="Panier" role="dialog">
        <header class="drawer__head">
          <b>Votre panier <span id="cart-count-label">(0)</span></b>
          <button class="icon-btn" data-cart-close aria-label="Fermer">✕</button>
        </header>
        <ul class="drawer__list" id="cart-list"></ul>
        <footer class="drawer__foot">
          <form class="promo" id="promo-form" novalidate>
            <input id="promo-input" placeholder="Code promo" autocomplete="off" aria-label="Code promo">
            <button class="btn" type="submit">Appliquer</button>
          </form>
          <p class="promo__msg" id="promo-msg" hidden></p>
          <label class="gift" id="cart-gift"><input type="checkbox" data-soon="Emballage cadeau"> Emballage cadeau <small class="muted">+ 3 €</small></label>
          <div class="row"><span>Sous-total</span><span id="cart-sub">0 €</span></div>
          <div class="row" id="cart-disc-row" hidden><span>Remise <span class="mono" id="cart-disc-code"></span></span><span id="cart-disc">0 €</span></div>
          <div class="row muted"><span>Livraison</span><span id="cart-shipcost">—</span></div>
          <div class="row total"><span>Total</span><span id="cart-total">0 €</span></div>
          <p class="promo__msg is-err" id="checkout-msg" role="alert" hidden></p>
          <button class="btn btn--primary btn--block" id="cart-checkout">Commander</button>
          <p class="promo__msg checkout-test" id="checkout-test" hidden>Mode test : aucun paiement réel. Carte 4242 4242 4242 4242, date future, CVC au choix.</p>
          <p class="fine">Fabriqué à la commande en France · Expédié sous 3 à 5 jours · Paiement sécurisé</p>
        </footer>
      </aside>`);
    document.addEventListener("click", e => {
      if (e.target.closest("[data-cart-open]")) { e.preventDefault(); open(); }
      if (e.target.closest("[data-cart-close]")) close();
      const b = e.target.closest("[data-qty]");
      if (b) setQty(b.dataset.key, Number(b.dataset.qty));
      const r = e.target.closest("[data-remove]");
      if (r) remove(r.dataset.remove);
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    $("#promo-form").addEventListener("submit", e => {
      e.preventDefault();
      const code = $("#promo-input").value.trim().toUpperCase();
      if (!code) return;
      if (paiement) {
        appelWorker("/promo", { code }).then(j => {
          if (!j.valide) throw new Error(j.error);
          promo = j.code; remise = j;
          EVARYSTH.store.set("evarysth.promo", promo); EVARYSTH.store.set("evarysth.promo.remise", j);
          $("#promo-input").value = ""; render(); EVARYSTH.toast(`Code ${promo} appliqué`);
        }).catch(err => { const m = $("#promo-msg"); m.hidden = false; m.className = "promo__msg is-err"; m.textContent = err.message; });
        return;
      }
      if (PROMOS[code]) { promo = code; EVARYSTH.store.set("evarysth.promo", code); $("#promo-input").value = ""; render(); EVARYSTH.toast(`Code ${code} appliqué`); }
      else { const m = $("#promo-msg"); m.hidden = false; m.className = "promo__msg is-err"; m.textContent = "Code non reconnu. (Essayez BIENVENUE10 pour tester.)"; }
    });
    document.addEventListener("click", e => {
      if (e.target.closest("[data-promo-remove]")) { promo = ""; EVARYSTH.store.set("evarysth.promo", ""); render(); }
    });
    $("#cart-checkout").addEventListener("click", () => {
      if (!items.length) return;
      if (paiement) { payer(); return; }
      const count = items.reduce((s, i) => s + i.qty, 0);
      $("#cart-list").innerHTML = `<li class="empty done">
        <span class="done__icon">✓</span>
        <h3>Commande prête (${count} article${count > 1 ? "s" : ""})</h3>
        <p>Prototype : le paiement sécurisé (Stripe / Shopify) sera branché ici.</p>
        <button class="btn" id="cart-back">Retour au panier</button></li>`;
      $("#cart-back").onclick = render;
    });
    window.addEventListener("storage", e => { if (e.key === KEY) { items = load(); render(); } });
    $("#checkout-test").hidden = !paiement;
    if (paiement) $("#cart-gift").hidden = true;   /* option pas encore proposée au paiement */
    render();
    /* Retour depuis Stripe sans payer */
    const q = new URLSearchParams(location.search);
    if (q.get("panier") === "annule") {
      q.delete("panier");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
      open(); EVARYSTH.toast("Paiement annulé : votre panier est conservé.");
    }
  }

  function open() { document.body.classList.add("cart-open"); $("#cart").setAttribute("aria-hidden", "false"); }
  function close() { document.body.classList.remove("cart-open"); $("#cart").setAttribute("aria-hidden", "true"); }

  function add(item) {
    const found = items.find(i => i.key === item.key);
    if (found) found.qty += item.qty || 1; else items.push({ ...item, qty: item.qty || 1 });
    save(items); render(); open();
  }
  function setQty(key, delta) {
    const it = items.find(i => i.key === key); if (!it) return;
    it.qty += delta;
    if (it.qty <= 0) items = items.filter(i => i.key !== key);
    save(items); render();
  }
  function remove(key) { items = items.filter(i => i.key !== key); save(items); render(); }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function render() {
    const fmt = EVARYSTH.fmt;
    const count = items.reduce((s, i) => s + i.qty, 0);
    const sub = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const r = remiseActive();
    const rate = r ? r.rate : 0;
    const disc = r ? Math.min(sub, Math.round((sub * r.rate + r.amount) * 100) / 100) : 0;
    const net = sub - disc;
    const ship = !items.length ? 0 : SHIPPING;
    $("#cart-disc-row").hidden = !disc;
    $("#cart-disc").textContent = "− " + fmt(disc);
    $("#cart-disc-code").textContent = promo;
    const pm = $("#promo-msg");
    pm.hidden = !disc; pm.className = "promo__msg";
    pm.innerHTML = disc ? `Code <b>${promo}</b> appliqué (−${rate ? Math.round(rate * 100) + " %" : fmt(r.amount)}) · <button type="button" class="link" data-promo-remove>Retirer</button>` : "";
    document.querySelectorAll("[data-cart-count]").forEach(el => { el.textContent = count; el.hidden = !count; });
    $("#cart-count-label").textContent = `(${count})`;
    $("#cart-sub").textContent = fmt(sub);
    $("#cart-shipcost").textContent = !items.length ? "—" : fmt(ship);
    $("#cart-total").textContent = fmt(net + ship);
    $("#cart-checkout").disabled = !items.length;
    $("#cart-list").innerHTML = items.length ? items.map(i => `
      <li class="line">
        <div class="line__thumb">${EVARYSTH.shapeSVG(i.shape)}</div>
        <div class="line__body">
          <div class="line__top"><a href="produits/${i.id}/" data-cart-close>${esc(i.name)}</a><span>${fmt(i.unitPrice * i.qty)}</span></div>
          <span class="tag ${i.mode === "custom" ? "tag--accent" : ""}">${i.mode === "custom" ? "Sur-mesure" : "Standard"}</span>
          <ul class="line__opts">${i.details.map(d => `<li><span>${esc(d[0])}</span><span>${esc(d[1])}</span></li>`).join("")}</ul>
          <div class="line__actions">
            <div class="qty">
              <button data-qty="-1" data-key="${esc(i.key)}" aria-label="Retirer un">−</button>
              <span>${i.qty}</span>
              <button data-qty="1" data-key="${esc(i.key)}" aria-label="Ajouter un">+</button>
            </div>
            <button class="link" data-remove="${esc(i.key)}">Supprimer</button>
          </div>
        </div>
      </li>`).join("")
      : `<li class="empty"><p>Votre panier est vide.</p><a class="btn" href="catalogue/" data-cart-close>Voir le catalogue</a></li>`;
  }

  EVARYSTH.cart = { add, open, close };
  document.addEventListener("DOMContentLoaded", mount);
})();
