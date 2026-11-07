/* Le catalogue du site, source unique des prix et des bornes des cotes.
   Tout changement de assets/js/data.js redéploie le Worker (voir .github/workflows/worker.yml). */
import "./fenetre.js";
import "../../assets/js/data.js";

export const EVARYSTH = globalThis.EVARYSTH;

let empreinte;
/* Empreinte courte du catalogue, notée sur chaque commande (version des prix utilisée) */
export function versionCatalogue() {
  empreinte ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(EVARYSTH.products)))
    .then(h => [...new Uint8Array(h)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join(""));
  return empreinte;
}
