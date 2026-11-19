/* Evarysth — panier latéral (localStorage) */
(function () {
  const KEY = "evarysth.cart.v1";
  /* Livraison (au poids, EVARYSTH.livraison), emballage cadeau, codes de démonstration : EVARYSTH.frais
     (assets/js/prix.js) */
  const GIFT = EVARYSTH.frais.cadeau;
  const GIFT_MAX = EVARYSTH.frais.messageCadeauMax;
  const $ = s => document.querySelector(s);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = items => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* stockage indisponible */ } };
  let items = load();
  const PROMOS = EVARYSTH.frais.promosDemo;
  let promo = (EVARYSTH.store && EVARYSTH.store.get("evarysth.promo", "")) || "";
  /* Emballage cadeau : { on, message } mémorisé dans le navigateur */
  const GIFT_KEY = "evarysth.cadeau";
  let gift = { on: false, message: "", ...((EVARYSTH.store && EVARYSTH.store.get(GIFT_KEY, null)) || {}) };
  const saveGift = () => EVARYSTH.store && EVARYSTH.store.set(GIFT_KEY, gift);

  const remiseActive = () => PROMOS[promo] ? { code: promo, rate: PROMOS[promo], amount: 0 } : null;

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
          <details class="promo-pli" id="promo-pli"><summary>Vous avez un code promo ?</summary>
          <form class="promo" id="promo-form" novalidate>
            <input id="promo-input" placeholder="Code promo" autocomplete="off" aria-label="Code promo" enterkeyhint="done">
            <button class="btn" type="submit">Appliquer</button>
          </form>
          <p class="promo__msg" id="promo-msg" hidden></p></details>
          <label class="gift" id="cart-gift"><input type="checkbox" id="gift-on"> Emballage cadeau <small class="muted">+ ${EVARYSTH.fmt(GIFT)} par commande</small></label>
          <div class="gift-msg" id="gift-box" hidden>
            <label for="gift-message">Message cadeau <small class="muted">(facultatif, joint au colis)</small></label>
            <textarea id="gift-message" rows="2" maxlength="${GIFT_MAX}" placeholder="Joyeux anniversaire !"></textarea>
            <small class="muted mono" id="gift-count">0 / ${GIFT_MAX}</small>
          </div>
          <div class="row"><span>Sous-total</span><span id="cart-sub">${EVARYSTH.fmt(0)}</span></div>
          <div class="row" id="cart-disc-row" hidden><span>Remise <span class="mono" id="cart-disc-code"></span></span><span id="cart-disc">${EVARYSTH.fmt(0)}</span></div>
          <div class="row" id="cart-gift-row" hidden><span>Emballage cadeau</span><span>${EVARYSTH.fmt(GIFT)}</span></div>
          <div class="row muted"><span>Livraison en point relais</span><span id="cart-shipcost">—</span></div>
          <div class="row total"><span>Total</span><span id="cart-total">${EVARYSTH.fmt(0)}</span></div>
          <p class="cart-legal" id="cart-legal">En commandant, vous acceptez nos <a href="cgv/" data-cart-close>conditions générales de vente</a>.</p>
          <label class="cart-accept" id="cart-custom-note" hidden><input type="checkbox" id="custom-ok"> <span><b>Sur-mesure :</b> j'ai vérifié mes cotes. Ces pièces sont fabriquées à mes cotes : elles ne sont ni reprises ni échangées, sauf défaut de conformité (<a href="cgv/#retractation" data-cart-close>CGV</a>).</span></label>
          <button class="btn btn--primary btn--block" id="cart-checkout">Commander</button>
          <p class="fine">Fabriqué à la commande · Expédition en général sous 3 à 5 jours ouvrés · Paiement sécurisé</p>
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
    $("#cart-list").addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.remove(); }, true);
    /* Code promo replié par défaut : le panier garde la place pour les articles sur téléphone */
    $("#promo-pli").addEventListener("toggle", e => { if (e.target.open) $("#promo-input").focus(); });
    $("#promo-form").addEventListener("submit", e => {
      e.preventDefault();
      const code = $("#promo-input").value.trim().toUpperCase();
      if (!code) return;
      if (PROMOS[code]) { promo = code; EVARYSTH.store.set("evarysth.promo", code); $("#promo-input").value = ""; render(); EVARYSTH.toast(`Code ${code} appliqué`); }
      else { const m = $("#promo-msg"); m.hidden = false; m.className = "promo__msg is-err"; m.textContent = "Code non reconnu. (Essayez BIENVENUE10 pour tester.)"; }
    });
    document.addEventListener("click", e => {
      if (e.target.closest("[data-promo-remove]")) { promo = ""; EVARYSTH.store.set("evarysth.promo", ""); render(); }
    });
    $("#cart-checkout").addEventListener("click", () => {
      if (!items.length) return;
      const count = items.reduce((s, i) => s + i.qty, 0);
      $("#cart-list").innerHTML = `<li class="empty done">
        <span class="done__icon">✓</span>
        <h3>Les commandes ouvrent bientôt</h3>
        <p>Votre panier (${count} article${count > 1 ? "s" : ""}) est conservé sur cet appareil : vous pourrez le finaliser dès l'ouverture de la boutique.</p>
        <button class="btn" id="cart-back">Retour au panier</button></li>`;
      $("#cart-back").onclick = render;
    });
    window.addEventListener("storage", e => { if (e.key === KEY) { items = load(); render(); } });
    $("#gift-on").checked = gift.on;
    $("#gift-message").value = gift.message.slice(0, GIFT_MAX);
    $("#gift-on").addEventListener("change", e => { gift.on = e.target.checked; saveGift(); render(); });
    /* Sur-mesure à vos cotes, sans droit de rétractation (CGV, L221-28 3° ; EVARYSTH.horsRetractation) : accord explicite */
    $("#custom-ok").addEventListener("change", render);
    $("#gift-message").addEventListener("input", e => { gift.message = e.target.value.slice(0, GIFT_MAX); saveGift(); renderGiftCount(); });
    render();
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

  /* Vignette d'une ligne du panier : 1re photo du produit, sinon rendu 3D du catalogue ; l'icône reste dessous
     et réapparaît si l'image manque (écouteur « error » sur #cart-list) */
  function vignette(id) {
    const p = EVARYSTH.getProduct(id);
    if (!p) return "";
    const ph = p.photos && p.photos[0];
    const src = ph ? ph.src : p.model ? `assets/vignettes/${p.id}-1.webp` : "";
    return src ? `<img class="${ph ? "" : "is-rendu"}" src="${esc(src)}" alt="" loading="lazy" decoding="async"${ph && ph.pos ? ` style="object-position:${esc(ph.pos)}"` : ""}>` : "";
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function renderGiftCount() { $("#gift-count").textContent = `${gift.message.length} / ${GIFT_MAX}`; }

  /* Prix unitaire à jour de chaque article, dégressif selon la quantité de la ligne, et masse d'une pièce (livraison).
     En cas d'impossibilité (produit retiré, barème absent), le prix enregistré
     reste affiché. */
  function prixAJour() {
    for (const i of items) {
      try {
        const l = ligneCommande(i), p = EVARYSTH.getProduct(l.id);
        if (!p) continue;
        const v = l.mode === "custom" ? l.values : (p.variants.options[l.variant] || {}).values;
        const prix = v && EVARYSTH.priceFor(p, l.mode, v, i.qty), e = v && EVARYSTH.estimation(p, v);
        if (Number.isFinite(prix)) i.unitPrice = prix;
        if (e) i.masse_g = e.masse_g;
      } catch { /* prix enregistré gardé */ }
    }
  }

  function render() {
    prixAJour();
    const fmt = EVARYSTH.fmt;
    const count = items.reduce((s, i) => s + i.qty, 0);
    const r = remiseActive();
    const rate = r ? r.rate : 0;
    /* Totaux : EVARYSTH.totalPanier (prix.js) */
    const t = EVARYSTH.totalPanier(items.map(i => ({ prix: i.unitPrice, masse_g: i.masse_g || 0, qty: i.qty })), { cadeau: gift.on, remise: r });
    const giftCost = t.emballage, disc = t.remise;
    $("#cart-gift-row").hidden = !giftCost;
    $("#gift-box").hidden = !gift.on;
    $("#cart-gift").hidden = !items.length;
    $("#cart-legal").hidden = !items.length;
    /* Case à cocher seulement pour un article exclu du droit de rétractation (au moins une cote en mm) */
    const surMesure = items.some(i => EVARYSTH.horsRetractation(EVARYSTH.getProduct(i.id), i.mode));
    $("#cart-custom-note").hidden = !surMesure;
    if (!surMesure) $("#custom-ok").checked = false;
    renderGiftCount();
    $("#cart-disc-row").hidden = !disc;
    $("#cart-disc").textContent = "− " + fmt(disc);
    $("#cart-disc-code").textContent = promo;
    const pm = $("#promo-msg");
    pm.hidden = !disc; pm.className = "promo__msg";
    pm.innerHTML = disc ? `Code <b>${esc(promo)}</b> appliqué (−${rate ? Math.round(rate * 100) + " %" : fmt(r.amount)}) · <button type="button" class="link" data-promo-remove>Retirer</button>` : "";
    document.querySelectorAll("[data-cart-count]").forEach(el => { el.textContent = count; el.hidden = !count; });
    $("#cart-count-label").textContent = `(${count})`;
    $("#cart-sub").textContent = fmt(t.articles);
    $("#cart-shipcost").textContent = !items.length ? "—" : fmt(t.livraison);
    $("#cart-total").textContent = fmt(t.total);
    $("#cart-checkout").disabled = !items.length || (surMesure && !$("#custom-ok").checked);
    $("#cart-list").innerHTML = items.length ? items.map(i => `
      <li class="line">
        <div class="line__thumb">${EVARYSTH.shapeSVG(i.shape)}${vignette(i.id)}</div>
        <div class="line__body">
          <div class="line__top"><a href="produits/${encodeURIComponent(i.id)}/" data-cart-close>${esc(i.name)}</a><span>${fmt(i.unitPrice * i.qty)}</span></div>
          ${i.qty > 1 ? `<p class="line__unit">${fmt(i.unitPrice)} l'unité · prix dégressif</p>` : ""}
          <span class="tag ${i.mode === "custom" ? "tag--accent" : ""}">${i.mode === "custom" ? "Sur-mesure" : "Standard"}</span>
          <ul class="line__opts">${i.details.map(d => `<li><span>${esc(d[0])}</span><span>${esc(d[1])}</span></li>`).join("")}</ul>
          <div class="line__actions">
            <div class="qty">
              <button data-qty="-1" data-key="${esc(i.key)}" aria-label="Retirer un">−</button>
              <span>${esc(i.qty)}</span>
              <button data-qty="1" data-key="${esc(i.key)}" aria-label="Ajouter un">+</button>
            </div>
            <button class="link" data-remove="${esc(i.key)}">Supprimer</button>
          </div>
        </div>
      </li>`).join("")
      : `<li class="empty"><p>Votre panier est vide.</p><a class="btn" href="catalogue/" data-cart-close>Voir le catalogue</a></li>`;
  }

  EVARYSTH.cart = { add };
  document.addEventListener("DOMContentLoaded", mount);
})();
