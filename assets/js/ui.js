/* Evarysth — confort d'usage : thème, recherche, favoris, notifications, modales */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* indisponible */ } }
  };
  EVARYSTH.store = store;

  /* ---------- Notifications ---------- */
  EVARYSTH.toast = (msg, soon) => {
    const t = document.createElement("div");
    t.className = "toast" + (soon ? " toast--soon" : "");
    t.innerHTML = (soon ? '<span class="mono">Bientôt</span>' : "") + `<span>${msg}</span>`;
    $("#toasts").appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, 2800);
  };
  /* Fonction pas encore active : on l'indique clairement */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-soon]"); if (!el) return;
    e.preventDefault();
    EVARYSTH.toast(`${el.dataset.soon || "Cette fonction"} — bientôt disponible.`, true);
  });

  /* ---------- Modale ---------- */
  EVARYSTH.modal = (html, cls = "") => {
    closeModal();
    document.body.insertAdjacentHTML("beforeend", `
      <div class="modal-wrap" id="modal"><div class="modal-bg" data-modal-close></div>
      <div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`);
    document.body.classList.add("modal-open");
    const f = $("#modal input, #modal button"); if (f) f.focus();
  };
  function closeModal() { const m = $("#modal"); if (m) m.remove(); document.body.classList.remove("modal-open"); }
  EVARYSTH.closeModal = closeModal;
  document.addEventListener("click", e => { if (e.target.closest("[data-modal-close]")) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

  /* ---------- Thème clair / sombre ---------- */
  document.addEventListener("click", e => {
    if (!e.target.closest("[data-theme-toggle]")) return;
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("evarysth.theme", next);
  });

  /* ---------- Menu mobile (bouton ☰ affiché sous 900 px) : catalogue, univers, thème ---------- */
  (function menu() {
    const btn = $("[data-menu-open]");
    if (!btn) return;
    const b = document.body, here = location.pathname.replace(/index\.html$/, "");
    const prod = b.dataset.productId && EVARYSTH.getProduct(b.dataset.productId);
    const lien = (href, titre, sous, id) => {
      const cur = here.endsWith("/" + href) ? "page" : (prod && prod.universe === id ? "true" : "");
      return `<a href="${href}"${cur ? ` aria-current="${cur}"` : ""}>${esc(titre)}${sous ? `<small>${esc(sous)}</small>` : ""}</a>`;
    };
    b.insertAdjacentHTML("beforeend", `
      <div class="menu-overlay" data-menu-close></div>
      <aside class="drawer drawer--menu" id="menu" role="dialog" aria-modal="true" aria-label="Menu">
        <header class="drawer__head"><b>Menu</b><button class="icon-btn" data-menu-close aria-label="Fermer le menu">✕</button></header>
        <nav class="menu__nav" aria-label="Catalogue et univers">
          ${lien("catalogue/", "Catalogue", "Toutes les pièces")}
          ${EVARYSTH.universes.map(u => lien(`univers/${u.id}/`, u.name, u.pitch, u.id)).join("")}
          <div class="menu__outils">
            <button type="button" data-search-open data-menu-close>Rechercher</button>
            <a href="#favoris">Mes favoris</a>
          </div>
        </nav>
        <div class="menu__foot"><button type="button" class="btn" data-theme-toggle><span class="ico-moon">Passer en thème sombre</span><span class="ico-sun">Passer en thème clair</span></button></div>
      </aside>`);
    const drawer = $("#menu");
    let retour = null;
    const ouvert = () => b.classList.contains("menu-open");
    const ouvrir = () => {
      retour = document.activeElement;
      b.classList.add("menu-open");
      btn.setAttribute("aria-expanded", "true");
      drawer.querySelector("a").focus();
    };
    const fermer = () => {
      if (!ouvert()) return;
      b.classList.remove("menu-open");
      btn.setAttribute("aria-expanded", "false");
      if (retour && retour.focus) retour.focus();
    };
    document.addEventListener("click", e => {
      if (e.target.closest("[data-menu-open]")) ouvrir();
      else if (e.target.closest("[data-menu-close]") || e.target.closest("#menu a")) fermer();
    });
    document.addEventListener("keydown", e => {
      if (!ouvert()) return;
      if (e.key === "Escape") { fermer(); return; }
      if (e.key !== "Tab") return;
      /* Focus gardé dans le tiroir */
      const f = [...drawer.querySelectorAll("a[href], button")], first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    matchMedia("(max-width: 900px)").addEventListener("change", e => { if (!e.matches) fermer(); });
  })();

  /* ---------- Favoris ---------- */
  const FKEY = "evarysth.favs.v1";
  let favs = store.get(FKEY, []);
  EVARYSTH.favs = {
    has: id => favs.includes(id),
    all: () => favs.slice(),
    toggle(id) {
      favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
      store.set(FKEY, favs); sync();
      document.dispatchEvent(new CustomEvent("evarysth:favs"));
      return favs.includes(id);
    }
  };
  function sync() {
    document.querySelectorAll("[data-fav]").forEach(b => {
      const on = favs.includes(b.dataset.fav);
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on);
    });
    document.querySelectorAll("[data-fav-count]").forEach(el => { el.textContent = favs.length; el.hidden = !favs.length; });
  }
  EVARYSTH.syncFavs = sync;
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-fav]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const p = EVARYSTH.getProduct(b.dataset.fav);
    const on = EVARYSTH.favs.toggle(b.dataset.fav);
    EVARYSTH.toast(on ? `${p.name} ajouté aux favoris` : `${p.name} retiré des favoris`);
  });
  document.addEventListener("DOMContentLoaded", sync);

  /* ---------- Partage ---------- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-share]"); if (!b) return;
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); EVARYSTH.toast("Lien copié dans le presse-papiers"); }
    } catch { EVARYSTH.toast("Copiez le lien dans la barre d'adresse pour le partager"); }
  });

  /* ---------- Guide de mesure ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-measure]"); if (!b) return;
    const p = EVARYSTH.getProduct(b.dataset.measure);
    EVARYSTH.modal(`
      <button class="icon-btn modal__x" data-modal-close aria-label="Fermer">✕</button>
      <span class="mono eyebrow">Guide de mesure</span>
      <h2>Mesurer pour « ${esc(p.name)} »</h2>
      <ol class="guide">
        ${p.custom.outil
          ? `<li><b>Préparez de quoi mesurer</b><span>${esc(p.custom.outil)}</span></li>`
          : `<li><b>Prenez un mètre ruban</b><span>Un simple mètre de couturière ou de bricolage suffit, pas besoin de pied à coulisse.</span></li>`}
        ${p.custom.params.map((prm, i) => prm.aide
          /* Aide propre à la cote (data.js : aide, schema facultatif) ; sinon consigne générique */
          ? `<li><b>${"ABC"[i]} · ${esc(prm.label)}</b><span>${esc(prm.aide)} Entre ${prm.min} et ${prm.max} mm.</span>${prm.schema ? prm.schema.replace("<svg ", '<svg class="guide__schema" aria-hidden="true" ') : ""}</li>`
          : `<li><b>${esc(prm.label)}</b><span>Mesurez en millimètres (1 cm = 10 mm), entre ${prm.min} et ${prm.max} mm. Mesurez deux fois, au point le plus large.</span></li>`).join("")}
        <li><b>Réglez les curseurs</b><span>Ne vous souciez pas du jeu : on ajoute nous-mêmes la tolérance pour que la pièce s'ajuste parfaitement.</span></li>
      </ol>
      <button class="btn btn--primary btn--block" data-modal-close>C'est compris</button>`);
  });

  /* ---------- Recherche ---------- */
  function openSearch() {
    EVARYSTH.modal(`
      <div class="search">
        <div class="search__bar">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="q" type="search" placeholder="Rechercher un hack : câble, balcon, tiroir…" autocomplete="off">
          <button class="icon-btn" data-modal-close aria-label="Fermer">✕</button>
        </div>
        <div class="search__chips" id="q-chips">
          ${EVARYSTH.universes.map(u => `<a class="chip" href="univers/${u.id}/" data-modal-close>${esc(u.name)}</a>`).join("")}
        </div>
        <ul class="search__list" id="q-list"></ul>
      </div>`, "modal--top");
    const input = $("#q"), list = $("#q-list");
    const render = () => {
      const q = norm(input.value.trim());
      $("#q-chips").hidden = !!q;
      const hits = !q ? EVARYSTH.products.slice(0, 5) : EVARYSTH.products.filter(p =>
        norm([p.name, p.tagline, p.desc, EVARYSTH.getUniverse(p.universe).name].join(" ")).includes(q));
      list.innerHTML = (!q ? '<li class="search__label mono">Suggestions</li>' : "") + (hits.length ? hits.map(p => `
        <li><a href="produits/${p.id}/" data-modal-close>
          <span class="search__thumb">${EVARYSTH.shapeSVG(p.shape)}</span>
          <span><b>${esc(p.name)}</b><small>${esc(EVARYSTH.getUniverse(p.universe).name)}</small></span>
          <span class="mono">dès ${EVARYSTH.fmt(EVARYSTH.prixDes(p))}</span></a></li>`).join("")
        : `<li class="search__empty">Aucun résultat pour « ${esc(input.value)} ». Essayez « câble », « balcon » ou « tiroir ».</li>`);
    };
    input.addEventListener("input", render); render();
  }
  document.addEventListener("click", e => { if (e.target.closest("[data-search-open]")) openSearch(); });
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });

})();
