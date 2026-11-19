/* Le catalogue du site, source unique des prix et des bornes des cotes.
   Tout changement de assets/js/data.js, bareme.js ou prix.js redéploie le Worker (voir .github/workflows/worker.yml). */
import "./fenetre.js";
import "../../assets/js/data.js";
/* Barème du prix sur-mesure (généré par tools/generer-bareme.mjs), puis calcul des prix et frais (même code que le site) */
import "../../assets/js/bareme.js";
import "../../assets/js/prix.js";

export const EVARYSTH = globalThis.EVARYSTH;

let empreinte;
/* Empreinte courte du catalogue, notée sur chaque commande (version des prix utilisée : produits, tarifs, barème) */
export function versionCatalogue() {
  const prix = [EVARYSTH.products, EVARYSTH.tarif, EVARYSTH.matieres, EVARYSTH.bareme];
  empreinte ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(prix)))
    .then(h => [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join(""));
  return empreinte;
}

