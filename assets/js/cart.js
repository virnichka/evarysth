/* Modulr Studio — panier latéral (localStorage) */
(function () {
  const KEY = "modulr.cart.v1";
  const FREE_SHIPPING = 49;
  const SHIPPING = 4.9;
  const $ = s => document.querySelector(s);

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = items => localStorage.setItem(KEY, JSON.stringify(items));
  let items = load();

  function mount() {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="overlay" data-cart-close></div>
      <aside class="drawer" id="cart" aria-hidden="true" aria-label="Panier" role="dialog">
        <header class="drawer__head">
          <span class="mono">PANIER <span id="cart-count-label">(0)</span></span>
          <button class="icon-btn" data-cart-close aria-label="Fermer">✕</button>
        </header>
        <div class="drawer__ship" id="cart-ship"></div>
        <ul class="drawer__list" id="cart-list"></ul>
        <footer class="drawer__foot">
          <div class="row"><span>Sous-total</span><span id="cart-sub">0 €</span></div>
          <div class="row muted"><span>Livraison</span><span id="cart-shipcost">—</span></div>
          <div class="row total"><span>Total</span><span id="cart-total">0 €</span></div>
          <button class="btn btn--primary btn--block" id="cart-checkout">Commander</button>
          <p class="fine">Fabriqué à la commande en France · Expédié sous 3 à 5 jours</p>
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
    $("#cart-checkout").addEventListener("click", () => {
      if (!items.length) return;
      alert("Prototype : le paiement sera branché ici (Stripe / Shopify).\n\nRécapitulatif envoyé :\n" +
        items.map(i => `• ${i.qty} × ${i.name} — ${i.summary}`).join("\n"));
    });
    window.addEventListener("storage", e => { if (e.key === KEY) { items = load(); render(); } });
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

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function render() {
    const fmt = MODULR.fmt;
    const count = items.reduce((s, i) => s + i.qty, 0);
    const sub = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const ship = !items.length ? 0 : sub >= FREE_SHIPPING ? 0 : SHIPPING;
    document.querySelectorAll("[data-cart-count]").forEach(el => { el.textContent = count; el.hidden = !count; });
    $("#cart-count-label").textContent = `(${count})`;
    $("#cart-sub").textContent = fmt(sub);
    $("#cart-shipcost").textContent = !items.length ? "—" : ship ? fmt(ship) : "Offerte";
    $("#cart-total").textContent = fmt(sub + ship);
    $("#cart-checkout").disabled = !items.length;
    const left = FREE_SHIPPING - sub;
    const pct = Math.min(100, (sub / FREE_SHIPPING) * 100);
    $("#cart-ship").innerHTML = items.length
      ? `<p>${left > 0 ? `Plus que <b>${fmt(left)}</b> pour la livraison offerte` : "Livraison offerte ✓"}</p>
         <div class="bar"><span style="width:${pct}%"></span></div>` : "";
    $("#cart-list").innerHTML = items.length ? items.map(i => `
      <li class="line">
        <div class="line__thumb">${MODULR.shapeSVG(i.shape)}</div>
        <div class="line__body">
          <div class="line__top"><a href="produit.html?id=${i.id}">${esc(i.name)}</a><span>${fmt(i.unitPrice * i.qty)}</span></div>
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
      : `<li class="empty"><p>Votre panier est vide.</p><a class="btn" href="index.html#catalogue" data-cart-close>Voir le catalogue</a></li>`;
  }

  MODULR.cart = { add, open, close };
  document.addEventListener("DOMContentLoaded", mount);
})();
