/* Evarysth — rendu catalogue & page produit */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = EVARYSTH.fmt;
  /* Ventes fermées : passer BOUTIQUE_OUVERTE à true à l'ouverture, le statut disparaît de la fiche (il n'est affiché qu'une fois,
     sous le prix). Voir aussi le message du bouton « Commander » dans cart.js. */
  const BOUTIQUE_OUVERTE = false;
  const SOON_NOTE = "Boutique en préparation : commandes bientôt ouvertes";

  /* Illustrations line-art (aucune image externe) */
  const SHAPES = {
    hook: `<rect x="14" y="26" width="92" height="10" rx="2" class="ghost"/>
      <path d="M40 46V22a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v24"/>
      <path d="M60 16v64a16 16 0 1 1-32 0v-4"/><circle cx="28" cy="72" r="3"/>`,
    tray: `<path d="M16 46 60 26l44 20-44 20z"/><path d="M16 46v28l44 20 44-20V46"/>
      <path d="M60 66v28"/><path d="M38 56v28" class="ghost"/><path d="M82 56v28" class="ghost"/>`,
    bracket: `<rect x="20" y="16" width="10" height="88" rx="2" class="ghost"/>
      <path d="M34 30h66v10H46"/><path d="M34 30v58l12-8V40"/><path d="M46 76 88 40"/>`,
    ring: `<ellipse cx="60" cy="42" rx="40" ry="14"/><path d="M20 42v12c0 7.7 17.9 14 40 14s40-6.3 40-14V42"/>
      <ellipse cx="60" cy="42" rx="22" ry="7" class="ghost"/><path d="M38 66v28M82 66v28" class="ghost"/>`,
    case: `<path d="M20 34h80a4 4 0 0 1 4 4v12H16V38a4 4 0 0 1 4-4z"/><path d="M16 50h88v36a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6z"/>
      <rect x="32" y="42" width="10" height="18" rx="2"/><rect x="78" y="42" width="10" height="18" rx="2"/><path d="M16 74h88" class="ghost"/>`,
    cup: `<rect x="18" y="10" width="84" height="100" rx="3" class="ghost"/><path d="M34 22v8M86 22v8M34 70v8M86 70v8" class="ghost"/>
      <path d="M36 40h48v14"/><path d="M36 40v14"/><ellipse cx="60" cy="54" rx="24" ry="8"/>
      <path d="M36 54v32c0 4.4 10.7 8 24 8s24-3.6 24-8V54"/><path d="M50 61.4c0 14 20 14 20 0" />`,
    dispenser: `<ellipse cx="62" cy="102" rx="40" ry="5" class="ghost"/>
      <path d="M28 20v74a6 6 0 0 0 6 6h58a6 6 0 0 0 6-6V68H68V20"/><ellipse cx="48" cy="20" rx="20" ry="5"/>
      <path d="M40 30v52a8 8 0 0 0 16 0V30"/><path d="M68 68h30"/><path d="M74 68v-8M80 68v-12M86 68v-9M92 68v-7"/>`,
    cat: `<ellipse cx="60" cy="98" rx="30" ry="6" class="ghost"/>
      <path d="M42 40 44 18l12 12h8l12-12 2 22"/><path d="M42 40c-4 6-4 16 2 22M78 40c4 6 4 16-2 22"/>
      <path d="M44 62c-8 8-10 22-6 34h44c4-12 2-26-6-34"/><path d="M50 46h4M66 46h4"/><path d="M56 54l4 3 4-3"/>
      <path d="M82 96c12 0 16-12 8-20"/>`,
    turtle: `<ellipse cx="60" cy="100" rx="32" ry="5" class="ghost"/>
      <circle cx="58" cy="34" r="18"/><path d="M51 32v4M65 32v4"/><path d="M52 43c4 3 8 3 12 0"/>
      <path d="M44 50c-8 8-10 22-6 34h40c4-12 2-26-6-34"/><path d="M47 64h26M48 76h24" class="ghost"/>
      <path d="M44 84v12h10v-12M66 84v12h10v-12"/><path d="M38 80c-14 0-20 8-14 16 5 6 14 2 12-4"/>`,
    car: `<path d="M10 82h100" class="ghost"/>
      <path d="M16 78v-10c0-6 4-9 10-10l16-3 14-11c4-3 8-4 13-4h12c8 0 14 4 18 10l6 9c4 1 7 4 7 9v10"/>
      <path d="M48 56h44M64 44v12" class="ghost"/><path d="M88 34l4-8h14M98 26v14" />
      <circle cx="36" cy="80" r="10"/><circle cx="90" cy="80" r="10"/><path d="M30 74l12 12M42 74 30 86M84 74l12 12M96 74 84 86" class="ghost"/>`,
    headstand: `<path d="M26 104h68a4 4 0 0 0 4-4v-2H22v2a4 4 0 0 0 4 4z"/>
      <path d="M24 26Q60 10 96 26v6Q60 16 24 32z"/><path d="M26 32c16 12 26 20 26 32v34M94 32c-16 12-26 20-26 32v34"/>
      <path d="M44 38c4 4 8 4 12 0s8-4 12 0 8 4 12 0M54 56c2 3 4 3 6 0s4-3 6 0M54 72c2 3 4 3 6 0s4-3 6 0M54 86c2 3 4 3 6 0s4-3 6 0" class="ghost"/>`,
    rack: `<rect x="10" y="40" width="100" height="14" rx="2" class="ghost"/><path d="M12 54h96" class="ghost"/>
      <path d="M30 60V20M60 60V30M90 60V24" class="ghost"/><path d="M24 20h12M54 30h12M84 24h12" class="ghost"/>
      <ellipse cx="30" cy="62" rx="13" ry="5"/><ellipse cx="60" cy="62" rx="13" ry="5"/><ellipse cx="90" cy="62" rx="13" ry="5"/>
      <path d="M17 62v10c0 2.8 5.8 5 13 5s13-2.2 13-5V62M47 62v10c0 2.8 5.8 5 13 5s13-2.2 13-5V62M77 62v10c0 2.8 5.8 5 13 5s13-2.2 13-5V62"/>`,
  };
  EVARYSTH.shapeSVG = (shape, cls = "") =>
    `<svg class="shape ${cls}" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(SHAPES, shape) ? SHAPES[shape] : SHAPES.tray}</svg>`;

  /* Vignette : photos à faire défiler au doigt (scroll-snap), points = nombre de photos */
  const cardPhotos = p => {
    /* Sans photo : 2 rendus 3D (tools/captures-og.cjs), même carrousel que les photos ;
       sur ordinateur, le 2e angle apparaît au survol */
    const renders = !(p.photos || []).length && p.model;
    const ph = renders ? [1, 2].map(n => ({ src: `assets/vignettes/${p.id}-${n}.webp`, alt: `Aperçu 3D de ${p.name}` })) : p.photos || [];
    if (!ph.length) return "";
    return `<div class="card__photos${renders ? " card__photos--renders" : ""}" data-href="produits/${p.id}/">${ph.map((x, i) =>
      `<img class="card__photo" src="${x.src}" alt="${i ? "" : x.alt}" loading="lazy" decoding="async" draggable="false" style="object-position:${x.pos || "50% 50%"}">`).join("")}</div>${ph.length > 1 ? `
      <button class="card__step card__step--prev" data-step="-1" aria-label="Photo précédente" hidden>‹</button><button class="card__step card__step--next" data-step="1" aria-label="Photo suivante">›</button>
      <div class="card__dots" aria-hidden="true">${ph.map((_, i) => `<i${i ? "" : ' class="is-on"'}></i>`).join("")}</div>` : ""}`;
  };
  /* Rendu 3D manquant : on revient à l'icône */
  document.addEventListener("error", e => {
    const r = e.target instanceof Element && e.target.closest(".card__photos--renders");
    if (!r) return;
    const m = r.parentElement; m.classList.remove("has-photo");
    m.querySelectorAll(".card__photos, .card__step, .card__dots").forEach(x => x.remove());
  }, true);
  /* Survol (souris) d'une carte à rendus : 2e angle, retour au 1er en sortant */
  const hoverRender = (e, i) => {
    if (!matchMedia("(hover: hover)").matches || !(e.target instanceof Element)) return;
    const c = e.target.closest(".card"), t = c && c.querySelector(".card__photos--renders");
    if (t && !(e.relatedTarget instanceof Node && c.contains(e.relatedTarget))) t.scrollTo({ left: i * t.clientWidth, behavior: "smooth" });
  };
  document.addEventListener("mouseover", e => hoverRender(e, 1));
  document.addEventListener("mouseout", e => hoverRender(e, 0));
  /* Défilement des photos dans les vignettes (délégué : marche pour toutes les grilles) */
  const photoIndex = t => Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
  document.addEventListener("scroll", e => {
    const t = e.target;
    if (!(t instanceof Element) || !t.classList.contains("card__photos")) return;
    const i = photoIndex(t), media = t.parentElement, n = t.children.length;
    media.querySelectorAll(".card__dots i").forEach((d, k) => d.classList.toggle("is-on", k === i));
    const prev = media.querySelector(".card__step--prev"), next = media.querySelector(".card__step--next");
    if (prev) prev.hidden = i === 0;
    if (next) next.hidden = i >= n - 1;
  }, true);
  document.addEventListener("click", e => {
    const step = e.target.closest(".card__step");
    if (step) {
      e.preventDefault();
      const t = step.parentElement.querySelector(".card__photos");
      t.scrollTo({ left: (photoIndex(t) + +step.dataset.step) * t.clientWidth, behavior: "smooth" });
      return;
    }
    const t = e.target.closest(".card__photos");
    if (t) location.href = t.dataset.href; /* simple toucher = ouvrir la fiche ; un glissé ne déclenche pas de clic */
  });

  const card = p => `
    <article class="card">
      <a class="card__link" href="produits/${p.id}/" aria-label="${p.name}"></a>
      <div class="card__media${(p.photos && p.photos.length) || p.model ? " has-photo" : ""}" data-u="${p.universe}">${EVARYSTH.shapeSVG(p.shape)}${cardPhotos(p)}<span class="card__badge">Sur-mesure possible</span>
        <button class="fav ${EVARYSTH.favs.has(p.id) ? "is-on" : ""}" data-fav="${p.id}" aria-pressed="${EVARYSTH.favs.has(p.id)}" aria-label="Ajouter ${p.name} aux favoris">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div>
      <div class="card__body">
        <span class="card__u">${EVARYSTH.getUniverse(p.universe).short}</span>
        <h3>${p.name}</h3>
        <p>${p.tagline}</p>
        <div class="card__foot"><span class="price"><small>dès</small> ${fmt(EVARYSTH.prixDes(p))}</span><span class="arrow" aria-hidden="true">→</span></div>
      </div>
    </article>`;

  /* ---------- Accueil ---------- */
  const nHacks = n => n + (n > 1 ? " hacks" : " hack");
  const inFamily = u => EVARYSTH.products.filter(p => p.universe === u.id);
  const heading = u => `<h2>${u.name} <em>${u.sub}</em></h2>`;

  function renderHome() {
    /* Carrousel des univers : une grande carte par famille, à balayer */
    $("#families-root").innerHTML = EVARYSTH.universes.map((u, i) => {
      const list = inFamily(u);
      return `<a class="u-card" data-u="${u.id}" href="univers/${u.id}/" aria-label="${u.name} : ${nHacks(list.length)}" data-slide="${i}">
        <div class="u-card__top"><span class="u-card__code mono">${u.code}</span><span class="u-card__count">${nHacks(list.length)}</span></div>
        <div class="u-card__art" aria-hidden="true">${list.slice(0, 3).map(p => `<span>${EVARYSTH.shapeSVG(p.shape)}</span>`).join("")}</div>
        <div class="u-card__text">
          <h3>${u.name}</h3>
          <p>${u.pitch}</p>
          <ul class="u-card__list">${list.slice(0, 4).map(p => `<li>${p.name}</li>`).join("")}${list.length > 4 ? `<li>et ${list.length - 4} autres…</li>` : ""}</ul>
        </div>
        <span class="u-card__cta">Explorer <span class="arrow" aria-hidden="true">→</span></span>
      </a>`;
    }).join("");
    $("#families-dots").innerHTML = EVARYSTH.universes.map((u, i) =>
      `<button type="button" class="dots__btn" data-goto="${i}" aria-label="Voir ${u.name}"></button>`).join("");
    setupCarousel($("#univers"));

    $("#popular-root").innerHTML = EVARYSTH.products.filter(p => p.popular).map(card).join("") +
      `<a class="card card--more" href="catalogue/"><span>Tout le catalogue</span><span class="arrow" aria-hidden="true">→</span><small>${nHacks(EVARYSTH.products.length)}</small></a>`;
  }

  /* Carrousel : glisser au doigt (scroll-snap), flèches, points, clavier */
  function setupCarousel(root) {
    if (!root) return;
    const track = root.querySelector("[data-track]");
    const slides = [...track.children];
    const dots = [...root.querySelectorAll("[data-goto]")];
    const prev = root.querySelector("[data-prev]"), next = root.querySelector("[data-next]");
    const current = () => {
      const x = track.scrollLeft + parseFloat(getComputedStyle(track).scrollPaddingLeft || 0);
      let best = 0, d = Infinity;
      slides.forEach((s, i) => { const dd = Math.abs(s.offsetLeft - x); if (dd < d) { d = dd; best = i; } });
      return best;
    };
    const go = i => {
      i = Math.max(0, Math.min(slides.length - 1, i));
      const pad = parseFloat(getComputedStyle(track).scrollPaddingLeft || 0);
      track.scrollTo({ left: slides[i].offsetLeft - pad, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    const sync = () => {
      const i = current();
      const max = track.scrollWidth - track.clientWidth - 2;
      dots.forEach((d, k) => d.setAttribute("aria-current", k === i ? "true" : "false"));
      slides.forEach((s, k) => s.classList.toggle("is-current", k === i));
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
    };
    let raf = 0;
    track.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener("resize", sync);
    prev && prev.addEventListener("click", () => go(current() - 1));
    next && next.addEventListener("click", () => go(current() + 1));
    dots.forEach(d => d.addEventListener("click", () => go(+d.dataset.goto)));
    track.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(current() + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(current() - 1); }
    });
    sync();
  }

  /* ---------- Page catalogue : une rangée défilante par famille ---------- */
  function renderCatalogue() {
    $("#catalogue-count").textContent = `Catalogue · ${nHacks(EVARYSTH.products.length)}`;
    $("#catalogue-root").innerHTML = EVARYSTH.universes.map(u => {
      const list = inFamily(u);
      return `<section class="row-block">
        <header class="row-block__head">
          <span class="row-block__code mono" data-u="${u.id}">${u.code}</span>
          <div class="row-block__title">${heading(u)}<p>${u.pitch}</p></div>
          <div class="row-block__tools">
            <a class="link-arrow mono" href="univers/${u.id}/">Voir tout (${list.length}) →</a>
            <button class="icon-btn" data-scroll="-1" aria-label="Précédent">←</button>
            <button class="icon-btn" data-scroll="1" aria-label="Suivant">→</button>
          </div>
        </header>
        <div class="rail" tabindex="0" aria-label="${u.name}">
          ${list.map(card).join("")}
          <a class="card card--more" href="univers/${u.id}/"><span>Voir les ${list.length}</span><span class="arrow" aria-hidden="true">→</span><small>${u.name}</small></a>
        </div>
      </section>`;
    }).join("");
  }

  /* ---------- Page famille ---------- */
  let currentFam = null;
  function renderFamily(id) {
    const u = currentFam = EVARYSTH.getUniverse(id), list = inFamily(u);
    $("#family-view").innerHTML = `
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="catalogue/">Catalogue</a> / <span>${u.name}</span></nav>
      <header class="page-head page-head--u" data-u="${u.id}">
        <span class="mono eyebrow">Univers ${u.code} · ${nHacks(list.length)}</span>
        <h1>${u.name} <em>${u.sub}</em></h1>
        <p>${u.pitch}</p>
      </header>
      <div class="toolbar">
        <span class="mono">${nHacks(list.length)}</span>
        <label class="sort mono">Trier par
          <select id="sort">
            <option value="rec">Sélection</option><option value="asc">Prix croissant</option>
            <option value="desc">Prix décroissant</option><option value="az">Nom A → Z</option>
          </select></label>
      </div>
      <div class="grid" id="family-grid">${list.map(card).join("")}</div>
      <section class="related">
        <h2 class="mono">AUTRES UNIVERS</h2>
        <div class="chips">${EVARYSTH.universes.filter(x => x.id !== id).map(x =>
          `<a class="chip" href="univers/${x.id}/"><span class="mono code">${x.code}</span>${x.name} <em>${x.sub}</em><span class="arrow">→</span></a>`).join("")}</div>
      </section>`;
  }

  const SORTS = {
    rec: l => l, asc: l => [...l].sort((a, b) => EVARYSTH.prixDes(a) - EVARYSTH.prixDes(b)),
    desc: l => [...l].sort((a, b) => EVARYSTH.prixDes(b) - EVARYSTH.prixDes(a)), az: l => [...l].sort((a, b) => a.name.localeCompare(b.name, "fr"))
  };
  document.addEventListener("change", e => {
    if (e.target.id !== "sort") return;
    const fam = currentFam;
    $("#family-grid").innerHTML = SORTS[e.target.value](inFamily(fam)).map(card).join("");
  });

  /* ---------- Favoris ---------- */
  function renderFavorites() {
    document.title = "Evarysth";
    const list = EVARYSTH.favs.all().map(EVARYSTH.getProduct).filter(Boolean);
    $("#family-view").innerHTML = `
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="catalogue/">Catalogue</a> / <span>Favoris</span></nav>
      <header class="page-head"><span class="mono eyebrow">Ma sélection</span><h1>Mes favoris</h1>
        <p>${list.length ? "Vos hacks préférés, gardés de côté sur cet appareil." : "Touchez le cœur d'un produit pour le retrouver ici."}</p></header>
      ${list.length ? `<div class="grid">${list.map(card).join("")}</div>` :
        `<div class="empty-state"><a class="btn btn--primary" href="catalogue/">Parcourir le catalogue</a></div>`}`;
  }
  document.addEventListener("evarysth:favs", () => { if (location.hash === "#favoris") { renderFavorites(); EVARYSTH.syncFavs(); } });

  /* ---------- Page produit ---------- */
  let viewer = null; // viewer 3D de la fiche affichée (libéré à chaque changement de page)
  function disposeViewer() { if (viewer) { viewer.dispose(); viewer = null; } }

  function renderProduct(id) {
    const root = $("#product-root");
    const p = EVARYSTH.getProduct(id);
    const u = EVARYSTH.getUniverse(p.universe);

    const state = {
      mode: "standard",
      variant: 1,
      custom: Object.fromEntries(p.custom.params.map(x => [x.key, x.def])),
      qty: 1,
      color: 0
    };
    const colors = p.colors || [];
    const mat = EVARYSTH.matiere(p);
    const LETTERS = ["A", "B", "C"];
    const photos = p.photos || [];
    /* Cotes communes aux 3 tailles standard (paramètres qui ont un libellé court « court » dans data.js) */
    const coteFixes = p.custom.params.filter(prm => prm.court && new Set(p.variants.options.map(o => o.values[prm.key])).size === 1)
      .map(prm => `${prm.court} ${p.variants.options[0].values[prm.key]} mm`).join(" · ");

    root.innerHTML = `
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="catalogue/">Catalogue</a> / <a href="univers/${u.id}/">${u.name}</a> / <span>${p.name}</span></nav>
      <div class="pdp${p.model ? " pdp--3d" : ""}">
        <div class="pdp__visual">
          <div class="stage" id="stage" data-u="${p.universe}">
            ${EVARYSTH.shapeSVG(p.shape, "shape--xl")}
            ${p.model ? `<div class="viewer3d" id="viewer3d" role="img" aria-label="Aperçu 3D de ${p.name} : faites glisser pour tourner la pièce"></div>` : ""}
            ${p.model ? `
            <label class="stage__open mono" hidden><span>Ouvrir</span><input type="range" id="open3d" min="0" max="100" value="0" style="--p:0%" aria-label="Ouvrir pour voir l'intérieur"></label>` : ""}
            <div class="dims" id="dims"></div>
            <div class="stage__prix" id="stage-prix" aria-hidden="true" hidden><b class="mono" id="stage-prix-val"></b><small class="mono" id="stage-prix-delta"></small></div>
            <span class="stage__mat mono" id="stage-mat">${mat.court} · NOIR MAT</span>
            ${photos.length ? `
            <div class="stage__photos" id="photos" tabindex="-1">
              ${photos.map((ph, i) => `<figure class="stage__photo"><img src="${ph.src}" alt="${ph.alt}" loading="${i ? "lazy" : "eager"}" decoding="async" style="object-position:${ph.pos || "50% 50%"}"></figure>`).join("")}
            </div>
            <button class="stage__nav stage__nav--prev" data-go="-1" aria-label="Vue précédente">‹</button>
            <button class="stage__nav stage__nav--next" data-go="1" aria-label="Vue suivante">›</button>` : ""}
          </div>
          ${photos.length ? `
          <div class="views" id="views" role="tablist" aria-label="Vues du produit">
            <button class="views__btn is-on" role="tab" aria-selected="true" data-view="0" aria-label="${p.model ? "Aperçu 3D sur-mesure" : "Aperçu"}">${EVARYSTH.shapeSVG(p.shape)}<span class="mono">${p.model ? "3D" : "Aperçu"}</span></button>
            ${photos.map((ph, i) => `<button class="views__btn" role="tab" aria-selected="false" data-view="${i + 1}" aria-label="Photo ${i + 1} : ${ph.alt}"><img src="${ph.src}" alt="" loading="lazy" style="object-position:${ph.pos || "50% 50%"}"></button>`).join("")}
            ${p.photosNote ? `<p class="views__note mono">${p.photosNote}</p>` : ""}
          </div>` : ""}
          <ul class="perks">
            <li><b>Sans outil</b><span>Se pose à la main</span></li>
            <li><b>${mat.perk[0]}</b><span>${mat.perk[1]}</span></li>
            <li><b>Garanti 2 ans</b><span>Refait si ça ne va pas</span></li>
          </ul>
        </div>

        <div class="pdp__info">
          <div class="pdp__head">
            <h1>${p.name}</h1>
            <div class="pdp__actions">
              <button class="icon-btn fav ${EVARYSTH.favs.has(p.id) ? "is-on" : ""}" data-fav="${p.id}" aria-pressed="${EVARYSTH.favs.has(p.id)}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
              <button class="icon-btn" data-share aria-label="Partager"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg></button>
            </div>
          </div>
          ${BOUTIQUE_OUVERTE ? "" : `<p class="soon-note">${SOON_NOTE}</p>`}
          <div class="desc"><p class="desc__text" id="desc-text">${p.desc}</p>
            <button type="button" class="link desc__more" id="desc-more" aria-expanded="false" aria-controls="desc-text" hidden>Lire la suite</button></div>
${colors.length ? `
          <div class="colors" role="radiogroup" aria-label="Coloris">
            <span class="label">Coloris <span class="colors__name" id="color-name"></span></span>
            <div class="colors__list">
              ${colors.map((c, i) => `<button type="button" class="swatch" role="radio" data-color="${i}" style="--c:${c.hex}" aria-label="${c.label}" title="${c.label}"></button>`).join("")}
            </div>
          </div>` : ""}

          <div class="segmented" role="group" aria-label="Type de commande">
            <button type="button" data-mode="standard">Standard <small>3 tailles prêtes</small></button>
            <button type="button" data-mode="custom">Sur-mesure <small>À vos dimensions</small></button>
          </div>

          <div class="pane" id="pane-standard">
            <span class="label">${p.variants.label}</span>
            <div class="options">
              ${p.variants.options.map((o, i) => `
                <button type="button" class="opt" data-variant="${i}"><b>${o.label}</b><small>${o.hint}</small><span class="opt__prix mono">${fmt(EVARYSTH.priceFor(p, "standard", o.values))}</span></button>`).join("")}
            </div>
            ${coteFixes ? `<p class="std-note">Toutes les tailles : ${coteFixes}.</p>` : ""}
          </div>

          <div class="pane" id="pane-custom" hidden>
            ${p.custom.params.map((prm, i) => `
              <div class="slider">
                <div class="slider__head">
                  <label for="s-${prm.key}"><span class="mono letter">${LETTERS[i]}</span>${prm.label}</label>
                  <div class="slider__val"><input type="number" id="n-${prm.key}" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${prm.def}" inputmode="${prm.step < 1 ? "decimal" : "numeric"}" aria-describedby="m-${prm.key}"><span>mm</span></div>
                </div>
                <input type="range" id="s-${prm.key}" data-key="${prm.key}" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${prm.def}">
                <span class="slider__bulle mono" id="b-${prm.key}" aria-hidden="true"></span>
                <div class="slider__scale mono"><span>${prm.min}</span><span>${prm.max} mm</span></div>
                <p class="slider__msg" id="m-${prm.key}" aria-live="polite" hidden></p>
              </div>`).join("")}
          </div>

          <div class="buy">
            <div class="qty qty--lg">
              <button data-q="-1" aria-label="Moins">−</button><span id="qty">1</span><button data-q="1" aria-label="Plus">+</button>
            </div>
            <button class="btn btn--primary btn--grow" id="add">Ajouter au panier — <span id="add-price"></span></button>
          </div>
          <p class="legal-note" id="legal-note" hidden>Fabriqué à vos cotes : ni repris ni échangé, sauf défaut. Les cotes saisies font foi. <a href="cgv/#retractation">CGV</a></p>

          <div class="accordion accordion--pdp">
            <details><summary><span>Livraison estimée <b>${deliveryRange()}</b></span></summary><p>Fabriqué à la commande, expédié en général sous 3 à 5 jours ouvrés. Taille standard : 14 jours pour changer d'avis. Sur-mesure : ni repris ni échangé, sauf défaut.</p><p>Garantie légale de conformité, 2 ans : une pièce défectueuse ou non conforme à la commande (taille standard ou dimensions saisies) est réparée, refabriquée ou remboursée. <a href="cgv/">Voir les CGV</a>.</p></details>
            
          </div>
        </div>
      </div>

      <section class="row-block row-block--related">
        <header class="row-block__head">
          <div class="row-block__title"><h2>Dans le même univers</h2><p>${u.name} — ${u.pitch}</p></div>
          <div class="row-block__tools">
            <button class="icon-btn" data-scroll="-1" aria-label="Précédent">←</button>
            <button class="icon-btn" data-scroll="1" aria-label="Suivant">→</button>
          </div>
        </header>
        <div class="rail" tabindex="0" aria-label="Autres hacks ${u.name}">${EVARYSTH.products.filter(x => x.universe === p.universe && x.id !== p.id).map(card).join("")}</div>
      </section>
      <div class="buybar" id="buybar" role="region" aria-label="Achat rapide">
        <div class="buybar__info"><b class="mono" id="buybar-price"></b></div>
        <button type="button" class="btn btn--primary" id="buybar-add">Ajouter au panier</button>
      </div>`;

    const values = () => state.mode === "custom" ? state.custom : p.variants.options[state.variant].values;

    function update() {
      root.querySelectorAll(".segmented [data-mode]").forEach(b => { const on = b.dataset.mode === state.mode; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", on); });
      root.querySelectorAll("[data-variant]").forEach(b => { const on = +b.dataset.variant === state.variant; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", on); });
      $("#pane-standard").hidden = state.mode !== "standard";
      $("#pane-custom").hidden = state.mode !== "custom";

      root.querySelectorAll("[data-color]").forEach(b => { const on = +b.dataset.color === state.color; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
      const col = colors[state.color];
      if (col) { $("#color-name").textContent = col.label; $("#stage-mat").textContent = `${mat.court} · ${col.label.toUpperCase()}`; }

      const v = values();
      const unit = EVARYSTH.priceFor(p, state.mode, v);
      $("#add-price").textContent = fmt(unit * state.qty);
      $("#buybar-price").textContent = fmt(unit * state.qty);
      prixScene(unit, v);
      $("#qty").textContent = state.qty;

      const dimRows = p.custom.params.map((prm, i) => [`${LETTERS[i]} · ${prm.label}`, `${v[prm.key]} mm`]);
      $("#dims").innerHTML = p.custom.params.map((prm, i) =>
        `<span class="dim mono"><i>${LETTERS[i]}</i>${v[prm.key]}<small>mm</small></span>`).join("");

      $("#legal-note").hidden = state.mode !== "custom";
      state._unit = unit; state._dimRows = dimRows;
      if (viewer) viewer.update(v);
      const key = JSON.stringify(v);
      if (state._key && state._key !== key) showView(0); // une cote change : retour sur la 3D
      state._key = key;
    }

    /* Galerie : vue 0 = 3D (ou icône), vues 1..n = photos (glisser au doigt, flèches ou vignettes) */
    let view = 0;
    const track = root.querySelector("#photos");
    function markView(i) {
      view = i;
      root.querySelector("#stage").classList.toggle("is-photo", i > 0);
      root.querySelector("#views")?.classList.toggle("is-photo", i > 0); // la note sur les photos ne s'affiche que devant une photo
      root.querySelectorAll("#views [data-view]").forEach(b => { const on = +b.dataset.view === i; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); });
      root.querySelectorAll(".stage__nav").forEach(b => { b.hidden = (b.dataset.go < 0 && i === 0) || (b.dataset.go > 0 && i === photos.length); });
    }
    function showView(i) {
      if (!track || i === view) return;
      const first = view === 0;
      markView(i);
      if (i > 0) track.scrollTo({ left: (i - 1) * track.clientWidth, behavior: first ? "instant" : "smooth" });
    }

    /* Prix sur-mesure en direct : pastille sur la vue 3D (chiffre qui défile, écart « +2 € »)
       et bulle au-dessus du curseur qu'on déplace. Rien en standard. Sans animation si le système le demande. */
    const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prix = { vu: null, cible: null, anim: 0, delta: 0 };
    function prixScene(unit, v) {
      const box = $("#stage-prix");
      box.hidden = state.mode !== "custom";
      if (box.hidden) { prix.cible = null; return; }
      const avant = prix.cible;
      prix.cible = unit;
      if (avant == null || calme()) { cancelAnimationFrame(prix.anim); prix.vu = unit; $("#stage-prix-val").textContent = fmt(unit); }
      else if (unit !== avant) {
        const d = $("#stage-prix-delta"), e = unit - avant;
        d.textContent = `${e > 0 ? "+" : "−"}${fmt(Math.abs(e))}`;
        d.classList.remove("is-on"); void d.offsetWidth; d.classList.add("is-on");
        clearTimeout(prix.delta); prix.delta = setTimeout(() => d.classList.remove("is-on"), 1200);
        const de = prix.vu, t0 = performance.now();
        cancelAnimationFrame(prix.anim);
        const pas = t => {
          const k = Math.min(1, (t - t0) / 300), x = de + (unit - de) * (1 - (1 - k) ** 3);
          prix.vu = k < 1 ? x : unit;
          $("#stage-prix-val").textContent = fmt(k < 1 ? Math.round(x) : unit);
          if (k < 1) prix.anim = requestAnimationFrame(pas);
        };
        prix.anim = requestAnimationFrame(pas);
      }
    }
    function bulle(prm, range, montrer) {
      const b = $(`#b-${prm.key}`);
      clearTimeout(b._t);
      if (!montrer) { b._t = setTimeout(() => b.classList.remove("is-on"), 700); return; }
      const k = (range.value - prm.min) / (prm.max - prm.min), pouce = 22;
      b.style.left = `${range.offsetLeft + pouce / 2 + k * (range.offsetWidth - pouce)}px`;
      b.style.top = `${range.offsetTop}px`;
      b.textContent = fmt(EVARYSTH.priceFor(p, "custom", values()));
      b.classList.add("is-on");
    }

    function pulse() { const d = $("#dims"); d.classList.remove("pulse"); void d.offsetWidth; d.classList.add("pulse"); }

    root.onclick = e => {
      const m = e.target.closest("[data-mode]");
      if (m) {
        state.mode = m.dataset.mode; update(); pulse();
        /* Mobile + 3D : amène les curseurs juste sous la vue épinglée */
        if (p.model && state.mode === "custom" && matchMedia("(max-width: 900px)").matches) {
          const pane = $("#pane-custom");
          if (pane.getBoundingClientRect().top > innerHeight * .4) document.body.classList.add("header-cache"); // on descend : l'en-tête se masque
          pane.scrollIntoView({ behavior: calme() ? "auto" : "smooth", block: "start" });
        }
      }
      const o = e.target.closest("[data-variant]"); if (o) { state.variant = +o.dataset.variant; update(); pulse(); }
      const c = e.target.closest("[data-color]");
      if (c) { state.color = +c.dataset.color; if (viewer) viewer.setColor(colors[state.color]); showView(0); update(); }
      const q = e.target.closest("[data-q]"); if (q) { state.qty = Math.max(1, Math.min(20, state.qty + +q.dataset.q)); update(); }
    };

    p.custom.params.forEach(prm => {
      const range = $(`#s-${prm.key}`), num = $(`#n-${prm.key}`);
      const paint = () => range.style.setProperty("--p", ((range.value - prm.min) / (prm.max - prm.min)) * 100 + "%");
      range.addEventListener("input", () => { state.custom[prm.key] = +range.value; num.value = range.value; $(`#m-${prm.key}`).hidden = true; num.setAttribute("aria-invalid", "false"); paint(); update(); bulle(prm, range, true); });
      range.addEventListener("pointerdown", () => bulle(prm, range, true));
      for (const ev of ["pointerup", "pointercancel", "change", "blur"]) range.addEventListener(ev, () => bulle(prm, range, false));
      /* Saisie au clavier : appliquée pendant la frappe si elle est dans les bornes (3D recalculée après une courte
         pause) ; hors bornes, vide ou à 0 : message sous le champ, puis valeur corrigée à la validation, jamais en silence */
      const msg = $(`#m-${prm.key}`), bornes = `${prm.min} à ${prm.max} mm`;
      const dire = txt => { msg.textContent = txt || ""; msg.hidden = !txt; num.setAttribute("aria-invalid", txt ? "true" : "false"); };
      const lire = () => num.value.trim() === "" ? NaN : +num.value;
      const appliquer = val => {
        range.value = val; state.custom[prm.key] = val; paint();
        clearTimeout(num._t); num._t = setTimeout(() => { update(); pulse(); }, 250);
      };
      num.addEventListener("input", () => {
        const x = lire();
        if (!x) return dire(`Saisissez une cote entre ${bornes}.`);
        if (x < prm.min || x > prm.max) return dire(`${bornes} : valeur ramenée à ${x < prm.min ? prm.min : prm.max} à la validation.`);
        dire(""); appliquer(Math.round(x / prm.step) * prm.step);
      });
      num.addEventListener("change", () => {
        const x = lire();
        let val;
        if (!x) { val = state.custom[prm.key]; dire(`${bornes} : champ vide ou à 0, cote remise à ${val} mm.`); }
        else {
          val = +(Math.min(prm.max, Math.max(prm.min, Math.round(x / prm.step) * prm.step))).toFixed(3);
          if (x < prm.min || x > prm.max) dire(`${bornes} : valeur ramenée à ${val}.`);
          else if (val !== x) dire(`Cote arrondie à ${val} mm (pas de ${prm.step} mm).`);
          else dire("");
        }
        num.value = val; appliquer(val);
      });
      paint();
    });

    $("#add").addEventListener("click", () => {
      const v = values();
      const variantLabel = state.mode === "custom" ? "" : p.variants.options[state.variant].label;
      const details = state.mode === "custom"
        ? p.custom.params.map(prm => [prm.label, `${v[prm.key]} mm`])
        : [[p.variants.label, `${variantLabel} (${p.variants.options[state.variant].hint})`]];
      const col = colors[state.color];
      if (col) details.push(["Coloris", col.label]);
      EVARYSTH.cart.add({
        key: [p.id, state.mode, variantLabel, JSON.stringify(v), col ? col.id : ""].join("|"),
        id: p.id, name: p.name, shape: p.shape, mode: state.mode,
        variant: state.mode === "custom" ? null : state.variant, color: col ? col.id : null,
        values: { ...v }, details,
        summary: details.map(d => `${d[0]} : ${d[1]}`).join(", "),
        unitPrice: state._unit, qty: state.qty
      });
      window.evarysthTrack("Ajout panier", { produit: p.id, type: state.mode, prix: state._unit * state.qty });
    });

    if (track) {
      root.querySelector("#views").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) showView(+b.dataset.view); });
      root.querySelectorAll(".stage__nav").forEach(b => b.addEventListener("click", () => showView(Math.max(0, Math.min(photos.length, view + +b.dataset.go)))));
      let t;
      track.addEventListener("scroll", () => {
        clearTimeout(t);
        t = setTimeout(() => { if (view > 0) markView(Math.round(track.scrollLeft / track.clientWidth) + 1); }, 80);
      }, { passive: true });
      markView(0);
    }

    /* Mobile : la vue 3D n'est épinglée sous l'en-tête que tant que les curseurs sur-mesure sont visibles sous elle
       (CSS : .pdp--3d.is-pinned, écrans ≤ 900 px ; sans effet au-delà) */
    if (p.model && window.IntersectionObserver) {
      const pdp = root.querySelector(".pdp"), stage = $("#stage"), pane = $("#pane-custom");
      let io = null, t = 0;
      const watch = () => {
        if (io) io.disconnect();
        const haut = Math.round(stage.offsetHeight + 24); // zone couverte par la vue épinglée (l'en-tête peut être masqué)
        io = new IntersectionObserver(([en]) => pdp.classList.toggle("is-pinned", en.isIntersecting), { rootMargin: `-${haut}px 0px 0px 0px` });
        io.observe(pane);
      };
      watch();
      addEventListener("resize", () => { clearTimeout(t); t = setTimeout(watch, 200); });
    }

    /* Mobile : le prix n'est dit qu'une fois, à côté de l'achat : dans le bouton de la page, et dans la barre d'achat fixe
       (prix + bouton) tant que ce bouton est hors écran (CSS : ≤ 900 px ; masquée panier, modale ou menu ouverts, et pendant
       la saisie d'une cote au clavier) */
    const bar = $("#buybar");
    $("#buybar-add").addEventListener("click", () => $("#add").click());
    if (window.IntersectionObserver) new IntersectionObserver(([en]) => {
      const bouton = en.intersectionRatio >= 0.5; // une simple bande du bouton ne compte pas : son prix doit être lisible
      bar.classList.toggle("is-on", !bouton);
      document.body.classList.toggle("has-buybar", !bouton);
    }, { threshold: [0, 0.5, 1] }).observe($("#add"));
    root.addEventListener("focusin", e => { if (e.target.matches("input[type=number]")) bar.classList.add("is-typing"); });
    root.addEventListener("focusout", e => { if (e.target.matches("input[type=number]")) bar.classList.remove("is-typing"); });

    /* Description coupée à 3 lignes sur mobile (CSS) : « Lire la suite » seulement si le texte dépasse */
    const descTxt = $("#desc-text"), descBtn = $("#desc-more"), etroit = matchMedia("(max-width: 900px)");
    const descFit = () => {
      descBtn.hidden = !etroit.matches || (!descTxt.classList.contains("is-open") && descTxt.scrollHeight <= descTxt.clientHeight + 1);
    };
    descBtn.addEventListener("click", () => {
      const open = descTxt.classList.toggle("is-open");
      descBtn.setAttribute("aria-expanded", open);
      descBtn.textContent = open ? "Réduire" : "Lire la suite";
      if (!open) descFit();
    });
    descFit();
    etroit.addEventListener("change", descFit);
    if (document.fonts) document.fonts.ready.then(descFit);

    disposeViewer();
    if (p.model && EVARYSTH.viewer3d) {
      viewer = EVARYSTH.viewer3d.mount($("#viewer3d"), p.model, p.custom.params, build => {
        $("#stage").classList.add("is-3d");
        const lab = $("#open3d") && $("#open3d").closest(".stage__open");
        if (lab) lab.hidden = !build.openable;   // curseur « Ouvrir » seulement pour les modèles articulés
      }, {
        jeu: EVARYSTH.jeu(p),   // jeu d'ajustement de la matière : l'aperçu est la pièce fabriquée
        /* 3D impossible (WebGL, WASM ou réseau) : 1re photo, sinon vignette 3D du catalogue, et un message court */
        onError: () => {
          const box = $("#viewer3d"), ph = photos[0] || { src: `assets/vignettes/${p.id}-1.webp`, alt: `Aperçu de ${p.name}` };
          if (!box) return;
          box.classList.add("viewer3d--repli");
          box.removeAttribute("role"); box.removeAttribute("aria-label");
          box.innerHTML = `<img${photos[0] ? "" : ' class="is-rendu"'} src="${ph.src}" alt="${ph.alt}" style="object-position:${ph.pos || "50% 50%"}"><p class="viewer3d__msg mono">Aperçu 3D indisponible sur ce navigateur</p>`;
          $("#stage").classList.add("is-repli");
        }
      });
      if (colors.length) viewer.setColor(colors[state.color]);
      const open3d = $("#open3d");
      if (open3d) open3d.addEventListener("input", () => {
        open3d.style.setProperty("--p", open3d.value + "%");
        viewer.setOpen(open3d.value / 100);
      });
    }

    update();
  }

  /* Fiche produit, écrans ≤ 900 px : l'en-tête se masque quand on descend, revient quand on remonte
     (body.header-cache ; le CSS ne l'applique que sous 900 px). Toujours visible en haut de page, panier,
     modale ou menu ouverts, ou si le focus clavier y entre. */
  function enteteMobile() {
    const header = $(".site-header"), etroit = matchMedia("(max-width: 900px)"), b = document.body;
    if (!header) return;
    let y0 = scrollY, raf = 0;
    addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = scrollY, d = y - y0;
        if (!etroit.matches || y < header.offsetHeight + 16 || b.matches(".cart-open, .modal-open, .menu-open")) { b.classList.remove("header-cache"); y0 = y; return; }
        if (Math.abs(d) < 8) return;
        b.classList.toggle("header-cache", d > 0); y0 = y;
      });
    }, { passive: true });
    header.addEventListener("focusin", () => b.classList.remove("header-cache"));
  }

  function deliveryRange() {
    const f = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); };
    return `entre le ${f(6)} et le ${f(9)}`;
  }

  /* Routage par ancre sur l'accueil : #favoris, sinon accueil (et ses sections #faq, #etapes…).
     Pages générées par tools/generer-pages.mjs : catalogue/, univers/<id>/, produits/<id>/.
     Les anciennes ancres #catalogue, #f-<id>, #p-<id> redirigent vers ces pages. */
  const HOME_TITLE = document.title;
  const VIEWS = ["home-view", "family-view"];
  function show(id) { VIEWS.forEach(v => { $("#" + v).hidden = v !== id; }); }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const prod = h.startsWith("p-") && EVARYSTH.getProduct(h.slice(2));
    if (prod) { location.replace(`produits/${prod.id}/`); return; } /* anciens liens */
    const fam = h.startsWith("f-") && EVARYSTH.getUniverse(h.slice(2));
    if (fam) { location.replace(`univers/${fam.id}/`); return; }
    if (h === "catalogue") { location.replace("catalogue/"); return; }
    let top = true, nav = "";
    disposeViewer();
    if (h === "favoris") { show("family-view"); renderFavorites(); nav = ""; }
    else {
      show("home-view"); document.title = HOME_TITLE;
      const target = h && document.getElementById(h);
      if (target) { target.scrollIntoView(); top = false; }
    }
    if (top) window.scrollTo({ top: 0, behavior: "instant" });
    EVARYSTH.syncFavs();
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("is-current", a.dataset.nav === nav));
    window.evarysthTrack();
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-scroll]"); if (!b) return;
    const rail = b.closest(".row-block").querySelector(".rail");
    rail.scrollBy({ left: +b.dataset.scroll * rail.clientWidth * .85, behavior: "smooth" });
  });

  document.addEventListener("DOMContentLoaded", () => {
    /* Hauteur de l'en-tête collant, pour épingler la vue 3D juste dessous sur mobile */
    const header = $(".site-header");
    if (header && window.ResizeObserver) new ResizeObserver(() =>
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px")).observe(header);
    /* Accueil : schéma du hero piloté par un curseur (cote de rambarde, en mm) */
    const range = $("#hero-range");
    if (range) {
      const sizes = [[30, "Fine", "20–40 mm"], [50, "Moyenne", "40–60 mm"], [70, "Large", "60–80 mm"]];
      const notes = { standard: "3 tailles prêtes · prix affiché", custom: "Imprimé à vos cotes · sans supplément" };
      const rail = $("#hv-rail"), part = $("#hv-part"), dim = $("#hv-dim"), svg = $("#hero-svg");
      let mode = "custom", shown = 47, target = 47, raf = 0;
      /* La rambarde s'agrandit vers la gauche et le haut ; le bord côté pot reste fixe */
      const draw = a => {
        const w = 30 + a * .6, x = 262 - w, y = 242 - w, L = x - 14, T = y - 16, d = T - 48;
        rail.setAttribute("x", x); rail.setAttribute("y", y); rail.setAttribute("width", w); rail.setAttribute("height", w);
        part.setAttribute("d", `M${L} 290V${T}H276V290H420V246`);
        dim.setAttribute("d", `M${x} ${d}H262M${x} ${d - 10}v20M262 ${d - 10}v20`);
      };
      const tick = () => {
        shown += (target - shown) * .25;
        if (Math.abs(target - shown) < .2) shown = target;
        draw(shown);
        raf = shown === target ? 0 : requestAnimationFrame(tick);
      };
      const set = (a, animate = true) => {
        const size = mode === "standard" ? sizes.reduce((b, s) => Math.abs(s[0] - a) < Math.abs(b[0] - a) ? s : b) : null;
        if (size) a = size[0];
        target = a; range.value = a;
        range.style.setProperty("--p", (a - range.min) / (range.max - range.min) * 100 + "%");
        $("#hero-dim-label").textContent = size ? "Taille " + size[1] : "Votre rambarde";
        $("#hero-dim-val").textContent = size ? size[2] : a + " mm";
        range.setAttribute("aria-valuetext", size ? `Taille ${size[1]}, ${size[2]}` : a + " millimètres");
        svg.setAttribute("aria-label", `Support jardinière clipsé sur une rambarde de ${size ? size[2] : a + " millimètres"}`);
        if (!animate) { shown = a; draw(a); } else if (!raf) raf = requestAnimationFrame(tick);
      };
      range.addEventListener("input", () => set(+range.value));
      document.addEventListener("click", e => {
        const b = e.target.closest("[data-hero-mode]");
        if (!b) return;
        mode = b.dataset.heroMode;
        document.querySelectorAll("[data-hero-mode]").forEach(x => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", on); });
        $("#hero-mode-note").textContent = notes[mode];
        set(+range.value);
      });
      set(47, false);
      /* Invitation : un aller-retour unique quand le hero est visible, tant qu'on n'y a pas touché */
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches && window.IntersectionObserver) {
        let touched = false;
        range.addEventListener("pointerdown", () => touched = true, { once: true });
        const io = new IntersectionObserver(([en]) => {
          if (!en.isIntersecting) return;
          io.disconnect();
          setTimeout(() => { if (!touched) set(72); }, 900);
          setTimeout(() => { if (!touched) set(47); }, 1900);
        }, { threshold: .6 });
        io.observe(svg);
      }
    }
    /* Page fiche produit : <body data-product-id="…"> */
    const pid = document.body.dataset.productId;
    if (pid) {
      const p = EVARYSTH.getProduct(pid);
      if (!p) return;
      renderProduct(p.id); EVARYSTH.syncFavs(); enteteMobile();
      document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("is-current", a.dataset.nav === "f-" + p.universe));
      window.evarysthTrack();
      return;
    }
    const markNav = id => document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("is-current", a.dataset.nav === id));
    /* Page univers : <body data-universe-id="…"> ; page catalogue : <body data-page="catalogue"> */
    const uid = document.body.dataset.universeId;
    if (uid && EVARYSTH.getUniverse(uid)) { renderFamily(uid); EVARYSTH.syncFavs(); markNav("f-" + uid); window.evarysthTrack(); return; }
    if (document.body.dataset.page === "catalogue") { renderCatalogue(); EVARYSTH.syncFavs(); markNav("catalogue"); window.evarysthTrack(); return; }
    if (!$("#home-view")) return; /* autre page générée (404) */
    renderHome(); route();
    window.addEventListener("hashchange", route);
  });
})();
