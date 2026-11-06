#!/usr/bin/env node
/* Evarysth — génère les pages statiques à partir de index.html (gabarit) et assets/js/data.js :
     produits/<id>/index.html  une vraie page par produit (titre, description, aperçu de partage,
                               données structurées, texte lisible sans JavaScript) ; app.js y
                               construit ensuite la fiche complète (3D, curseurs, prix, panier).
     sitemap.xml, 404.html
   Usage : node tools/generer-pages.mjs          (écrit les fichiers)
           node tools/generer-pages.mjs --check  (échoue si un fichier n'est pas à jour, pour la CI)
   À relancer après toute modification de data.js ou de index.html. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://www.evarysth.fr";
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
      { "@type": "ListItem", position: 1, name: "Catalogue", item: `${SITE}/#catalogue` },
      { "@type": "ListItem", position: 2, name: u.name, item: `${SITE}/#f-${u.id}` },
      { "@type": "ListItem", position: 3, name: p.name, item: url }
    ]
  }];
  const head = `  <title>${esc(title)}</title>
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
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="#catalogue">Catalogue</a> / <a href="#f-${u.id}">${esc(u.name)}</a> / <span>${esc(p.name)}</span></nav>
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

function notFoundPage() {
  const head = `  <title>Page introuvable — Evarysth</title>
  <meta name="robots" content="noindex">
`;
  const main = `  <main>
   <div class="product">
    <article class="pdp-static">
      <h1>Page introuvable</h1>
      <p>Cette adresse n'existe pas (ou plus). Le produit a peut-être changé de nom.</p>
      <p><a class="btn btn--primary" href="#catalogue">Voir le catalogue</a></p>
    </article>
   </div>
  </main>
`;
  return page({ base: "/", bodyAttr: ' data-page="404"', head, main });
}

function sitemap() {
  const urls = [`${SITE}/`, ...E.products.map(p => `${SITE}/produits/${p.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`;
}

/* Écriture (ou vérification) */
const out = new Map();
for (const p of E.products) out.set(`produits/${p.id}/index.html`, productPage(p));
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
/* Pages de produits retirés du catalogue */
const dir = path.join(ROOT, "produits");
for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  if (out.has(`produits/${d}/index.html`)) continue;
  stale.push(`produits/${d}/ (produit retiré)`);
  if (!CHECK) fs.rmSync(path.join(dir, d), { recursive: true });
}

if (CHECK && stale.length) {
  console.error("Pages à régénérer (node tools/generer-pages.mjs) :\n  " + stale.join("\n  "));
  process.exit(1);
}
console.log(CHECK ? "Pages à jour." : `${stale.length} fichier(s) écrit(s) ou supprimé(s) sur ${out.size}.`);
