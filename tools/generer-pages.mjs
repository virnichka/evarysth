#!/usr/bin/env node
/* Evarysth — génère les pages statiques à partir de index.html (gabarit) et assets/js/data.js :
     catalogue/index.html, univers/<id>/index.html  pages catalogue et univers (même principe)
     produits/<id>/index.html  une vraie page par produit (titre, description, aperçu de partage,
                               données structurées, texte lisible sans JavaScript) ; app.js y
                               construit ensuite la fiche complète (3D, curseurs, prix, panier).
     cgv/, mentions-legales/, confidentialite/  pages légales (texte dans tools/pages-legales/<id>.html)
     sitemap.xml, 404.html
   Usage : node tools/generer-pages.mjs          (écrit les fichiers)
           node tools/generer-pages.mjs --check  (échoue si un fichier n'est pas à jour, pour la CI)
   À relancer après toute modification de data.js ou de index.html. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://evarysth.fr";
const CHECK = process.argv.includes("--check");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

/* Catalogue : data.js exécuté dans un bac à sable avec un faux `window` */
const sandbox = {};
sandbox.window = sandbox; /* comme dans un navigateur : window.EVARYSTH = EVARYSTH global */
vm.createContext(sandbox);
vm.runInContext(read("assets/js/data.js"), sandbox);
const E = sandbox.window.EVARYSTH;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = n => E.fmt(n).replace(/\u202f|\u00a0/g, " ");
const exists = f => fs.existsSync(path.join(ROOT, f));
const ogImage = id => SITE + "/" + (exists(`assets/og/${id}.jpg`) ? `assets/og/${id}.jpg` : "assets/og/accueil.jpg");

const tpl = read("index.html");
const BANNER = "<!-- Fichier généré par tools/generer-pages.mjs à partir de index.html et data.js : ne pas modifier à la main. -->\n";

function page({ base, bodyAttr, head, main }) {
  let s = tpl;
  const a = s.indexOf("  <!-- seo"), b = s.indexOf("<!-- /seo -->\n") + "<!-- /seo -->\n".length;
  const m1 = s.indexOf("  <main>"), m2 = s.indexOf("</main>\n") + "</main>\n".length;
  if (a < 0 || b < a || m1 < 0 || m2 < m1) throw new Error("index.html : repères <!-- seo --> ou <main> introuvables");
  s = s.slice(0, a) + head + s.slice(b, m1) + main + s.slice(m2);
  /* base : tous les chemins relatifs (assets/…, #catalogue, produits/…) partent de la racine du site */
  s = s.replace('<meta charset="utf-8">\n', `<meta charset="utf-8">\n  <base href="${base}">\n`);
  s = s.replace("<body>", `<body${bodyAttr}>`);
  return s.replace("<!DOCTYPE html>\n", "<!DOCTYPE html>\n" + BANNER);
}

function productPage(p) {
  const u = E.getUniverse(p.universe);
  const url = `${SITE}/produits/${p.id}/`;
  const title = `${p.name} sur-mesure — Evarysth`;
  const tail = ` Dès ${fmt(p.price)}, en taille standard ou à vos cotes.`;
  const long = `${p.tagline} ${p.desc}${tail}`; /* ~160 caractères visibles dans les résultats */
  const desc = long.length <= 170 ? long : p.tagline + tail;
  const img = ogImage(p.id);
  const ld = [{
    "@context": "https://schema.org", "@type": "Product",
    name: p.name, description: `${p.tagline} ${p.desc}`, sku: p.id, category: u.name,
    image: [img, ...(p.photos || []).map(x => `${SITE}/${x.src}`)],
    brand: { "@type": "Brand", name: "Evarysth" },
    offers: { "@type": "Offer", url, price: p.price.toFixed(2), priceCurrency: "EUR" }
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Catalogue", item: `${SITE}/catalogue/` },
      { "@type": "ListItem", position: 2, name: u.name, item: `${SITE}/univers/${u.id}/` },
      { "@type": "ListItem", position: 3, name: p.name, item: url }
    ]
  }];
  const head = `  <title>Evarysth</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Evarysth">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="${esc(p.name)} — Evarysth">
  <meta property="og:description" content="${esc(p.tagline)} Dès ${esc(fmt(p.price))}, sur-mesure possible.">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(p.name)}">
  <meta property="product:price:amount" content="${p.price.toFixed(2)}">
  <meta property="product:price:currency" content="EUR">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
`;
  /* Contenu lisible sans JavaScript (robots, aperçus) ; app.js le remplace par la fiche complète */
  const photo = (p.photos || [])[0];
  const main = `  <main>
   <div id="product-root" class="product">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="catalogue/">Catalogue</a> / <a href="univers/${u.id}/">${esc(u.name)}</a> / <span>${esc(p.name)}</span></nav>
    <article class="pdp-static">
      <h1>${esc(p.name)}</h1>
      <p>${esc(p.tagline)}</p>
      <p>${esc(p.desc)}</p>
      <p>Dès ${esc(fmt(p.price))} en taille standard (${esc(p.variants.label.toLowerCase())} : ${p.variants.options.map(o => `${esc(o.label)} ${esc(o.hint)}`).join(", ")}), ou sur-mesure à vos cotes.</p>
      ${photo ? `<img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="800" loading="lazy">` : ""}
      <noscript><p>Activez JavaScript pour voir la pièce en 3D, régler vos cotes et commander.</p></noscript>
    </article>
   </div>
  </main>
`;
  return page({ base: "../../", bodyAttr: ` data-product-id="${p.id}"`, head, main });
}

/* En-tête commun aux pages liste (catalogue, univers) */
function listHead({ title, desc, url, ogTitle, ld }) {
  return `  <title>Evarysth</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Evarysth">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/assets/og/accueil.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
`;
}
const inU = u => E.products.filter(p => p.universe === u.id);
const nHacks = n => `${n} hack${n > 1 ? "s" : ""}`;
const itemList = list => ({ "@type": "ItemList", itemListElement: list.map((p, i) =>
  ({ "@type": "ListItem", position: i + 1, url: `${SITE}/produits/${p.id}/`, name: p.name })) });
/* Liste lisible sans JavaScript ; app.js la remplace par les cartes */
const staticList = list => `<ul class="list-static">${list.map(p =>
  `<li><a href="produits/${p.id}/">${esc(p.name)}</a> — ${esc(p.tagline)} <span>Dès ${esc(fmt(p.price))}</span></li>`).join("")}</ul>`;

function cataloguePage() {
  const url = `${SITE}/catalogue/`;
  const head = listHead({
    title: "Catalogue — tous les hacks d'intérieur sur-mesure | Evarysth",
    desc: `${nHacks(E.products.length)} imprimés en 3D, en taille standard ou à vos cotes : ${E.universes.map(u => u.name.toLowerCase()).join(", ")}.`,
    url, ogTitle: "Catalogue Evarysth",
    ld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Catalogue Evarysth", url, mainEntity: itemList(E.products) }
  });
  const main = `  <main>
   <div id="catalogue-view">
    <header class="page-head">
      <span class="mono eyebrow" id="catalogue-count">Catalogue · ${nHacks(E.products.length)}</span>
      <h1>Tous nos hacks</h1>
      <p>Balayez chaque univers, ou ouvrez-le pour tout voir d'un coup.</p>
    </header>
    <div id="catalogue-root">
${E.universes.map(u => `     <section class="row-block"><h2><a href="univers/${u.id}/">${esc(u.name)}</a></h2><p>${esc(u.pitch)}</p>${staticList(inU(u))}</section>`).join("\n")}
    </div>
   </div>
  </main>
`;
  return page({ base: "../", bodyAttr: ' data-page="catalogue"', head, main });
}

function universePage(u) {
  const url = `${SITE}/univers/${u.id}/`, list = inU(u);
  const head = listHead({
    title: `${u.name} : ${nHacks(list.length)} sur-mesure | Evarysth`,
    desc: `${u.pitch} ${list.slice(0, 4).map(p => p.name).join(", ")}… Dès ${fmt(Math.min(...list.map(p => p.price)))}, standard ou à vos cotes.`,
    url, ogTitle: `${u.name} — Evarysth`,
    ld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: u.name, url, mainEntity: itemList(list) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Catalogue", item: `${SITE}/catalogue/` },
        { "@type": "ListItem", position: 2, name: u.name, item: url }] }]
  });
  const main = `  <main>
   <div id="family-view">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="catalogue/">Catalogue</a> / <span>${esc(u.name)}</span></nav>
    <header class="page-head page-head--u" data-u="${u.id}">
      <span class="mono eyebrow">Univers ${u.code} · ${nHacks(list.length)}</span>
      <h1>${esc(u.name)} <em>${esc(u.sub)}</em></h1>
      <p>${esc(u.pitch)}</p>
    </header>
    ${staticList(list)}
   </div>
  </main>
`;
  return page({ base: "../../", bodyAttr: ` data-universe-id="${u.id}"`, head, main });
}

function notFoundPage() {
  const head = `  <title>Evarysth</title>
  <meta name="robots" content="noindex">
`;
  const main = `  <main>
   <div class="product">
    <article class="pdp-static">
      <h1>Page introuvable</h1>
      <p>Cette adresse n'existe pas (ou plus). Le produit a peut-être changé de nom.</p>
      <p><a class="btn btn--primary" href="catalogue/">Voir le catalogue</a></p>
    </article>
   </div>
  </main>
`;
  return page({ base: "/", bodyAttr: ' data-page="404"', head, main });
}

/* Pages légales : le corps de l'article est écrit dans tools/pages-legales/<id>.html */
const LEGAL = [
  { id: "cgv", title: "Conditions générales de vente",
    desc: "Conditions générales de vente Evarysth : commande, prix, livraison, droit de rétractation, sur-mesure, garanties légales et médiation." },
  { id: "mentions-legales", title: "Mentions légales",
    desc: "Mentions légales du site Evarysth : éditeur, hébergement, prestataires de paiement et propriété intellectuelle." },
  { id: "confidentialite", title: "Politique de confidentialité",
    desc: "Données personnelles chez Evarysth : ce qui est collecté, pourquoi, combien de temps, par qui, et comment exercer vos droits." }
];

function legalPage(l) {
  const url = `${SITE}/${l.id}/`;
  const head = `  <title>Evarysth</title>
  <meta name="description" content="${esc(l.desc)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Evarysth">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="${esc(l.title)} — Evarysth">
  <meta property="og:description" content="${esc(l.desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/assets/og/accueil.jpg">
`;
  const main = `  <main>
   <article class="legal" id="${l.id}">
${read(`tools/pages-legales/${l.id}.html`).trimEnd()}
   </article>
  </main>
`;
  return page({ base: "../", bodyAttr: ` data-page="${l.id}"`, head, main });
}

function sitemap() {
  const urls = [`${SITE}/`, `${SITE}/catalogue/`, ...E.universes.map(u => `${SITE}/univers/${u.id}/`), ...E.products.map(p => `${SITE}/produits/${p.id}/`),
    ...LEGAL.map(l => `${SITE}/${l.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

/* Écriture (ou vérification) */
const out = new Map();
for (const p of E.products) out.set(`produits/${p.id}/index.html`, productPage(p));
out.set("catalogue/index.html", cataloguePage());
for (const u of E.universes) out.set(`univers/${u.id}/index.html`, universePage(u));
for (const l of LEGAL) out.set(`${l.id}/index.html`, legalPage(l));
out.set("404.html", notFoundPage());
out.set("sitemap.xml", sitemap());

const stale = [];
for (const [f, content] of out) {
  const abs = path.join(ROOT, f);
  const cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  if (cur === content) continue;
  stale.push(f);
  if (!CHECK) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); }
}
/* Pages de produits ou d'univers retirés du catalogue */
for (const top of ["produits", "univers"]) {
  const dir = path.join(ROOT, top);
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (out.has(`${top}/${d}/index.html`)) continue;
    stale.push(`${top}/${d}/ (retiré)`);
    if (!CHECK) fs.rmSync(path.join(dir, d), { recursive: true });
  }
}

if (CHECK && stale.length) {
  console.error("Pages à régénérer (node tools/generer-pages.mjs) :\n  " + stale.join("\n  "));
  process.exit(1);
}
console.log(CHECK ? "Pages à jour." : `${stale.length} fichier(s) écrit(s) ou supprimé(s) sur ${out.size}.`);
