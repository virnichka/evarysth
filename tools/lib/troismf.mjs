/* Evarysth · chaîne de fabrication : 3MF non tranché (spécification 3MF Core, sans extension propriétaire), lisible
   par tout trancheur (Bambu Studio, PrusaSlicer, Cura…). Un fichier par plateau : chaque pièce est un objet, posée à
   sa position sur le plateau (mm), matière et couleur du coloris en « basematerials ». Pour les fabricants externes
   (matières hors atelier) et en secours pour l'atelier. Zip écrit sans dépendance (deflate de node:zlib). */
import zlib from "node:zlib";

const echapper = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const nombre = x => (Math.round(x * 1e4) / 1e4).toString();

/* objets : [{ nom, mesh: { vertProperties (Float32Array, xyz…), triVerts (Uint32Array), numProp } }] (Manifold.getMesh()) */
export function modele3mf(objets, { matiere = "", couleur = null, titre = "" } = {}) {
  const l = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${echapper(titre)}</metadata>`, '  <metadata name="Application">Evarysth (tools/generer-stl.mjs)</metadata>',
    "  <resources>"];
  const mat = couleur ? ' pid="1" pindex="0"' : "";
  if (couleur) l.push(`    <basematerials id="1"><base name="${echapper(matiere)}" displaycolor="${echapper(couleur.toUpperCase())}FF"/></basematerials>`);
  objets.forEach((o, i) => {
    const { vertProperties: v, triVerts: t, numProp: n = 3 } = o.mesh;
    l.push(`    <object id="${i + 2}" type="model" name="${echapper(o.nom)}"${mat}><mesh><vertices>`);
    for (let k = 0; k < v.length; k += n) l.push(`<vertex x="${nombre(v[k])}" y="${nombre(v[k + 1])}" z="${nombre(v[k + 2])}"/>`);
    l.push("</vertices><triangles>");
    for (let k = 0; k < t.length; k += 3) l.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>`);
    l.push("</triangles></mesh></object>");
  });
  l.push("  </resources>", "  <build>", ...objets.map((o, i) => `    <item objectid="${i + 2}"/>`), "  </build>", "</model>");
  return l.join("\n") + "\n";
}

export function archive3mf(modele) {
  return zip([
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n'],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n'],
    ["3D/3dmodel.model", modele]
  ]);
}

/* Zip minimal (deflate), dates fixes (1980-01-01) : même contenu → même fichier */
export function zip(entrees) {
  const locaux = [], centraux = [];
  let decalage = 0;
  for (const [nom, contenu] of entrees) {
    const brut = Buffer.isBuffer(contenu) ? contenu : Buffer.from(contenu, "utf8");
    const comp = zlib.deflateRawSync(brut, { level: 9 }), crc = zlib.crc32(brut), n = Buffer.from(nom, "utf8");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(brut.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(brut.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(decalage, 42);
    locaux.push(h, n, comp); centraux.push(c, n);
    decalage += 30 + n.length + comp.length;
  }
  const central = Buffer.concat(centraux), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entrees.length, 8); fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, central, fin]);
}
