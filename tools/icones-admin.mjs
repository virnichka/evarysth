/* Régénère worker/src/icones.js (icônes de la page /admin, intégrées au code du Worker) depuis assets/icons/.
   À relancer après tout changement d'une icône : node tools/icones-admin.mjs (un test vérifie qu'elles sont à jour). */
import { readFileSync, writeFileSync } from "node:fs";
const racine = new URL("../", import.meta.url);
export const FICHIERS = { "favicon.svg": "image/svg+xml", "favicon-32.png": "image/png", "apple-touch-icon.png": "image/png", "favicon-192.png": "image/png" };
const lignes = Object.entries(FICHIERS).map(([nom, type]) =>
  `  "${nom}": { type: "${type}", b64: "${readFileSync(new URL(`assets/icons/${nom}`, racine)).toString("base64")}" }`);
writeFileSync(new URL("worker/src/icones.js", racine), `/* Généré par tools/icones-admin.mjs depuis assets/icons/ : ne pas modifier à la main. */
export const ICONES = {
${lignes.join(",\n")}
};
`);
