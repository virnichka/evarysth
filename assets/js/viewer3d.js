/* Evarysth — viewer 3D paramétrique.
   Three.js n'est chargé (via l'importmap d'index.html) qu'à l'ouverture d'une fiche produit qui a un modèle 3D.
   Usage : const v = EVARYSTH.viewer3d.mount(conteneur, "equerre", p.custom.params, onReady);
           v.update({ a, b, c });  v.dispose();
   Unités de la scène : 1 unité = 1 mm.
   Un modèle peut aussi partir de fichiers STL (assets/models/) : il expose alors prepare(THREE),
   appelé une fois avant le premier rendu, puis se reconstruit de façon synchrone comme les autres.
   Chaque modèle vit dans son propre fichier assets/js/modeles/<modèle>.js, chargé seulement quand
   une fiche l'affiche. Ce fichier-ci ne contient que le moteur et les briques communes. */
(function () {
  let libs = null;
  const load = () => libs || (libs = Promise.all([
    import("three"),
    import("three/addons/controls/OrbitControls.js")
  ]).then(([THREE, ctrl]) => ({ THREE, OrbitControls: ctrl.OrbitControls }))
    .catch(err => { libs = null; throw err; }));

  /* Nouveau moteur manifold-3d (refonte, phase 2 : docs/refonte-geometrie.md) : seulement avec ?geo=manifold
     (mémorisé dans le navigateur, coupé par ?geo=off). Sans ce drapeau, le kit three.js ci-dessous sert seul. */
  const GEO_FLAG = "evarysth.geo";
  const geoOn = (() => {
    try {
      const st = window.EVARYSTH && EVARYSTH.store, q = new URLSearchParams(location.search).get("geo");
      if (q === "manifold") { if (st) st.set(GEO_FLAG, "manifold"); return true; }
      if (q === "off") { if (st) st.set(GEO_FLAG, ""); return false; }
      return !!st && st.get(GEO_FLAG, "") === "manifold";
    } catch { return false; }
  })();
  let GEO = null, geoLoad = null;
  /* Kit manifold (assets/js/geo.js + WASM de assets/vendor/manifold-3d/), chargé à la demande comme three.js */
  const loadGeo = THREE => geoLoad || (geoLoad = Promise.all([
    import(new URL("assets/js/geo.js", document.baseURI).href),
    import(new URL("assets/vendor/manifold-3d/manifold.js", document.baseURI).href).then(m => m.default())
  ]).then(([geo, wasm]) => { wasm.setup(); return (GEO = geo.createKit(THREE, wasm)); })
    .catch(err => { geoLoad = null; throw err; }));

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
  const kit = T => GEO || kitCache || (kitCache = (() => {
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

  /* Fichiers STL : chargés une seule fois, à la demande */
  const stlCache = {};
  const fetchSTL = url => stlCache[url] || (stlCache[url] = import("three/addons/loaders/STLLoader.js")
    .then(({ STLLoader }) => new Promise((ok, ko) => new STLLoader().load(url, ok, undefined, ko)))
    .catch(err => { delete stlCache[url]; throw err; }));

  /* Figurines sculptées (maillages d'origine allégés à 80 000 triangles).
     Repère des STL : Z vers le haut, centré en X/Y, socle en z = 0, face vers +Y.
     Formes organiques sans détail fonctionnel : mise à l'échelle uniforme, a = hauteur totale. */
  const sculpt = (URL, H0) => {
    let base = null;
    const model = (T, v) => {
      const s = v.a / H0;
      return base.clone().scale(s, s, s).translate(0, 0, -v.a / 2).rotateX(-Math.PI / 2);
    };
    model.smooth = true;  // surface sculptée : pas d'arêtes vives à souligner
    /* Sommets fusionnés pour un ombrage lisse (le STL répète chaque sommet par triangle) */
    model.prepare = () => base ? Promise.resolve() : Promise.all([fetchSTL(URL), import("three/addons/utils/BufferGeometryUtils.js")])
      .then(([g, { mergeVertices }]) => {
        const flat = g.clone(); flat.deleteAttribute("normal");
        base = mergeVertices(flat, 1e-3); flat.dispose();
        base.computeVertexNormals();
      });
    return model;
  };

  /* Compositions récurrentes (avec le kit manifold : ses propres versions, assemblées par union) */
  const trayThree = ({ box }, w, d, h, nx, nz) => [
    box(w, 3, d, 0, 1.5, 0),
    box(w, h, 3, 0, h / 2, d / 2 - 1.5), box(w, h, 3, 0, h / 2, -d / 2 + 1.5),
    box(3, h, d, w / 2 - 1.5, h / 2, 0), box(3, h, d, -w / 2 + 1.5, h / 2, 0),
    ...Array.from({ length: nx - 1 }, (_, i) => box(2, h * 0.85, d, -w / 2 + (i + 1) * w / nx, h * 0.425, 0)),
    ...Array.from({ length: nz - 1 }, (_, i) => box(w, h * 0.85, 2, 0, h * 0.425, -d / 2 + (i + 1) * d / nz))
  ];
  /* Pose sur un support d'épaisseur a, bras qui descend côté extérieur, crochet en bas */
  const overHookThree = (k, a, drop, r, w, t = 5) => k.join(
    k.ext(uPts(a, 30, t), w),
    k.box(t, drop + 30 + t, w, a / 2 + t / 2, (30 + t - drop) / 2, 0),
    k.ext(arc(r, r + t, 180, 360), w).translate(a / 2 + r + t, -drop, 0)
  );
  /* Pince latérale sur un plateau d'épaisseur a (ouverture vers +x, corps en x < 0) */
  const sideClampThree = (k, a, L, t, w) => k.ext(uPts(a, L, t), w).rotateZ(Math.PI / 2);
  const tray = (k, ...a) => k.isManifold ? k.tray(...a) : trayThree(k, ...a);
  const overHook = (k, ...a) => k.isManifold ? k.overHook(...a) : overHookThree(k, ...a);
  const sideClamp = (k, ...a) => k.isManifold ? k.sideClamp(...a) : sideClampThree(k, ...a);

  /* Modèles paramétriques : valeurs en mm -> BufferGeometry centrée */
  const MODELS = {};
  /* Briques mises à disposition des fichiers de modèles */
  const LIB = { m, kit, rad, circ, rect, arc, uPts, fetchSTL, sculpt, tray, overHook, sideClamp };
  /* Appelé par chaque fichier assets/js/modeles/<id>.js : factory(LIB) -> fonction (THREE, valeurs) -> géométrie */
  const define = (id, factory) => { MODELS[id] = factory(LIB); };
  const modelCache = {};
  const loadModel = id => modelCache[id] || (modelCache[id] = new Promise((ok, ko) => {
    if (MODELS[id]) return ok(MODELS[id]);
    const s = document.createElement("script");
    s.src = `assets/js/modeles/${encodeURIComponent(id)}.js`;
    s.onload = () => MODELS[id] ? ok(MODELS[id]) : ko(new Error(`Modèle 3D « ${id} » non défini`));
    s.onerror = () => { s.remove(); ko(new Error(`Modèle 3D « ${id} » introuvable`)); };
    document.head.appendChild(s);
  }).catch(err => { delete modelCache[id]; throw err; }));

  const webglOK = () => {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
    catch { return false; }
  };

  function mount(container, modelId, params, onReady) {
    let disposed = false, ready = false, pending = null, api = null, open = 0, queued = 0, finish = null;
    /* Une reconstruction par image au plus : pendant un glissé de curseur, seule la dernière valeur compte */
    const flush = () => { queued = 0; if (api && pending) api.rebuild(pending); };
    const handle = {
      update(values) { pending = { ...values }; if (ready && !queued) queued = requestAnimationFrame(flush); },
      /* Ouverture (0 → 1) pour les modèles « openable » : affichage seulement, n'entre pas dans les cotes */
      setOpen(t) { open = t; if (ready && pending) api.rebuild(pending); },
      /* Coloris : { hex, roughness?, metalness? } ; transition douce gérée par la boucle de rendu */
      setColor(c) { finish = c; if (api) api.tint(); },
      dispose() { disposed = true; cancelAnimationFrame(queued); if (api) api.destroy(); api = null; }
    };
    if (!container || !modelId || !webglOK()) return handle;

    Promise.all([load(), loadModel(modelId)]).then(async ([{ THREE, OrbitControls }, build]) => {
      if (geoOn) await loadGeo(THREE);
      if (build.prepare) await build.prepare(THREE);
      if (disposed) return;
      /* Avec le kit manifold, le modèle rend un solide : converti ici pour l'aperçu (même calcul que le STL) */
      const make = vals => GEO ? GEO.preview(build(THREE, vals)) : build(THREE, vals);
      if (GEO) {
        const b = GEO.bilan(build(THREE, Object.fromEntries(params.map(p => [p.key, p.def])))); GEO.flush();
        console.info(`[geo=manifold] ${modelId} : ${b.horsKit ? "hors kit" : "kit"}, ${b.etanche ? "étanche" : "NON étanche"}`
          + (b.volume ? `, ${Math.round(b.volume)} mm³, ${b.solides} solide(s)` : ""));
      }
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
      /* Rayon depuis l'origine (les modèles sont centrés ; un modèle ouvrable garde la boîte fermée au centre) */
      const reach = vals => {
        const g = make(vals), a = g.attributes.position.array; let r = 0;
        for (let i = 0; i < a.length; i += 3) r = Math.max(r, a[i] * a[i] + a[i + 1] * a[i + 1] + a[i + 2] * a[i + 2]);
        g.dispose(); return Math.sqrt(r);
      };
      const radius = Math.max(reach(maxVals), build.openable ? reach({ ...maxVals, open: 1 }) * 0.9 : 0);
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

      let dirty = true, raf = 0, target = null;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (target) {
          const k = 0.16;
          material.color.lerp(target.color, k);
          material.roughness += (target.roughness - material.roughness) * k;
          material.metalness += (target.metalness - material.metalness) * k;
          if (material.color.equals(target.color) || Math.abs(material.color.r - target.color.r) + Math.abs(material.color.g - target.color.g) + Math.abs(material.color.b - target.color.b) < 0.002) {
            material.color.copy(target.color); material.roughness = target.roughness; material.metalness = target.metalness; target = null;
          }
          dirty = true;
        }
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
        tint(instant) {
          if (!finish) return;
          target = { color: new THREE.Color(finish.hex), roughness: finish.roughness ?? 0.72, metalness: finish.metalness ?? 0.05 };
          if (instant) { material.color.copy(target.color); material.roughness = target.roughness; material.metalness = target.metalness; target = null; }
          dirty = true;
        },
        rebuild(values) {
          const g = make(build.openable ? { ...values, open } : values);
          if (mesh.geometry) mesh.geometry.dispose();
          if (edges.geometry) edges.geometry.dispose();
          mesh.geometry = g;
          edges.geometry = build.smooth ? new THREE.BufferGeometry() : new THREE.EdgesGeometry(g, 30);
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

      pending = pending || Object.fromEntries(params.map(p => [p.key, p.def]));
      api.rebuild(pending);
      api.tint(true);
      ready = true;
      resize(); tick();
      if (onReady) onReady(build);
    }).catch(err => { console.warn("Viewer 3D indisponible, illustration conservée.", err); });

    return handle;
  }

  window.EVARYSTH = window.EVARYSTH || {};
  /* models / useGeo : accès pour les outils Node (tools/lib/moteur.mjs), sans effet sur le site */
  EVARYSTH.viewer3d = { mount, define, models: MODELS, useGeo: k => { GEO = k; } };
})();
