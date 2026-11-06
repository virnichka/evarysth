/* Modèle 3D « support-uc » — chargé à la demande par viewer3d.js (voir MODULR.viewer3d.define). */
/* a = largeur de la tour : deux étriers en U avec ailes de fixation */
MODULR.viewer3d.define("support-uc", ({ m }) => {
  return m((k, { a }) => {
    const H = 150, t = 6, f = 30, o = a / 2;
    const p = [[-o - t - f, H], [-o - t, H], [-o - t, 0], [o + t, 0], [o + t, H], [o + t + f, H], [o + t + f, H + t],
      [o, H + t], [o, t], [-o, t], [-o, H + t], [-o - t - f, H + t]];
    return k.join(k.ext(p, 40).translate(0, 0, -80), k.ext(p, 40).translate(0, 0, 80));
  });
});
