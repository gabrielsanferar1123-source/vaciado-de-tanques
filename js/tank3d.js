/* Visualización 3D del tanque (Three.js r128 + OrbitControls).
   Escena en metros. El nivel del agua y el chorro se dibujan exactamente con
   h(t) y v = √(2g(h − z0)) del motor numérico; nada es decorativo. */
(function (global) {
  'use strict';
  const T3 = global.THREE;

  function textSprite(text, { size = 0.026, color = '#e2e8f0', bg = 'rgba(15,23,42,0.78)', bold = false, center = [0.5, 0.5] } = {}) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fs = 44;
    ctx.font = `${bold ? 700 : 500} ${fs}px Inter, system-ui, sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 28;
    c.width = w; c.height = fs + 22;
    ctx.font = `${bold ? 700 : 500} ${fs}px Inter, system-ui, sans-serif`;
    if (bg) { ctx.fillStyle = bg; const r = 12; ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, c.height, r); ctx.arcTo(w, c.height, 0, c.height, r); ctx.arcTo(0, c.height, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.fill(); }
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, c.height / 2 + 2);
    const tex = new T3.CanvasTexture(c);
    tex.minFilter = T3.LinearFilter;
    const sp = new T3.Sprite(new T3.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    sp.scale.set(size * c.width / c.height, size, 1);
    sp.center.set(center[0], center[1]);
    sp.renderOrder = 10;
    sp.userData.text = text;
    return sp;
  }
  function disposeTree(o) {
    o.traverse(n => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
  }

  class Tank3D {
    constructor(container) {
      this.el = container;
      this.ok = !!T3;
      if (!this.ok) { container.innerHTML = '<p class="nogl">No se pudo cargar Three.js.</p>'; return; }
      try {
        this.renderer = new T3.WebGLRenderer({ antialias: true });
      } catch (e) { this.ok = false; container.innerHTML = '<p class="nogl">Este navegador no tiene WebGL activo; el tanque 3D no puede mostrarse.</p>'; return; }
      this.renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
      this.renderer.setClearColor(0x0d1b2a);
      container.appendChild(this.renderer.domElement);
      this.scene = new T3.Scene();
      this.scene.fog = new T3.Fog(0x0d1b2a, 8, 30);
      this.camera = new T3.PerspectiveCamera(38, 1, 0.005, 200);
      this.controls = new T3.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.scene.add(new T3.HemisphereLight(0xdbeafe, 0x0b1320, 0.85));
      const sun = new T3.DirectionalLight(0xffffff, 0.75); sun.position.set(3, 6, 4); this.scene.add(sun);
      const fill = new T3.DirectionalLight(0x93c5fd, 0.35); fill.position.set(-4, 2, -3); this.scene.add(fill);
      this.world = new T3.Group(); this.scene.add(this.world);
      this.dyn = new T3.Group(); this.scene.add(this.dyn);
      this.mats = {
        glass: new T3.MeshPhongMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.16, side: T3.DoubleSide, depthWrite: false, shininess: 90, specular: 0xffffff }),
        edge: new T3.LineBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.85 }),
        water: new T3.MeshPhongMaterial({ color: 0x1d72d8, transparent: true, opacity: 0.72, shininess: 80, specular: 0x88bbff, side: T3.DoubleSide, depthWrite: false }),
        surface: new T3.MeshPhongMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.9, shininess: 120, side: T3.DoubleSide, emissive: 0x0b3a6e, emissiveIntensity: 0.35 }),
        jet: new T3.MeshPhongMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.85, shininess: 100 }),
        pipe: new T3.MeshPhongMaterial({ color: 0xfbbf24, shininess: 60 }),
        stand: new T3.MeshPhongMaterial({ color: 0x334155, shininess: 20 }),
        tick: new T3.LineBasicMaterial({ color: 0xe2e8f0 }),
        level: new T3.LineBasicMaterial({ color: 0x38bdf8 })
      };
      this.frameNeeded = true;
      this.controls.addEventListener('change', () => { this.frameNeeded = true; });
      new ResizeObserver(() => this.resize()).observe(container);
      this.visible = true;
      new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }).observe(container);
      const loop = () => { requestAnimationFrame(loop); if (!this.visible) return; this.controls.update(); if (this.frameNeeded) { this.renderer.render(this.scene, this.camera); this.frameNeeded = false; } };
      this.resize();
      loop();
    }
    resize() {
      if (!this.ok) return;
      const w = this.el.clientWidth, h = this.el.clientHeight || 420;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.frameNeeded = true;
    }

    /* key: geometría; p: dimensiones en cm; z0, d en cm; fmtLen(cm) → texto con unidad */
    setTank(key, p, z0, d, fmtLen) {
      if (!this.ok) return;
      const sig = JSON.stringify([key, p, z0, d, fmtLen(1)]);
      if (sig === this.sig) return;
      const refit = !this.sig || JSON.parse(this.sig)[0] !== key || this.sizeKey !== JSON.stringify(p);
      this.sig = sig; this.sizeKey = JSON.stringify(p);
      disposeTree(this.world); this.world.clear();
      const S = 0.01; // cm → m
      const Tk = Num.TANKS[key];
      this.key = key; this.p = p; this.z0 = z0 * S; this.d = d * S; this.T = Tk;
      const H = Tk.height(p) * S;
      this.H = H;
      // semiancho máximo y profundidad
      let maxHalf = 0; for (let i = 0; i <= 60; i++) maxHalf = Math.max(maxHalf, Tk.half(Tk.height(p) * i / 60, p) * S);
      const depthHalf = key === 'rectangular' ? p.W * S / 2 : key === 'horizontal' ? p.L * S / 2 : maxHalf;
      const widthHalf = key === 'horizontal' ? p.L * S / 2 : maxHalf;
      this.maxHalf = maxHalf;
      const span = Math.max(H, 2 * widthHalf, 2 * depthHalf);
      // base elevada para que el chorro tenga dónde caer
      const E = Math.max(0.35 * H, 0.15 * span);
      this.E = E;
      const g = this.world;
      // piso
      const gridSize = Math.max(2, Math.ceil(span * 4));
      const grid = new T3.GridHelper(gridSize, Math.round(gridSize / Math.max(0.05, niceTick(span / 5))), 0x2e5470, 0x1b3347);
      g.add(grid);
      // paredes
      const tank = new T3.Group(); tank.position.y = E; g.add(tank); this.tank = tank;
      if (key === 'rectangular') {
        const L = p.L * S, W = p.W * S;
        const box = new T3.BoxGeometry(L, H, W); box.translate(0, H / 2, 0);
        tank.add(new T3.Mesh(box, this.mats.glass));
        tank.add(new T3.LineSegments(new T3.EdgesGeometry(box), this.mats.edge));
      } else if (key === 'horizontal') {
        const R = p.D * S / 2, L = p.L * S;
        const cyl = new T3.CylinderGeometry(R, R, L, 64, 1, false); cyl.rotateZ(Math.PI / 2); cyl.translate(0, R, 0);
        tank.add(new T3.Mesh(cyl, this.mats.glass));
        [-L / 2, L / 2].forEach(x => tank.add(this.ring(R, x, R, 'x')));
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; tank.add(this.line([[-L / 2, R + R * Math.sin(a), R * Math.cos(a)], [L / 2, R + R * Math.sin(a), R * Math.cos(a)]], this.mats.edge)); }
      } else {
        const pts = [];
        const N = key === 'esfera' ? 64 : 24;
        for (let i = 0; i <= N; i++) { const y = H * i / N; pts.push(new T3.Vector2(Math.max(1e-4, Tk.half(y / S, p) * S), y)); }
        tank.add(new T3.Mesh(new T3.LatheGeometry(pts, 72), this.mats.glass));
        if (key !== 'esfera' && key !== 'cono') {
          const b = new T3.Mesh(new T3.CircleGeometry(Tk.half(0, p) * S, 72), this.mats.glass); b.rotation.x = -Math.PI / 2; tank.add(b);
          tank.add(this.ring(Tk.half(0, p) * S, 0, 0, 'y'));
        }
        tank.add(this.ring(Tk.half(Tk.height(p), p) * S, H, 0, 'y'));
        if (key === 'esfera') tank.add(this.ring(p.D * S / 2, H / 2, 0, 'y'));
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          tank.add(this.line(pts.map(q => [q.x * Math.cos(a), q.y, q.x * Math.sin(a)]), this.mats.edge));
        }
      }
      // salida
      this.buildOutlet();
      this.buildStand(widthHalf, depthHalf, span);
      // regla graduada y cotas
      this.buildRuler(fmtLen);
      // agua (se crea en setLevel)
      this.water = null; this.level = null; this.jet = null;
      if (refit) this.fit(span);
      this.frameNeeded = true;
    }
    /* Soporte: mesa si la salida es lateral; patas o cunas si la salida está en el fondo,
       para que el chorro caiga libre hasta el piso. */
    buildStand(widthHalf, depthHalf, span) {
      const g = this.world, E = this.E, { key, p, T: Tk } = this, S = 0.01;
      const legR = Math.max(0.004, 0.012 * span);
      if (this.outlet.dir === 'x') {
        const topW = 2 * widthHalf * 1.15 + 0.02, topD = 2 * depthHalf * 1.15 + 0.02, th = Math.max(0.01, 0.03 * span);
        const table = new T3.Mesh(new T3.BoxGeometry(topW, th, topD), this.mats.stand);
        table.position.set(0, E - th / 2, 0); g.add(table);
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) => {
          const leg = new T3.Mesh(new T3.CylinderGeometry(legR, legR, E - th, 10), this.mats.stand);
          leg.position.set(a * (topW / 2 - legR * 2), (E - th) / 2, b * (topD / 2 - legR * 2)); g.add(leg);
        });
      } else if (key === 'horizontal') {
        const R = p.D * S / 2, L = p.L * S;
        [-0.32 * L, 0.32 * L].forEach(x => {
          const sh = new T3.Shape();
          const w = R * 0.85, top = E + R * 0.45;
          sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, top);
          for (let k = 0; k <= 24; k++) { const zz = w - 2 * w * k / 24; sh.lineTo(zz, E + R - Math.sqrt(Math.max(0, R * R - zz * zz))); }
          sh.lineTo(-w, top); sh.lineTo(-w, 0);
          const geo = new T3.ExtrudeGeometry(sh, { depth: Math.max(0.02, 0.05 * L), bevelEnabled: false });
          geo.rotateY(Math.PI / 2); geo.translate(x, 0, 0);
          g.add(new T3.Mesh(geo, this.mats.stand));
        });
      } else {
        // patas que tocan la pared en y = yc y anillo de apoyo
        const H = this.H;
        const yc = key === 'esfera' ? H * 0.3 : H * 0.25;
        const rc = Tk.half(yc / S, p) * S;
        const ring = new T3.Mesh(new T3.TorusGeometry(rc, legR * 0.9, 8, 64), this.mats.stand);
        ring.rotation.x = Math.PI / 2; ring.position.y = E + yc; g.add(ring);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          const leg = new T3.Mesh(new T3.CylinderGeometry(legR, legR, E + yc, 10), this.mats.stand);
          leg.position.set(rc * Math.cos(a), (E + yc) / 2, rc * Math.sin(a)); g.add(leg);
        }
      }
    }
    ring(r, at, off, axis) {
      const pts = [];
      for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2; pts.push(axis === 'y' ? [r * Math.cos(a), at, r * Math.sin(a)] : [at, off + r * Math.sin(a), r * Math.cos(a)]); }
      return this.line(pts, this.mats.edge);
    }
    line(pts, mat) { return new T3.Line(new T3.BufferGeometry().setFromPoints(pts.map(q => new T3.Vector3(q[0], q[1], q[2]))), mat); }

    buildOutlet() {
      const { key, p, T: Tk } = this;
      const S = 0.01, d = this.d, z0 = this.z0;
      const yc = Math.max(z0, d / 2);
      const halfAt = key === 'horizontal' ? 0 : Tk.half(Math.min(yc / S, Tk.height(p)), p) * S;
      const pipeLen = Math.max(4 * d, 0.06 * Math.max(this.H, this.maxHalf * 2));
      const r = Math.max(d / 2, 0.0008);
      let mesh, exit, dir;
      if (halfAt > 3 * d && !['horizontal', 'esfera', 'cono'].includes(key)) {
        // salida lateral (como en el artículo): tubo horizontal en la pared, eje +x
        const xw = key === 'rectangular' ? p.L * S / 2 : halfAt;
        const geo = new T3.CylinderGeometry(r * 1.25, r * 1.25, pipeLen, 24); geo.rotateZ(Math.PI / 2);
        mesh = new T3.Mesh(geo, this.mats.pipe);
        mesh.position.set(xw + pipeLen / 2 - 0.002, yc, 0);
        exit = new T3.Vector3(xw + pipeLen, yc, 0); dir = 'x';
      } else {
        // salida en el fondo: tubo vertical hacia abajo
        const geo = new T3.CylinderGeometry(r * 1.25, r * 1.25, pipeLen, 24);
        mesh = new T3.Mesh(geo, this.mats.pipe);
        const ybot = key === 'horizontal' ? 0 : 0;
        mesh.position.set(0, ybot - pipeLen / 2 + 0.002, 0);
        exit = new T3.Vector3(0, ybot - pipeLen, 0); dir = 'y';
      }
      this.tank.add(mesh);
      // anillo resaltado para ver el orificio a cualquier escala
      const hl = new T3.Mesh(new T3.TorusGeometry(Math.max(r * 2.2, 0.012 * this.H), Math.max(r * 0.25, 0.0015 * this.H), 8, 40), new T3.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }));
      hl.position.copy(exit);
      if (dir === 'x') hl.rotation.y = Math.PI / 2; else hl.rotation.x = Math.PI / 2;
      this.tank.add(hl);
      this.outlet = { exit, dir, r };
    }

    buildRuler(fmtLen) {
      const { key, p, T: Tk, H } = this;
      const S = 0.01;
      const back = key === 'rectangular' ? -p.W * S / 2 - 0.01 * H : key === 'horizontal' ? -p.D * S / 2 : -Tk.half(Tk.height(p), p) * S;
      const xr = -(key === 'rectangular' ? p.L * S / 2 : key === 'horizontal' ? p.L * S / 2 : this.maxHalf) - 0.04 * H - 0.01;
      const step = niceTick(H / 6);
      const ruler = new T3.Group(); ruler.position.set(xr, 0, 0); this.tank.add(ruler);
      ruler.add(this.line([[0, 0, 0], [0, H, 0]], this.mats.tick));
      const fs = Math.max(0.025, 0.045 * H);
      for (let y = 0; y <= H + 1e-9; y += step) {
        ruler.add(this.line([[0, y, 0], [-0.03 * H, y, 0]], this.mats.tick));
        const s = textSprite(fmtLen(y / S), { size: 0.02, bg: null, color: '#cbd5e1', center: [1, 0.5] });
        s.position.set(-0.04 * H, y, 0); ruler.add(s);
      }
      this.rulerX = xr;
      // cotas de dimensiones
      const dimTxt = key === 'rectangular' ? `L = ${fmtLen(p.L)} · W = ${fmtLen(p.W)} · H = ${fmtLen(p.H)}`
        : key === 'horizontal' ? `D = ${fmtLen(p.D)} · L = ${fmtLen(p.L)}`
        : key === 'esfera' ? `D = ${fmtLen(p.D)}`
        : key === 'tronco' ? `d₁ = ${fmtLen(p.d1)} · d₂ = ${fmtLen(p.d2)} · H = ${fmtLen(p.H)}`
        : `D = ${fmtLen(p.D)} · H = ${fmtLen(p.H)}`;
      const dim = textSprite(dimTxt, { size: 0.028, color: '#f8fafc', bold: true, center: [0.5, 0] });
      dim.position.set(0, H * 1.04 + 0.01, 0); this.tank.add(dim);
      const out = textSprite(`salida d = ${fmtLen(this.d / S)}${this.z0 > 0 ? ` · z₀ = ${fmtLen(this.z0 / S)}` : ''}`, { size: 0.022, color: '#fde68a', center: [0, 1.2] });
      const ex = this.outlet.exit;
      out.position.set(ex.x + 0.01 * H, ex.y, 0); this.tank.add(out);
      this.fs = fs; this.fmtLen = fmtLen;
      void back;
    }

    fit(span) {
      const cy = this.E + this.H / 2;
      const dist = span * 2.35 + 0.2;
      this.camera.position.set(dist * 0.62, cy + dist * 0.36, dist * 0.78);
      this.controls.target.set(0, cy * 0.85, 0);
      this.camera.near = Math.max(0.001, span / 500); this.camera.far = span * 60 + 10;
      this.scene.fog.near = dist * 2.2; this.scene.fog.far = dist * 6;
      this.camera.updateProjectionMatrix();
      this.home = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
      this.controls.update();
    }
    resetView() {
      if (!this.home) return;
      this.camera.position.copy(this.home.pos); this.controls.target.copy(this.home.target); this.controls.update(); this.frameNeeded = true;
    }

    /* h en cm (nivel medido desde el fondo); v en cm/s */
    setLevel(hcm, vcm) {
      if (!this.ok || !this.tank) return;
      const S = 0.01, { key, p, T: Tk } = this;
      const h = Math.max(0, Math.min(hcm * S, this.H));
      if (this.water) { this.tank.remove(this.water); disposeTree(this.water); }
      const w = new T3.Group();
      if (h > 1e-5) {
        if (key === 'rectangular') {
          const L = p.L * S * 0.996, W = p.W * S * 0.996;
          const box = new T3.Mesh(new T3.BoxGeometry(L, h, W), this.mats.water); box.position.y = h / 2; w.add(box);
          const top = new T3.Mesh(new T3.PlaneGeometry(L, W), this.mats.surface); top.rotation.x = -Math.PI / 2; top.position.y = h; w.add(top);
        } else if (key === 'horizontal') {
          const R = p.D * S / 2 * 0.996, L = p.L * S * 0.996;
          const sh = new T3.Shape();
          const N = 48, pts = [];
          for (let i = 0; i <= N; i++) { const y = h * i / N; pts.push([Math.sqrt(Math.max(0, R * R - (y - R) * (y - R))), y]); }
          sh.moveTo(0, 0);
          pts.forEach(q => sh.lineTo(q[0], q[1]));
          for (let i = N; i >= 0; i--) sh.lineTo(-pts[i][0], pts[i][1]);
          const geo = new T3.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 1 });
          geo.rotateY(Math.PI / 2); geo.translate(-L / 2, 0, 0);
          w.add(new T3.Mesh(geo, this.mats.water));
          const half = Math.sqrt(Math.max(0, R * R - (h - R) * (h - R)));
          const top = new T3.Mesh(new T3.PlaneGeometry(L, 2 * half), this.mats.surface); top.rotation.x = -Math.PI / 2; top.position.y = h; w.add(top);
        } else {
          const N = key === 'esfera' ? 48 : 16, pts = [];
          const r0 = Tk.half(0, p) * S * 0.995;
          if (r0 < 1e-3) pts.push(new T3.Vector2(1e-4, 0));
          for (let i = 0; i <= N; i++) { const y = h * i / N; pts.push(new T3.Vector2(Math.max(1e-4, Tk.half(y / S, p) * S * 0.995), y)); }
          w.add(new T3.Mesh(new T3.LatheGeometry(pts, 72), this.mats.water));
          if (r0 >= 1e-3) { const bot = new T3.Mesh(new T3.CircleGeometry(r0, 72), this.mats.water); bot.rotation.x = Math.PI / 2; bot.position.y = 0.0005; w.add(bot); }
          const top = new T3.Mesh(new T3.CircleGeometry(Math.max(1e-4, Tk.half(h / S, p) * S * 0.995), 72), this.mats.surface);
          top.rotation.x = -Math.PI / 2; top.position.y = h; w.add(top);
        }
        // línea y etiqueta del nivel sobre la regla
        w.add(this.line([[this.rulerX, h, 0], [this.rulerX + 0.04 * this.H, h, 0]], this.mats.level));
      }
      const lbl = textSprite(`h = ${this.fmtLen(h / S)}`, { size: 0.028, color: '#7dd3fc', bold: true, center: [1, 0.5] });
      lbl.position.set(this.rulerX - 0.2 * this.H, Math.max(h, 0.02 * this.H), 0);
      w.add(lbl);
      // chorro con la trayectoria parabólica real (v en m/s, g = 9,81 m/s²)
      const v = (vcm || 0) * S;
      const { exit, dir, r } = this.outlet;
      if (v > 1e-4) {
        const yFloor = -this.E; // en coordenadas del tanque
        const pts = [];
        if (dir === 'x') {
          const tFall = (v * 0 + Math.sqrt(2 * 9.81 * (exit.y - yFloor))) / 9.81;
          for (let i = 0; i <= 40; i++) { const tt = tFall * i / 40; pts.push(new T3.Vector3(exit.x + v * tt, exit.y - 4.905 * tt * tt, 0)); }
        } else {
          const len = exit.y - yFloor;
          for (let i = 0; i <= 12; i++) pts.push(new T3.Vector3(0, exit.y - len * i / 12, 0));
        }
        const curve = new T3.CatmullRomCurve3(pts);
        const jet = new T3.Mesh(new T3.TubeGeometry(curve, 64, Math.max(r * 0.85, 0.0007), 10, false), this.mats.jet);
        w.add(jet);
        const end = pts[pts.length - 1];
        const splash = new T3.Mesh(new T3.CircleGeometry(Math.max(r * 6, 0.01 * this.H), 32), new T3.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35 }));
        splash.rotation.x = -Math.PI / 2; splash.position.set(end.x, yFloor + 0.001, end.z); w.add(splash);
      }
      this.water = w; this.tank.add(w);
      this.frameNeeded = true;
    }
  }

  function niceTick(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  global.Tank3D = Tank3D;
})(window);
