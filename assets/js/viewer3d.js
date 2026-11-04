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
    }
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
