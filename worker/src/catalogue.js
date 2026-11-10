/* Le catalogue du site, source unique des prix et des bornes des cotes.
   Tout changement de assets/js/data.js ou assets/js/bareme.js redéploie le Worker (voir .github/workflows/worker.yml). */
import "./fenetre.js";
import "../../assets/js/data.js";
/* Barème du prix sur-mesure (généré par tools/generer-bareme.mjs), lu par EVARYSTH.priceFor comme sur le site */
import "../../assets/js/bareme.js";

export const EVARYSTH = globalThis.EVARYSTH;

let empreinte;
/* Empreinte courte du catalogue, notée sur chaque commande (version des prix utilisée : produits, tarifs, barème) */
export function versionCatalogue() {
  const prix = [EVARYSTH.products, EVARYSTH.tarif, EVARYSTH.matieres, EVARYSTH.bareme];
  empreinte ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(prix)))
    .then(h => [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join(""));
  return empreinte;
}

/* Article sur-mesure du Sheet (« <produit> · a=45 b=32 · … ») dont la formule dépasse le plafond : prix payé = plafond.
   Recalculé avec le barème courant (alerte « prix plafonné » de /admin) ; null sinon (standard, illisible, sous le plafond). */
export function prixPlafonne(article) {
  const [id, cotes] = String(article || "").split(" · ");
  const p = id && EVARYSTH.getProduct(id.trim());
  if (!p || !p.custom || !/^[a-z]=-?[\d.]+( [a-z]=-?[\d.]+)*$/.test((cotes || "").trim())) return null;
  const values = Object.fromEntries(cotes.trim().split(" ").map(x => [x[0], Number(x.slice(2))]));
  if (!p.custom.params.every(q => Number.isFinite(values[q.key]))) return null;
  const r = EVARYSTH.prixCalcule(p, values);
  return r && r.plafonne ? { produit: p.id, formule: r.formule, plafond: r.plafond } : null;
}
