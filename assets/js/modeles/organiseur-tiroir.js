/* Modèle 3D « organiseur-tiroir » — chargé à la demande par viewer3d.js (voir EVARYSTH.viewer3d.define). */
/* a = largeur, b = profondeur intérieures du tiroir : l'organiseur y entre avec le jeu de la matière
   (a − jeu, b − jeu hors tout). Cases d'environ 120 × 140 mm. Au-delà de 250 mm, il est découpé en modules de
   cases entières (chacun ≤ 250 mm, imprimable sur un plateau de 256 mm), posés côte à côte, 0,5 mm d'écart. */
(() => {
  const H = 50, MAX = 250, ECART = 0.5;
  const cases = { x: a => Math.max(2, Math.round(a / 120)), z: b => Math.max(2, Math.round(b / 140)) };
  /* Longueur L (hors tout) en n cases → modules [{ n cases, l longueur, c centre }], le moins possible */
  const modules = (L, n) => {
    let k = 1;
    const pas = k => (L - (k - 1) * ECART) / n;
    while (k < n && Math.ceil(n / k) * pas(k) > MAX) k++;
    const p = pas(k), out = [];
    let x = -L / 2;
    for (let i = 0; i < k; i++) {
      const ni = Math.floor(n / k) + (i < n % k ? 1 : 0), l = ni * p;
      out.push({ n: ni, l, c: x + l / 2 });
      x += l + ECART;
    }
    return out;
  };
  const grille = ({ a, b, jeu = 0 }) => [modules(a - jeu, cases.x(a)), modules(b - jeu, cases.z(b))];
  EVARYSTH.viewer3d.define("organiseur-tiroir", ({ m, tray }) => m((k, v) => {
    const [X, Z] = grille(v);
    return k.join(...X.flatMap(mx => Z.flatMap(mz => tray(k, mx.l, mz.l, H, mx.n, mz.n).map(g => g.translate(mx.c, 0, mz.c)))));
  }), {
    /* Nombre de modules (pièces séparées voulues) */
    solides: v => { const [X, Z] = grille(v); return X.length * Z.length; },
    /* Repère de construction : fond en y = 0, centré en x et z */
    cotes: ({ a, b, jeu }) => [
      { nom: "largeur hors tout (tiroir − jeu)", axe: "y", en: [0, 25, 0], mesure: "etendue", selon: "x", attendu: a - jeu },
      { nom: "profondeur hors tout (tiroir − jeu)", axe: "y", en: [0, 25, 0], mesure: "etendue", selon: "z", attendu: b - jeu }]
  });
})();
