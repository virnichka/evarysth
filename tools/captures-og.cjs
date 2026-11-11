#!/usr/bin/env node
/* Evarysth — images d'aperçu de partage (og:image, 1200 × 630) : assets/og/<id>.jpg + accueil.jpg.
   Visuel = 1re photo du produit, sinon capture de la vue 3D (ou de l'icône) de sa fiche.
   Produits 3D sans photo : aussi 2 vignettes de catalogue (fond transparent, 2 angles) :
   assets/vignettes/<id>-1.webp (vue de face) et <id>-2.webp (affichée au survol).
   Usage : node tools/captures-og.cjs [id-produit …]   (sans argument : tous les produits + l'accueil ;
           avec argument : seulement ces produits). Puis relancer node tools/generer-pages.mjs.
   Nécessite Playwright + Chromium (déjà installés dans l'environnement de travail). */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "assets/og");
const VIG = path.join(ROOT, "assets/vignettes");
const PORT = 8765, BASE = `http://localhost:${PORT}/`;

const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
for (const f of ["data.js", "bareme.js", "prix.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/js", f), "utf8"), sandbox);
const E = sandbox.EVARYSTH;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = n => E.fmt(n).replace(/ | /g, " ");
const dataURL = (buf, type) => `data:${type};base64,${buf.toString("base64")}`;

const CSS = `
  *{box-sizing:border-box;margin:0} body{width:1200px;height:630px;background:#f4f1ea;color:#16140f;
  font-family:Inter,system-ui,sans-serif;display:flex;overflow:hidden}
  .vis{width:630px;height:630px;flex:none;background:#ece7dc center/cover no-repeat}
  .txt{flex:1;padding:64px 56px;display:flex;flex-direction:column;justify-content:space-between}
  .logo{font:800 34px "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em;display:flex;align-items:center;gap:12px}
  .logo i{display:block;width:28px;height:28px;position:relative}
  .logo i:before,.logo i:after{content:"";position:absolute;width:15px;height:15px;border-radius:4px}
  .logo i:before{left:2px;top:2px;background:#16140f}.logo i:after{left:11px;top:11px;background:#ff5a1f}
  .u{font:500 18px "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.06em;color:#b93a0b;margin-bottom:16px}
  h1{font:800 50px/1.05 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.02em}
  p{font-size:23px;line-height:1.35;color:#4a463d;margin-top:18px}
  .price{font:700 26px Inter,sans-serif}.price small{font-weight:500;color:#4a463d;font-size:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f4f1ea}.grid div{background:#ece7dc center/cover}`;
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">`;

async function visual(page, p) {
  const photo = (p.photos || [])[0];
  if (photo) {
    const f = path.join(ROOT, photo.src);
    return `url(${dataURL(fs.readFileSync(f), "image/webp")}) ${photo.pos || "center"}/cover`;
  }
  await page.goto(`${BASE}produits/${p.id}/`, { waitUntil: "networkidle" });
  if (p.model) {
    await page.waitForSelector("#stage.is-3d canvas", { timeout: 30000 }).catch(() => console.warn(`  ${p.id} : vue 3D absente, icône utilisée`));
    await page.waitForTimeout(1200);
  }
  const shot = await page.locator("#stage").screenshot();
  return `url(${dataURL(shot, "image/png")}) center/cover`;
}

/* Vignettes de catalogue : vue 3D seule (décor masqué, fond transparent), recadrée en 4:3, en WebP */
const VIG_W = 640, VIG_H = 480;
const toWebp = async (page, png) => Buffer.from(await page.evaluate(async ({ src, w, h }) => {
  const img = new Image(); img.src = src; await img.decode();
  /* Cadre = contour de la pièce (pixels non transparents) + marge, centré dans le 4:3 */
  const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
  const tx = t.getContext("2d"); tx.drawImage(img, 0, 0);
  const a = tx.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (a[(y * t.width + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = t.width - 1; y1 = t.height - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = Math.min(w * 0.86 / bw, h * 0.86 / bh, 1.6);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(t, x0, y0, bw, bh, (w - bw * s) / 2, (h - bh * s) / 2, bw * s, bh * s);
  return c.toDataURL("image/webp", 0.82).split(",")[1];
}, { src: dataURL(png, "image/png"), w: VIG_W, h: VIG_H }), "base64");

async function vignettes(page, p) {
  const v = page.locator("#viewer3d canvas");
  if (!(await v.count())) return;
  await page.addStyleTag({ content: `html,body,body *{background:transparent!important} #stage::before{display:none!important}
    #stage > :not(#viewer3d){visibility:hidden!important}` });
  await page.waitForTimeout(200);
  const shoot = async n => fs.writeFileSync(path.join(VIG, `${p.id}-${n}.webp`), await toWebp(page, await page.locator("#viewer3d").screenshot({ omitBackground: true })));
  await shoot(1);
  /* 2e angle : glisser horizontalement sur la vue (≈ 130° autour de la pièce) */
  const b = await v.boundingBox(), y = b.y + b.height / 2;
  await page.mouse.move(b.x + b.width * 0.3, y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width * (0.3 + 0.036 * i), y);
  await page.mouse.up(); await page.waitForTimeout(1500);
  await shoot(2);
}

async function compose(page, html, file) {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}<style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  await page.screenshot({ path: file, type: "jpeg", quality: 82 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(VIG, { recursive: true });
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
    const shotPage = await ctx.newPage(), out = await ctx.newPage();
    const only = process.argv.slice(2);
    const list = only.length ? only.map(id => E.getProduct(id) || (() => { throw new Error("produit inconnu : " + id); })()) : E.products;
    const vis = {};
    for (const p of list) {
      vis[p.id] = await visual(shotPage, p);
      if (p.model && !(p.photos || []).length) await vignettes(shotPage, p);
      const u = E.getUniverse(p.universe);
      await compose(out, `<div class="vis" style="background:${vis[p.id]}"></div>
        <div class="txt"><div class="logo"><i></i>evarysth</div>
          <div><div class="u">${esc(u.name)}</div><h1>${esc(p.name)}</h1><p>${esc(p.tagline)}</p></div>
          <div class="price"><small>dès</small> ${esc(fmt(E.prixDes(p)))} <small>· standard ou sur-mesure</small></div></div>`,
        path.join(OUT, `${p.id}.jpg`));
      console.log("  " + p.id);
    }
    if (!only.length) {
      const picks = E.products.filter(p => p.popular).concat(E.products).filter((p, i, a) => a.indexOf(p) === i).slice(0, 4);
      await compose(out, `<div class="vis grid">${picks.map(p => `<div style="background:${vis[p.id]}"></div>`).join("")}</div>
        <div class="txt"><div class="logo"><i></i>evarysth</div>
          <div><h1>Hacks d'intérieur sur-mesure</h1><p>Supports, clips et crochets imprimés en 3D, réglés à vos cotes. Sans percer, sans jargon.</p></div>
          <div class="price"><small>www.evarysth.fr</small></div></div>`, path.join(OUT, "accueil.jpg"));
      console.log("  accueil");
    }
  } finally { await browser.close(); server.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
