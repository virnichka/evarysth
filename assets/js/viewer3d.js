/* Modulr Studio — viewer 3D paramétrique.
   Three.js n'est chargé (via l'importmap d'index.html) qu'à l'ouverture d'une fiche produit qui a un modèle 3D.
   Usage : const v = MODULR.viewer3d.mount(conteneur, "equerre", p.custom.params, onReady);
           v.update({ a, b, c });  v.dispose();
   Unités de la scène : 1 unité = 1 mm. */
(function () {
  let libs = null;
  const load = () => libs || (libs = Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js")
  ]).then(([THREE, ctrl]) => ({ THREE, OrbitControls: ctrl.OrbitControls }))
    .catch(err => { libs = null; throw err; }));

  /* Profils 2D : listes de points [x, y] en mm */
  const rad = d => d * Math.PI / 180;
  const circ = (r, x = 0, y = 0, n = 40) =>
    Array.from({ length: n }, (_, i) => [x + r * Math.cos(i / n * 2 * Math.PI), y + r * Math.sin(i / n * 2 * Math.PI)]);
  const rect = (w, h, x = 0, y = 0) => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
  /* Anneau ouvert de a0 à a1 degrés (0° = +x) */
  const arc = (ri, ro, a0, a1, n = 32) => {
    const at = (r, i) => [r * Math.cos(rad(a0 + (a1 - a0) * i / n)), r * Math.sin(rad(a0 + (a1 - a0) * i / n))];
    return [...Array.from({ length: n + 1 }, (_, i) => at(ro, i)), ...Array.from({ length: n + 1 }, (_, i) => at(ri, n - i))];
  };
  /* U ouvert vers le bas : ouverture o, profondeur L, paroi t (cavité y ∈ [0, L]) */
  const uPts = (o, L, t) => [[-o / 2 - t, 0], [-o / 2 - t, L + t], [o / 2 + t, L + t], [o / 2 + t, 0],
    [o / 2, 0], [o / 2, L], [-o / 2, L], [-o / 2, 0]];

  /* Briques 3D (dépendent de THREE) : pavé, cylindre/tube (axe Y), profil extrudé (axe Z, centré), assemblage centré */
  let kitCache = null;
  const kit = T => kitCache || (kitCache = (() => {
    const v2 = p => new T.Vector2(p[0], p[1]);
    const ext = (pts, d, holes = []) => {
      const s = new T.Shape(pts.map(v2));
      holes.forEach(h => s.holes.push(new T.Path(h.map(v2))));
      return new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
    };
    const box = (w, h, d, x = 0, y = 0, z = 0) => new T.BoxGeometry(w, h, d).translate(x, y, z);
    const cyl = (r, h, ri = 0) => ri > 0 ? ext(circ(r), h, [circ(ri)]).rotateX(Math.PI / 2) : new T.CylinderGeometry(r, r, h, 40);
    const join = (...gs) => {
      const pos = [], nor = [];
      gs.forEach(g => {
        const n = g.index ? g.toNonIndexed() : g;
        pos.push(n.attributes.position.array); nor.push(n.attributes.normal.array);
        if (n !== g) n.dispose(); g.dispose();
      });
      const cat = arrs => { const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; };
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(cat(pos), 3));
      g.setAttribute("normal", new T.BufferAttribute(cat(nor), 3));
      return g.center();
    };
    return { ext, box, cyl, join };
  })());
  const m = f => (T, v) => f(kit(T), v);

  /* Compositions récurrentes */
  const tray = ({ box }, w, d, h, nx, nz) => [
    box(w, 3, d, 0, 1.5, 0),
    box(w, h, 3, 0, h / 2, d / 2 - 1.5), box(w, h, 3, 0, h / 2, -d / 2 + 1.5),
    box(3, h, d, w / 2 - 1.5, h / 2, 0), box(3, h, d, -w / 2 + 1.5, h / 2, 0),
    ...Array.from({ length: nx - 1 }, (_, i) => box(2, h * 0.85, d, -w / 2 + (i + 1) * w / nx, h * 0.425, 0)),
    ...Array.from({ length: nz - 1 }, (_, i) => box(w, h * 0.85, 2, 0, h * 0.425, -d / 2 + (i + 1) * d / nz))
  ];
  /* Pose sur un support d'épaisseur a, bras qui descend côté extérieur, crochet en bas */
  const overHook = (k, a, drop, r, w, t = 5) => k.join(
    k.ext(uPts(a, 30, t), w),
    k.box(t, drop + 30 + t, w, a / 2 + t / 2, (30 + t - drop) / 2, 0),
    k.ext(arc(r, r + t, 180, 360), w).translate(a / 2 + r + t, -drop, 0)
  );
  /* Pince latérale sur un plateau d'épaisseur a (ouverture vers +x, corps en x < 0) */
  const sideClamp = (k, a, L, t, w) => k.ext(uPts(a, L, t), w).rotateZ(Math.PI / 2);

  /* Modèles paramétriques : valeurs en mm -> BufferGeometry centrée */
  const MODELS = {
    /* Équerre en L : a = 1re branche, b = 2e branche, c = largeur de la pièce. Paroi fixe. */
    equerre(THREE, v) {
      const t = 5; // épaisseur de paroi (mm)
      const a = Math.max(v.a, t * 2), b = Math.max(v.b, t * 2), w = v.c;
      const r = Math.min(4, a - t, b - t); // petit congé dans l'angle intérieur, comme une vraie pièce
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(a, 0);
      s.lineTo(a, t);
      s.lineTo(t + r, t);
      s.quadraticCurveTo(t, t, t, t + r);
      s.lineTo(t, b);
      s.lineTo(0, b);
      s.closePath();
      const bevel = 0.8;
      const g = new THREE.ExtrudeGeometry(s, {
        depth: w - bevel * 2, curveSegments: 8,
        bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2
      });
      g.center();
      return g;
    },
    /* a = épaisseur de rambarde (ouverture de la pince) */
    "jardiniere-clip": m((k, { a }) => k.join(
      k.ext(uPts(a, 40, 6), 40),
      k.box(6, 126, 40, a / 2 + 3, -17, 0),
      k.box(76, 6, 40, a / 2 + 38, -77, 0),
      k.box(6, 24, 40, a / 2 + 73, -65, 0))),
    "crochet-balcon": m((k, { a }) => overHook(k, a, 60, 15, 20)),
    /* a = diamètre du barreau */
    "clip-brise-vue": m((k, { a }) => k.join(
      k.ext(arc(a / 2, a / 2 + 3, 40, 320), 14),
      k.box(22, 3, 14, -a / 2 - 12, 0, 0))),
    /* a = rambarde, b = mât */
    "pince-parasol": m((k, { a, b }) => k.join(
      k.ext(uPts(a, 40, 6), 50),
      k.cyl(b / 2 + 5, 50, b / 2).translate(a / 2 + b / 2 + 9, 23, 0))),
    /* a = rambarde, b = largeur de la tablette */
    "tablette-rambarde": m((k, { a, b }) => k.join(
      k.ext(uPts(a, 40, 6), 60),
      k.box(140, 8, b, 0, 50, 0))),
    "clips-guirlande": m((k, { a }) => k.join(
      k.ext(arc(a / 2, a / 2 + 3, 40, 320), 10),
      k.ext(arc(2.5, 5, 120, 420), 10).translate(0, a / 2 + 7, 0))),
    /* a = hauteur sous le pot */
    "pieds-pot": m((k, { a }) => k.join(k.ext([[0, 0], [50, 0], [50, a], [20, a], [20, a + 10], [0, a + 10]], 35))),
    /* a = diamètre du tuteur, petit anneau fixe pour la tige */
    "clips-tuteur": m((k, { a }) => k.join(
      k.ext(arc(a / 2, a / 2 + 2.5, 40, 320), 12),
      k.ext(arc(5, 7.5, -140, 140), 12).translate(-a / 2 - 9, 0, 0))),
    "support-tuyau": m((k, { a }) => k.join(
      k.ext(uPts(a, 40, 6), 50),
      k.box(6, 86, 50, a / 2 + 3, 3, 0),
      k.ext(arc(55, 63, 180, 360), 50).translate(a / 2 + 59, -40, 0))),
    /* a = épaisseur du plateau de table */
    "pinces-nappe": m((k, { a }) => k.join(sideClamp(k, a, 25, 4, 20), k.box(4, a + 16, 20, -31, 0, 0))),

    /* a = épaisseur du plateau, b = longueur */
    "goulotte-cable": m((k, { a, b }) => k.join(
      sideClamp(k, a, 30, 4, b),
      k.ext(uPts(60, 50, 4), b).rotateZ(Math.PI).translate(20, -a / 2 - 4, 0))),
    "support-casque": m((k, { a }) => k.join(
      sideClamp(k, a, 40, 5, 25),
      k.box(5, 40, 25, -20, -a / 2 - 25, 0),
      k.ext(arc(25, 30, 180, 360), 25).translate(7.5, -a / 2 - 45, 0))),
    /* a = largeur, b = épaisseur du chargeur */
    "dock-chargeur": m((k, { a, b }) => k.join(
      k.ext(rect(a + 8, b + 8), 70, [rect(a, b)]),
      k.box(a + 30, 3, 70, 0, b / 2 + 5.5, 0))),
    /* a = diamètre du trou */
    "passe-cable": m((k, { a }) => k.join(
      k.cyl(a / 2 + 8, 3, a / 2 - 3),
      k.cyl(a / 2, 18, a / 2 - 3).translate(0, -10.5, 0),
      k.ext(circ(a / 2 - 3.5), 2, [rect(a * 0.35, 8, a * 0.2, 0)]).rotateX(Math.PI / 2).translate(0, 0.5, 0))),
    /* a = épaisseur de l'ordinateur (largeur de la fente) */
    "support-portable": m((k, { a }) => k.join(
      k.box(a + 60, 12, 90, 0, 6, 0),
      k.box(15, 60, 90, -a / 2 - 7.5, 42, 0),
      k.box(15, 60, 90, a / 2 + 7.5, 42, 0))),
    /* a = épaisseur du téléphone (fente entre la butée et le dossier) */
    "support-telephone": m((k, { a }) => k.join(
      k.box(a + 66, 6, 70, (a + 66) / 2, 3, 0),
      k.box(6, 20, 70, 3, 10, 0),
      k.box(6, 100, 70).rotateZ(-0.4).translate(a - 10.5, 52, 0))),
    /* a = plateau, b = diamètre du câble */
    "clips-cables": m((k, { a, b }) => k.join(
      sideClamp(k, a, 20, 4, 12),
      k.ext(arc(b / 2, b / 2 + 2.5, 120, 420), 12).translate(-12, a / 2 + b / 2 + 5, 0))),
    "support-manette": m((k, { a }) => k.join(
      sideClamp(k, a, 40, 5, 30),
      k.box(5, 30, 30, -20, -a / 2 - 20, 0),
      k.ext(uPts(40, 20, 5), 30).rotateZ(Math.PI).translate(-20, -a / 2 - 12.5, 0))),
    /* a = largeur de la tour : deux étriers en U avec ailes de fixation */
    "support-uc": m((k, { a }) => {
      const H = 150, t = 6, f = 30, o = a / 2;
      const p = [[-o - t - f, H], [-o - t, H], [-o - t, 0], [o + t, 0], [o + t, H], [o + t + f, H], [o + t + f, H + t],
        [o, H + t], [o, t], [-o, t], [-o, H + t], [-o - t - f, H + t]];
      return k.join(k.ext(p, 40).translate(0, 0, -80), k.ext(p, 40).translate(0, 0, 80));
    }),
    /* a = longueur */
    "organiseur-bureau": m((k, { a }) => k.join(...tray(k, a, 80, 40, Math.max(2, Math.round(a / 80)), 1))),

    /* a = diamètre du pied, b = hauteur ajoutée */
    "rehausseur": m((k, { a, b }) => k.join(
      k.cyl(a / 2 + 18, b - 12).translate(0, (b - 12) / 2, 0),
      k.cyl(a / 2 + 18, 12, a / 2).translate(0, b - 6, 0))),
    /* a = largeur, b = profondeur du tiroir */
    "organiseur-tiroir": m((k, { a, b }) => k.join(...tray(k, a, b, 50, Math.max(2, Math.round(a / 120)), Math.max(2, Math.round(b / 140))))),
    "crochet-porte": m((k, { a }) => overHook(k, a, 110, 12, 25, 4)),
    /* a = diamètre de la tige */
    "taquets-etagere": m((k, { a }) => k.join(
      k.cyl(a / 2, 10).rotateZ(Math.PI / 2).translate(-5, 0, 0),
      k.box(3, 22, 14, 1.5, 0, 0),
      k.box(20, 4, 14, 10, 9, 0))),
    /* a = entraxe des vis */
    "poignee-meuble": m((k, { a }) => k.join(
      k.cyl(6, a + 30).rotateZ(Math.PI / 2).translate(0, 28, 0),
      k.cyl(5, 28).translate(-a / 2, 14, 0),
      k.cyl(5, 28).translate(a / 2, 14, 0))),
    /* a = épaisseur de la cale (cale en fer à cheval) */
    "cales-meuble": m((k, { a }) => k.join(k.ext(uPts(12, 35, 14), a).rotateX(Math.PI / 2))),
    /* a = épaisseur de l'étagère, b = hauteur du séparateur */
    "separateurs-etagere": m((k, { a, b }) => k.join(
      sideClamp(k, a, 40, 4, 30),
      k.box(150, b, 4, 31, a / 2 + 4 + b / 2, 0))),
    /* a = cadre, b = tringle */
    "support-tringle": m((k, { a, b }) => k.join(
      k.ext(uPts(a, 30, 5), 30),
      k.box(55, 8, 30, a / 2 + 32.5, 31, 0),
      k.ext(arc(b / 2, b / 2 + 5, 120, 420), 30).translate(a / 2 + 58 + b / 2, 31, 0))),
    /* a = diamètre du pied */
    "embouts-pieds": m((k, { a }) => k.join(
      k.cyl(a / 2 + 5, 4).translate(0, 2, 0),
      k.cyl(a / 2 + 3, 16, a / 2).translate(0, 12, 0))),
    /* a = étagère, b = barre */
    "penderie-etagere": m((k, { a, b }) => k.join(
      sideClamp(k, a, 50, 5, 25),
      k.box(5, 60, 25, -30, -a / 2 - 35, 0),
      k.ext(arc(b / 2, b / 2 + 5, 30, 330), 25).translate(-30, -a / 2 - 65 - b / 2 - 3, 0)))
  };

  const webglOK = () => {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
    catch { return false; }
  };

  function mount(container, modelId, params, onReady) {
    let disposed = false, ready = false, pending = null, api = null;
    const handle = {
      update(values) { pending = { ...values }; if (ready) api.rebuild(pending); },
      dispose() { disposed = true; if (api) api.destroy(); api = null; }
    };
    const build = MODELS[modelId];
    if (!container || !build || !webglOK()) return handle;

    load().then(({ THREE, OrbitControls }) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f74, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1, 1.6, 1.2); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffe2d2, 1.4); rim.position.set(-1.4, 0.4, -1); scene.add(rim);

      /* Nylon PA12 noir mat + arêtes légèrement éclaircies pour la lisibilité en thème sombre */
      const material = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.72, metalness: 0.05 });
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x6b6b6b, transparent: true, opacity: 0.55 });
      const mesh = new THREE.Mesh(undefined, material);
      const edges = new THREE.LineSegments(undefined, edgeMat);
      const piece = new THREE.Group(); piece.add(mesh, edges); scene.add(piece);

      /* Caméra fixe, cadrée sur la plus grande pièce possible : on voit la pièce grandir ou rétrécir */
      const maxVals = Object.fromEntries(params.map(p => [p.key, p.max]));
      const probe = build(THREE, maxVals); probe.computeBoundingSphere();
      const radius = probe.boundingSphere.radius; probe.dispose();
      const camera = new THREE.PerspectiveCamera(32, 1, radius / 50, radius * 20);
      const dist = radius / Math.sin(THREE.MathUtils.degToRad(32 / 2)) * 0.92;
      camera.position.set(0.9, 0.75, 1.1).normalize().multiplyScalar(dist);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = dist * 0.35;
      controls.maxDistance = dist * 1.6;
      controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotateSpeed = 1.4;
      controls.addEventListener("start", () => { controls.autoRotate = false; });

      let dirty = true, raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (controls.update() || dirty) { renderer.render(scene, camera); dirty = false; }
      };

      const resize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        dirty = true;
      };
      const ro = new ResizeObserver(resize); ro.observe(container);

      api = {
        rebuild(values) {
          const g = build(THREE, values);
          if (mesh.geometry) mesh.geometry.dispose();
          if (edges.geometry) edges.geometry.dispose();
          mesh.geometry = g;
          edges.geometry = new THREE.EdgesGeometry(g, 30);
          dirty = true;
        },
        destroy() {
          cancelAnimationFrame(raf);
          ro.disconnect();
          controls.dispose();
          mesh.geometry && mesh.geometry.dispose();
          edges.geometry && edges.geometry.dispose();
          material.dispose(); edgeMat.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        }
      };

      api.rebuild(pending || Object.fromEntries(params.map(p => [p.key, p.def])));
      ready = true;
      resize(); tick();
      if (onReady) onReady();
    }).catch(err => { console.warn("Viewer 3D indisponible, illustration conservée.", err); });

    return handle;
  }

  window.MODULR = window.MODULR || {};
  MODULR.viewer3d = { mount, models: MODELS };
})();
