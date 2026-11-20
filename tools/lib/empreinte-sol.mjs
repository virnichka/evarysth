/* Evarysth · empreinte au sol d'une pièce posée sur le plateau (contrôle du fichier tranché, tools/trancher.mjs) */
import fs from "node:fs";

/* Empreinte au sol d'une pièce : boîte [xmin, ymin, xmax, ymax] de sa coupe à la hauteur h (STL binaire, repère du
   plateau). C'est ce que Bambu Studio relève pour la 1re couche ; elle peut être plus petite que la boîte de la pièce
   et décentrée (pièce qui s'évase au-dessus de sa base). null si la coupe est vide. */
export function empreinteAuSol(fichier, h) {
  const b = fs.readFileSync(fichier), n = b.readUInt32LE(80);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, v = [0, 1, 2].map(k => [0, 1, 2].map(j => b.readFloatLE(o + k * 12 + j * 4)));
    for (let a = 0; a < 3; a++) {
      const p = v[a], q = v[(a + 1) % 3];
      if (p[2] === q[2] || (p[2] - h) * (q[2] - h) > 0) continue;
      const t = (h - p[2]) / (q[2] - p[2]), x = p[0] + t * (q[0] - p[0]), y = p[1] + t * (q[1] - p[1]);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}
