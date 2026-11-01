/* Modulr Studio — rendu catalogue & page produit */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = MODULR.fmt;

  /* Illustrations line-art (aucune image externe) */
  const SHAPES = {
    clamp: `<rect x="18" y="30" width="84" height="8" rx="2" class="ghost"/>
      <path d="M30 22h28v24H44v8h44v24a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8V54"/>
      <path d="M58 22v-4h-36v32h10"/><path d="M48 70h32"/>`,
    hook: `<rect x="14" y="26" width="92" height="10" rx="2" class="ghost"/>
      <path d="M40 46V22a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v24"/>
      <path d="M60 16v64a16 16 0 1 1-32 0v-4"/><circle cx="28" cy="72" r="3"/>`,
    clip: `<line x1="60" y1="10" x2="60" y2="110" class="ghost"/>
      <path d="M78 60a18 18 0 1 1-6-13.4"/><path d="M72 46.6 90 34h14"/>
      <path d="M78 60h26"/><circle cx="60" cy="60" r="6" class="ghost"/>`,
    tray: `<path d="M16 46 60 26l44 20-44 20z"/><path d="M16 46v28l44 20 44-20V46"/>
      <path d="M60 66v28"/><path d="M38 56v28" class="ghost"/><path d="M82 56v28" class="ghost"/>`,
    riser: `<ellipse cx="60" cy="34" rx="30" ry="10"/><path d="M30 34v46c0 5.5 13.4 10 30 10s30-4.5 30-10V34"/>
      <ellipse cx="60" cy="34" rx="14" ry="4.6" class="ghost"/><path d="M30 56c0 5.5 13.4 10 30 10s30-4.5 30-10" class="ghost"/>`
  };
  MODULR.shapeSVG = (shape, cls = "") =>
    `<svg class="shape ${cls}" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[shape] || SHAPES.tray}</svg>`;

  const card = p => `
    <a class="card" href="#p-${p.id}">
      <div class="card__media">${MODULR.shapeSVG(p.shape)}<span class="card__badge">Sur-mesure dispo</span></div>
      <div class="card__body">
        <h3>${p.name}</h3>
        <p>${p.tagline}</p>
        <div class="card__foot"><span class="price">dès ${fmt(p.price)}</span><span class="arrow">→</span></div>
      </div>
    </a>`;

  /* ---------- Accueil ---------- */
  const inFamily = u => MODULR.products.filter(p => p.universe === u.id);
  const heading = u => `<h2>${u.name} <em>${u.sub}</em></h2>`;

  function renderHome() {
    ["clamp", "tray", "hook", "riser"].forEach((sh, i) => {
      const t = document.querySelector(`.hero__visual .t${i + 1}`); if (t) t.innerHTML = MODULR.shapeSVG(sh);
    });
    $("#families-root").innerHTML = MODULR.universes.map(u => {
      const list = inFamily(u);
      return `<a class="family-tile" href="#f-${u.id}">
        <span class="mono code">${u.code}</span>
        <div class="family-tile__art">${list.slice(0, 3).map(p => MODULR.shapeSVG(p.shape)).join("")}</div>
        <div><h3>${u.name} <em>${u.sub}</em></h3><p>${u.pitch}</p></div>
        <span class="family-tile__foot mono">${list.length} hacks <span class="arrow">→</span></span>
      </a>`;
    }).join("");
  }

  /* ---------- Page catalogue : une rangée défilante par famille ---------- */
  function renderCatalogue() {
    $("#catalogue-root").innerHTML = MODULR.universes.map(u => {
      const list = inFamily(u);
      return `<section class="row-block">
        <header class="row-block__head">
          <span class="mono code">${u.code}</span>
          <div class="row-block__title">${heading(u)}<p>${u.pitch}</p></div>
          <div class="row-block__tools">
            <a class="link-arrow mono" href="#f-${u.id}">Voir tout (${list.length}) →</a>
            <button class="icon-btn" data-scroll="-1" aria-label="Précédent">←</button>
            <button class="icon-btn" data-scroll="1" aria-label="Suivant">→</button>
          </div>
        </header>
        <div class="rail" tabindex="0" aria-label="${u.name}">
          ${list.map(card).join("")}
          <a class="card card--more" href="#f-${u.id}"><span class="mono">Voir tout</span><span class="arrow">→</span><small>${u.name}</small></a>
        </div>
      </section>`;
    }).join("");
  }

  /* ---------- Page famille ---------- */
  function renderFamily(id) {
    const u = MODULR.getUniverse(id), list = inFamily(u);
    document.title = `${u.name} — Modulr Studio`;
    $("#family-view").innerHTML = `
      <nav class="crumbs mono"><a href="#catalogue">Catalogue</a> / <span>${u.name}</span></nav>
      <header class="page-head">
        <span class="mono eyebrow">${u.code} — Univers</span>
        <h1>${u.name} <em>${u.sub}</em></h1>
        <p>${u.pitch}</p>
      </header>
      <div class="grid">${list.map(card).join("")}</div>
      <section class="related">
        <h2 class="mono">AUTRES UNIVERS</h2>
        <div class="chips">${MODULR.universes.filter(x => x.id !== id).map(x =>
          `<a class="chip" href="#f-${x.id}"><span class="mono code">${x.code}</span>${x.name} <em>${x.sub}</em><span class="arrow">→</span></a>`).join("")}</div>
      </section>`;
  }

  /* ---------- Page produit ---------- */
  function renderProduct(id) {
    const root = $("#product-root");
    const p = MODULR.getProduct(id);
    const u = MODULR.getUniverse(p.universe);
    document.title = `${p.name} — Modulr Studio`;

    const state = {
      mode: "standard",
      variant: 1,
      custom: Object.fromEntries(p.custom.params.map(x => [x.key, x.def])),
      qty: 1
    };
    const LETTERS = ["A", "B"];

    root.innerHTML = `
      <nav class="crumbs mono"><a href="#catalogue">Catalogue</a> / <a href="#f-${u.id}">${u.name}</a> / <span>${p.name}</span></nav>
      <div class="pdp">
        <div class="pdp__visual">
          <div class="stage" id="stage">
            ${MODULR.shapeSVG(p.shape, "shape--xl")}
            <div class="dims" id="dims"></div>
            <span class="stage__mat mono">NYLON PA12 · NOIR MAT</span>
          </div>
          <ul class="perks">
            <li><b>Sans outil</b><span>Se pose à la main</span></li>
            <li><b>Indestructible</b><span>Nylon industriel</span></li>
            <li><b>Garanti 2 ans</b><span>Refait si ça ne va pas</span></li>
          </ul>
        </div>

        <div class="pdp__info">
          <span class="mono eyebrow">${u.code} — ${u.name} ${u.sub}</span>
          <h1>${p.name}</h1>
          <p class="lead">${p.tagline}</p>
          <div class="pdp__price"><span id="price"></span><small id="price-note"></small></div>
          <p class="desc">${p.desc}</p>

          <div class="segmented" role="tablist">
            <button role="tab" data-mode="standard">Prêt-à-poser <small>Standard</small></button>
            <button role="tab" data-mode="custom">Sur-mesure <small>Ajusté au mm</small></button>
          </div>

          <div class="pane" id="pane-standard">
            <span class="label">${p.variants.label}</span>
            <div class="options">
              ${p.variants.options.map((o, i) => `
                <button class="opt" data-variant="${i}"><b>${o.label}</b><small>${o.hint}</small></button>`).join("")}
            </div>
          </div>

          <div class="pane" id="pane-custom" hidden>
            ${p.custom.params.map((prm, i) => `
              <div class="slider">
                <div class="slider__head">
                  <label for="s-${prm.key}"><span class="mono letter">${LETTERS[i]}</span>${prm.label}</label>
                  <div class="slider__val"><input type="number" id="n-${prm.key}" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${prm.def}"><span>mm</span></div>
                </div>
                <input type="range" id="s-${prm.key}" data-key="${prm.key}" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${prm.def}">
                <div class="slider__scale mono"><span>${prm.min}</span><span>${prm.max} mm</span></div>
              </div>`).join("")}
            <p class="tip">📏 Mesurez avec un simple mètre ruban. On ajoute nous-mêmes la tolérance pour un ajustement parfait.</p>
          </div>

          <div class="summary">
            <div class="summary__head mono">RÉSUMÉ DE COMMANDE</div>
            <ul id="summary"></ul>
          </div>

          <div class="buy">
            <div class="qty qty--lg">
              <button data-q="-1" aria-label="Moins">−</button><span id="qty">1</span><button data-q="1" aria-label="Plus">+</button>
            </div>
            <button class="btn btn--primary btn--grow" id="add">Ajouter au panier — <span id="add-price"></span></button>
          </div>
          <p class="fine">Imprimé à la commande · Expédié sous 3 à 5 jours · Retour gratuit 30 jours</p>
        </div>
      </div>

      <section class="related">
        <h2 class="mono">DANS LE MÊME UNIVERS</h2>
        <div class="grid">${MODULR.products.filter(x => x.universe === p.universe && x.id !== p.id).map(card).join("")}</div>
      </section>`;

    const values = () => state.mode === "custom" ? state.custom : p.variants.options[state.variant].values;

    function update() {
      root.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("is-active", b.dataset.mode === state.mode));
      root.querySelectorAll("[data-variant]").forEach(b => b.classList.toggle("is-active", +b.dataset.variant === state.variant));
      $("#pane-standard").hidden = state.mode !== "standard";
      $("#pane-custom").hidden = state.mode !== "custom";

      const v = values();
      const unit = MODULR.priceFor(p, state.mode, v);
      $("#price").textContent = fmt(unit);
      $("#price-note").textContent = state.mode === "custom" ? "Sur-mesure, fabriqué pour vous" : "Taille standard";
      $("#add-price").textContent = fmt(unit * state.qty);
      $("#qty").textContent = state.qty;

      const dimRows = p.custom.params.map((prm, i) => [`${LETTERS[i]} · ${prm.label}`, `${v[prm.key]} mm`]);
      $("#dims").innerHTML = p.custom.params.map((prm, i) =>
        `<span class="dim mono"><i>${LETTERS[i]}</i>${v[prm.key]}<small>mm</small></span>`).join("");

      const rows = [
        ["Produit", p.name],
        ["Version", state.mode === "custom" ? "Sur-mesure" : `Standard — ${p.variants.options[state.variant].label}`],
        ...dimRows,
        ["Matière", "Nylon PA12 noir mat"],
        ["Quantité", `× ${state.qty}`]
      ];
      $("#summary").innerHTML = rows.map(r => `<li><span>${r[0]}</span><b>${r[1]}</b></li>`).join("") +
        `<li class="summary__total"><span>Total</span><b>${fmt(unit * state.qty)}</b></li>`;
      state._unit = unit; state._dimRows = dimRows;
    }

    function pulse() { const d = $("#dims"); d.classList.remove("pulse"); void d.offsetWidth; d.classList.add("pulse"); }

    root.onclick = e => {
      const m = e.target.closest("[data-mode]"); if (m) { state.mode = m.dataset.mode; update(); pulse(); }
      const o = e.target.closest("[data-variant]"); if (o) { state.variant = +o.dataset.variant; update(); pulse(); }
      const q = e.target.closest("[data-q]"); if (q) { state.qty = Math.max(1, Math.min(20, state.qty + +q.dataset.q)); update(); }
    };

    p.custom.params.forEach(prm => {
      const range = $(`#s-${prm.key}`), num = $(`#n-${prm.key}`);
      const paint = () => range.style.setProperty("--p", ((range.value - prm.min) / (prm.max - prm.min)) * 100 + "%");
      range.addEventListener("input", () => { state.custom[prm.key] = +range.value; num.value = range.value; paint(); update(); });
      num.addEventListener("change", () => {
        const val = Math.min(prm.max, Math.max(prm.min, Math.round(+num.value / prm.step) * prm.step || prm.def));
        num.value = range.value = val; state.custom[prm.key] = val; paint(); update(); pulse();
      });
      paint();
    });

    $("#add").addEventListener("click", () => {
      const v = values();
      const variantLabel = state.mode === "custom" ? "" : p.variants.options[state.variant].label;
      const details = state.mode === "custom"
        ? p.custom.params.map(prm => [prm.label, `${v[prm.key]} mm`])
        : [[p.variants.label, `${variantLabel} (${p.variants.options[state.variant].hint})`]];
      MODULR.cart.add({
        key: [p.id, state.mode, variantLabel, JSON.stringify(v)].join("|"),
        id: p.id, name: p.name, shape: p.shape, mode: state.mode,
        values: { ...v }, details,
        summary: details.map(d => `${d[0]} : ${d[1]}`).join(", "),
        unitPrice: state._unit, qty: state.qty
      });
    });

    update();
  }

  /* Routage par ancre : #catalogue, #f-<famille>, #p-<produit>, sinon accueil */
  const HOME_TITLE = document.title;
  const VIEWS = ["home-view", "catalogue-view", "family-view", "product-root"];
  function show(id) { VIEWS.forEach(v => { $("#" + v).hidden = v !== id; }); }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const prod = h.startsWith("p-") && MODULR.getProduct(h.slice(2));
    const fam = h.startsWith("f-") && MODULR.getUniverse(h.slice(2));
    let top = true, nav = "";
    if (prod) { show("product-root"); renderProduct(prod.id); nav = "f-" + prod.universe; }
    else if (fam) { show("family-view"); renderFamily(fam.id); nav = h; }
    else if (h === "catalogue") { show("catalogue-view"); document.title = "Catalogue — Modulr Studio"; nav = h; }
    else {
      show("home-view"); document.title = HOME_TITLE;
      const target = h && document.getElementById(h);
      if (target) { target.scrollIntoView(); top = false; }
    }
    if (top) window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("is-current", a.dataset.nav === nav));
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-scroll]"); if (!b) return;
    const rail = b.closest(".row-block").querySelector(".rail");
    rail.scrollBy({ left: +b.dataset.scroll * rail.clientWidth * .85, behavior: "smooth" });
  });

  document.addEventListener("DOMContentLoaded", () => {
    renderHome(); renderCatalogue(); route();
    window.addEventListener("hashchange", route);
  });
})();
