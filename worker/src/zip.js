/* Archive ZIP sans compression (méthode « stored ») construite en mémoire : sert à réunir les STL (ou les 3MF) d'un
   article généré en un seul lien (fichier.js, clés virtuelles stl.zip / 3mf.zip). Les STL binaires et les 3MF (déjà
   compressés) gagneraient peu à être recompressés ; « stored » reste lisible par tous les outils. */
const TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* fichiers : [{ nom, octets: Uint8Array }] → Uint8Array (noms ASCII, date fixe 1er janvier 2026 : archive reproductible) */
export function zipStocke(fichiers) {
  const enc = new TextEncoder(), DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locaux = [], centraux = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), crc = crc32(f.octets), n = f.octets.length;
    const entete = (sig, central) => {
      const b = new DataView(new ArrayBuffer(central ? 46 : 30));
      b.setUint32(0, sig, true);
      let o = 4;
      if (central) { b.setUint16(o, 20, true); o += 2; }                  /* version qui a créé */
      b.setUint16(o, 20, true); b.setUint16(o + 2, 0, true); b.setUint16(o + 4, 0, true);   /* version, drapeaux, méthode 0 */
      b.setUint16(o + 6, 0, true); b.setUint16(o + 8, DATE, true);
      b.setUint32(o + 10, crc, true); b.setUint32(o + 14, n, true); b.setUint32(o + 18, n, true);
      b.setUint16(o + 22, nom.length, true); b.setUint16(o + 24, 0, true);
      if (central) b.setUint32(42, decalage, true);
      return new Uint8Array(b.buffer);
    };
    const local = entete(0x04034b50, false);
    locaux.push(local, nom, f.octets);
    centraux.push(entete(0x02014b50, true), nom);
    decalage += local.length + nom.length + n;
  }
  const tailleCentral = centraux.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  const parts = [...locaux, ...centraux, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
