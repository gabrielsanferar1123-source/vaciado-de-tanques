/* Núcleo numérico: geometrías de tanque, ley de Torricelli, regresiones por
   mínimos cuadrados (convención de Excel), diferenciación numérica y modelos EDO.
   Unidades internas: longitudes en cm, áreas en cm², tiempo en minutos. */
(function (global) {
  'use strict';

  const G = 981; // cm/s²

  /* ---------- Formato numérico ---------- */
  let DEC = ',';
  function setDecimal(sep) { DEC = sep; }
  function fmt(x, d = 4) {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
    let s = Math.abs(x) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : x.toFixed(d);
    if (s.startsWith('-')) s = '−' + s.slice(1);
    return DEC === ',' ? s.replace('.', ',') : s;
  }
  /* Recorta ceros sobrantes: 45.700 -> 45,7 */
  function fmtT(x, d = 4) {
    if (!Number.isFinite(x)) return fmt(x, d);
    let s = x.toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    if (s.startsWith('-')) s = '−' + s.slice(1);
    return DEC === ',' ? s.replace('.', ',') : s;
  }
  /* Número para LaTeX (coma decimal protegida con llaves) */
  function tn(x, d = 4, trim = false) {
    const s = (trim ? fmtT(x, d) : fmt(x, d)).replace('−', '-');
    return DEC === ',' ? s.replace(',', '{,}') : s;
  }
  /* Término con signo para LaTeX: " + 3{,}2" o " - 3{,}2" */
  function ts(x, d = 4, trim = false) {
    return (x < 0 ? ' - ' : ' + ') + tn(Math.abs(x), d, trim);
  }

  /* ---------- Geometrías ----------
     Cada geometría define:
       half(h,p)  semiancho de la sección frontal a la altura h (para dibujar)
       area(h,p)  área de la superficie libre A_w(h)
       F(u,p)     primitiva de A_w(u²) respecto a u  (t(h) = 2/K [F(√h0) − F(√h)])
       vol(h,p)   volumen de líquido hasta la altura h                         */
  const PI = Math.PI;
  const frustum = (r1, r2, H) => {
    const m = (r2 - r1) / H;
    return {
      m,
      half: h => r1 + m * h,
      area: h => PI * Math.pow(r1 + m * h, 2),
      F: u => PI * (r1 * r1 * u + (2 / 3) * r1 * m * Math.pow(u, 3) + (m * m / 5) * Math.pow(u, 5)),
      vol: h => { const r = r1 + m * h; return PI * h / 3 * (r1 * r1 + r1 * r + r * r); }
    };
  };

  const TANKS = {
    cilindro: {
      nombre: 'Cilindro vertical',
      articulo: 'cilíndrico vertical',
      params: [['D', 'Diámetro interno D', 40], ['H', 'Altura del tanque H', 60]],
      height: p => p.H,
      half: (h, p) => p.D / 2,
      area: (h, p) => PI * p.D * p.D / 4,
      F: (u, p) => PI * p.D * p.D / 4 * u,
      vol: (h, p) => PI * p.D * p.D / 4 * h,
      constArea: true,
      areaSym: () => 'A_w = \\pi\\left(\\dfrac{D}{2}\\right)^2',
      areaNum: p => `A_w = \\pi\\left(\\dfrac{${tn(p.D, 2, true)}}{2}\\right)^2 = ${tn(PI * p.D * p.D / 4, 2)}\\ \\text{cm}^2`,
      dims: p => `diámetro interno D = ${fmtT(p.D, 2)} cm y altura H = ${fmtT(p.H, 2)} cm`
    },
    rectangular: {
      nombre: 'Prisma rectangular',
      articulo: 'de sección rectangular',
      params: [['L', 'Largo L', 50], ['W', 'Ancho W', 40], ['H', 'Altura del tanque H', 60]],
      height: p => p.H,
      half: (h, p) => p.L / 2,
      area: (h, p) => p.L * p.W,
      F: (u, p) => p.L * p.W * u,
      vol: (h, p) => p.L * p.W * h,
      constArea: true,
      areaSym: () => 'A_w = L\\,W',
      areaNum: p => `A_w = ${tn(p.L, 2, true)}\\times ${tn(p.W, 2, true)} = ${tn(p.L * p.W, 2)}\\ \\text{cm}^2`,
      dims: p => `largo L = ${fmtT(p.L, 2)} cm, ancho W = ${fmtT(p.W, 2)} cm y altura H = ${fmtT(p.H, 2)} cm`
    },
    tronco: {
      nombre: 'Tronco de cono (balde)',
      articulo: 'en forma de tronco de cono (balde)',
      params: [['d1', 'Diámetro del fondo d₁', 30], ['d2', 'Diámetro de la boca d₂', 40], ['H', 'Altura del tanque H', 55]],
      height: p => p.H,
      half: (h, p) => frustum(p.d1 / 2, p.d2 / 2, p.H).half(h),
      area: (h, p) => frustum(p.d1 / 2, p.d2 / 2, p.H).area(h),
      F: (u, p) => frustum(p.d1 / 2, p.d2 / 2, p.H).F(u),
      vol: (h, p) => frustum(p.d1 / 2, p.d2 / 2, p.H).vol(h),
      areaSym: () => 'A_w(h) = \\pi\\,(r_1 + m\\,h)^2,\\qquad m = \\dfrac{r_2 - r_1}{H}',
      areaNum: p => {
        const m = (p.d2 - p.d1) / 2 / p.H;
        return `A_w(h) = \\pi\\,(${tn(p.d1 / 2, 3, true)} ${ts(m, 5)}\\,h)^2\\ \\text{cm}^2`;
      },
      tSym: () => '\\begin{aligned} t(h) = \\dfrac{2\\pi}{C_d A_0\\sqrt{2g}}\\Big[&\\,r_1^2\\big(\\sqrt{h_0}-\\sqrt{h}\\big) + \\tfrac{2}{3}r_1 m\\big(h_0^{3/2}-h^{3/2}\\big) \\\\ &+ \\tfrac{1}{5}m^2\\big(h_0^{5/2}-h^{5/2}\\big)\\Big]\\end{aligned}',
      dims: p => `diámetro de fondo d₁ = ${fmtT(p.d1, 2)} cm, diámetro de boca d₂ = ${fmtT(p.d2, 2)} cm y altura H = ${fmtT(p.H, 2)} cm`
    },
    cono: {
      nombre: 'Cono (vértice abajo)',
      articulo: 'cónico con el vértice hacia abajo',
      params: [['D', 'Diámetro de la boca D', 50], ['H', 'Altura del cono H', 60]],
      height: p => p.H,
      half: (h, p) => frustum(0, p.D / 2, p.H).half(h),
      area: (h, p) => frustum(0, p.D / 2, p.H).area(h),
      F: (u, p) => frustum(0, p.D / 2, p.H).F(u),
      vol: (h, p) => frustum(0, p.D / 2, p.H).vol(h),
      areaSym: () => 'A_w(h) = \\pi\\left(\\dfrac{R}{H}\\right)^2 h^2',
      areaNum: p => `A_w(h) = ${tn(PI * Math.pow(p.D / 2 / p.H, 2), 5)}\\,h^2\\ \\text{cm}^2`,
      tSym: () => 't(h) = \\dfrac{2\\pi (R/H)^2}{5\\,C_d A_0\\sqrt{2g}}\\left(h_0^{5/2}-h^{5/2}\\right)',
      dims: p => `diámetro de boca D = ${fmtT(p.D, 2)} cm y altura H = ${fmtT(p.H, 2)} cm`
    },
    esfera: {
      nombre: 'Esfera',
      articulo: 'esférico',
      params: [['D', 'Diámetro interno D', 50]],
      height: p => p.D,
      half: (h, p) => Math.sqrt(Math.max(0, p.D * h - h * h)),
      area: (h, p) => PI * Math.max(0, p.D * h - h * h),
      F: (u, p) => PI * (p.D * Math.pow(u, 3) / 3 - Math.pow(u, 5) / 5),
      vol: (h, p) => PI * h * h * (3 * p.D / 2 - h) / 3,
      areaSym: () => 'A_w(h) = \\pi\\,(D\\,h - h^2)',
      areaNum: p => `A_w(h) = \\pi\\,(${tn(p.D, 2, true)}\\,h - h^2)\\ \\text{cm}^2`,
      tSym: () => '\\begin{aligned} t(h) = \\dfrac{2\\pi}{C_d A_0\\sqrt{2g}}\\Big[&\\,\\tfrac{D}{3}\\big(h_0^{3/2}-h^{3/2}\\big) \\\\ &- \\tfrac{1}{5}\\big(h_0^{5/2}-h^{5/2}\\big)\\Big]\\end{aligned}',
      dims: p => `diámetro interno D = ${fmtT(p.D, 2)} cm`
    },
    horizontal: {
      nombre: 'Cilindro horizontal',
      articulo: 'cilíndrico horizontal',
      params: [['D', 'Diámetro interno D', 40], ['L', 'Longitud L', 80]],
      height: p => p.D,
      half: (h, p) => Math.sqrt(Math.max(0, p.D * h - h * h)),
      area: (h, p) => 2 * p.L * Math.sqrt(Math.max(0, p.D * h - h * h)),
      F: (u, p) => -(2 * p.L / 3) * Math.pow(Math.max(0, p.D - u * u), 1.5),
      vol: (h, p) => {
        const R = p.D / 2;
        return p.L * (R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(Math.max(0, 2 * R * h - h * h)));
      },
      areaSym: () => 'A_w(h) = 2L\\sqrt{D\\,h - h^2}',
      areaNum: p => `A_w(h) = ${tn(2 * p.L, 2, true)}\\sqrt{${tn(p.D, 2, true)}\\,h - h^2}\\ \\text{cm}^2`,
      tSym: () => 't(h) = \\dfrac{4L}{3\\,C_d A_0\\sqrt{2g}}\\left[(D-h)^{3/2} - (D-h_0)^{3/2}\\right]',
      dims: p => `diámetro interno D = ${fmtT(p.D, 2)} cm y longitud L = ${fmtT(p.L, 2)} cm`
    }
  };

  /* ---------- Modelo de Torricelli ---------- */
  /* Crea un modelo teórico para la geometría `key`, parámetros p,
     orificio de diámetro d (cm), coeficiente Cd y nivel inicial h0 (cm). */
  /* z0: elevación de la salida sobre el fondo (cm). La carga hidráulica es h − z0
     y el tanque deja de vaciarse cuando el nivel llega a z0.
     t(h) = 2/K ∫_{√(h−z0)}^{√(h0−z0)} A_w(z0 + u²) du   (cambio de variable h = z0 + u²)
     Con z0 = 0 se usa la primitiva cerrada F; con z0 > 0, Simpson acumulado. */
  function torricelli(key, p, d, Cd, h0, z0 = 0) {
    const T = TANKS[key];
    const A0 = PI * d * d / 4;
    const K = Cd * A0 * Math.sqrt(2 * G); // cm^2.5/s
    z0 = Math.max(0, Math.min(z0, h0));
    const U0 = Math.sqrt(h0 - z0);
    let Fu;
    if (z0 === 0) Fu = u => T.F(u, p);
    else {
      const N = 2000, du = U0 / N, cum = new Float64Array(N + 1);
      const f = u => T.area(z0 + u * u, p);
      for (let i = 0; i < N; i++) {
        const a = i * du;
        cum[i + 1] = cum[i] + du / 6 * (f(a) + 4 * f(a + du / 2) + f(a + du));
      }
      Fu = u => {
        if (du === 0) return 0;
        const x = Math.min(N, Math.max(0, u / du)), i = Math.min(N - 1, Math.floor(x));
        return cum[i] + (cum[i + 1] - cum[i]) * (x - i);
      };
    }
    const Fh0 = Fu(U0);
    const tOf = h => (2 / K) * (Fh0 - Fu(Math.sqrt(Math.max(0, Math.min(h, h0) - z0)))) / 60; // min
    const tEmpty = tOf(z0);
    const hOf = t => { // inversión por bisección (t(h) es monótona)
      if (t <= 0) return h0;
      if (t >= tEmpty) return z0;
      let lo = z0, hi = h0;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (tOf(mid) > t) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    const head = h => Math.max(h - z0, 0);
    const dhdt = h => { const A = T.area(h, p); return A > 0 ? -K * Math.sqrt(head(h)) / A * 60 : 0; }; // cm/min
    return {
      A0, K, Cd, z0, h0, tOf, hOf, tEmpty, dhdt, head,
      area: h => T.area(h, p),
      vol: h => T.vol(h, p),
      v: h => Math.sqrt(2 * G * head(h)), // cm/s (velocidad ideal de Torricelli)
      Q: h => Cd * A0 * Math.sqrt(2 * G * head(h)) // cm³/s
    };
  }

  /* Ajuste del Cd efectivo a unos datos (t en min desde la primera lectura). */
  function fitCd(key, p, d, h0, ts_, hs, z0 = 0) {
    const base = torricelli(key, p, d, 1, h0, z0);
    const sse = Cd => {
      let s = 0;
      for (let i = 0; i < ts_.length; i++) { const e = hs[i] - base.hOf(Cd * ts_[i]); s += e * e; }
      return s;
    };
    // búsqueda gruesa + sección dorada
    let best = 0.05, bestV = Infinity;
    for (let c = 0.02; c <= 3; c += 0.02) { const v = sse(c); if (v < bestV) { bestV = v; best = c; } }
    let a = Math.max(0.001, best - 0.04), b = best + 0.04;
    const gr = (Math.sqrt(5) - 1) / 2;
    let c1 = b - gr * (b - a), c2 = a + gr * (b - a), f1 = sse(c1), f2 = sse(c2);
    for (let i = 0; i < 60; i++) {
      if (f1 < f2) { b = c2; c2 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = sse(c1); }
      else { a = c1; c1 = c2; f1 = f2; c2 = a + gr * (b - a); f2 = sse(c2); }
    }
    return (a + b) / 2;
  }

  /* ---------- Estadística ---------- */
  const sum = a => a.reduce((s, v) => s + v, 0);
  const mean = a => sum(a) / a.length;

  function linfit(x, y) {
    const n = x.length, mx = mean(x), my = mean(y);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    const a = sxy / sxx, b = my - a * mx;
    let ssr = 0, sst = 0;
    for (let i = 0; i < n; i++) { ssr += (y[i] - (a * x[i] + b)) ** 2; sst += (y[i] - my) ** 2; }
    return { a, b, r2: 1 - ssr / sst, n };
  }
  /* R² de determinación (1 − SSE/SST) y r² (correlación al cuadrado) */
  function r2det(y, f) {
    const my = mean(y);
    let ssr = 0, sst = 0;
    for (let i = 0; i < y.length; i++) { ssr += (y[i] - f[i]) ** 2; sst += (y[i] - my) ** 2; }
    return 1 - ssr / sst;
  }
  function r2corr(y, f) {
    const my = mean(y), mf = mean(f);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < y.length; i++) { sxy += (y[i] - my) * (f[i] - mf); sxx += (f[i] - mf) ** 2; syy += (y[i] - my) ** 2; }
    return (sxy * sxy) / (sxx * syy);
  }
  function rmse(y, f) { let s = 0; for (let i = 0; i < y.length; i++) s += (y[i] - f[i]) ** 2; return Math.sqrt(s / y.length); }

  /* ---------- Análisis completo (metodología Plaza, 2017) ---------- */
  function analyze(tRaw, h) {
    const t0 = tRaw[0];
    const t = tRaw.map(v => v - t0);
    const n = t.length;
    const h0 = h[0];

    // V. Regresión lineal directa h = a t + b
    const lin = linfit(t, h);

    // VI. Diferenciación numérica por diferencias centradas
    const deriv = t.map((_, i) => (i === 0 || i === n - 1) ? null : (h[i + 1] - h[i - 1]) / (t[i + 1] - t[i - 1]));
    const steps = [];
    for (let i = 1; i < n; i++) steps.push(+(t[i] - t[i - 1]).toFixed(9));
    const uniform = steps.every(s => Math.abs(s - steps[0]) < 1e-6);

    // Tabla 3: (h, −dh/dt) en los puntos interiores
    const pairs = [];
    for (let i = 1; i < n - 1; i++) pairs.push({ h: h[i], y: -deriv[i], i });
    const X = pairs.map(q => q.h), Y = pairs.map(q => q.y);
    const posPairs = pairs.filter(q => q.h > 0 && q.y > 0);
    const excluded = pairs.length - posPairs.length;

    // Cuadro 4: regresiones de −dh/dt contra h (Excel: exp y potencial linealizadas)
    const fLin = linfit(X, Y);
    const le = linfit(posPairs.map(q => q.h), posPairs.map(q => Math.log(q.y)));
    const fExp = { A: Math.exp(le.b), B: le.a, r2: le.r2 };
    const lp = linfit(posPairs.map(q => Math.log(q.h)), posPairs.map(q => Math.log(q.y)));
    const fPow = { A: Math.exp(lp.b), n: lp.a, r2: lp.r2 };

    // Cuadro 5: soluciones de las EDO con h(0) = h0
    const models = [];
    { // lineal: dh/dt = −(α h + β)
      const al = fLin.a, be = fLin.b, k = be / al, C1 = h0 + k;
      const f = tt => Math.abs(al) < 1e-12 ? h0 - be * tt : C1 * Math.exp(-al * tt) - k;
      const ratio = k / C1;
      const tE = Math.abs(al) < 1e-12 ? (be > 0 ? h0 / be : Infinity) : (ratio > 0 && ratio < 1 ? -Math.log(ratio) / al : Infinity);
      models.push({ key: 'lineal', nombre: 'Lineal', fitR2: fLin.r2, coef: { alpha: al, beta: be, C1, C2: k }, f, tEmpty: tE });
    }
    { // exponencial: dh/dt = −A e^{B h}
      const { A, B } = fExp, c = Math.exp(-B * h0);
      const f = tt => {
        if (Math.abs(B) < 1e-12) return h0 - A * tt;
        const arg = A * B * tt + c;
        return arg > 0 ? -Math.log(arg) / B : NaN;
      };
      const tE = Math.abs(B) < 1e-12 ? h0 / A : (1 - c) / (A * B);
      models.push({ key: 'exponencial', nombre: 'Exponencial', fitR2: fExp.r2, coef: { A, B, AB: A * B, c, invB: 1 / B }, f, tEmpty: tE > 0 ? tE : Infinity });
    }
    { // potencial: dh/dt = −A h^n
      const { A, n: m } = fPow, e = 1 - m, base0 = Math.pow(h0, e), k = e * A;
      const f = tt => {
        if (Math.abs(e) < 1e-12) return h0 * Math.exp(-A * tt);
        const b = base0 - k * tt;
        return b >= 0 ? Math.pow(b, 1 / e) : NaN;
      };
      const tE = e > 0 ? base0 / k : Infinity;
      models.push({ key: 'potencial', nombre: 'Potencial', fitR2: fPow.r2, coef: { A, n: m, e, base0, k, exp: 1 / e }, f, tEmpty: tE });
    }

    // Cuadro 6: comparación con los datos reales
    models.forEach(m => {
      m.pred = t.map(m.f);
      const ok = m.pred.map((v, i) => Number.isFinite(v) ? i : -1).filter(i => i >= 0);
      const yy = ok.map(i => h[i]), ff = ok.map(i => m.pred[i]);
      m.R2 = r2det(yy, ff);
      m.r2c = r2corr(yy, ff);
      m.rmse = rmse(yy, ff);
      m.nValid = ok.length;
    });
    const best = models.reduce((a, b) => (b.R2 > a.R2 ? b : a));

    return { t, tRaw, t0, h, n, h0, lin, deriv, steps, uniform, pairs, posPairs, excluded, fLin, fExp, fPow, models, best };
  }

  /* ---------- Simulación de toma de datos ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function niceStep(x) {
    const opts = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30, 60, 120, 240];
    for (const o of opts) if (o >= x) return o;
    return Math.ceil(x / 60) * 60;
  }
  /* Muestreo de la solución teórica cada dt minutos (con ruido opcional),
     usado como "datos" para el método del artículo. */
  function simulate(model, { dt, sigma = 0, res = 0, seed = 1 }) {
    const rnd = mulberry32(seed | 0);
    const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * v); };
    const tt = [], hh = [];
    const N = Math.min(5000, Math.ceil(model.tEmpty / dt - 1e-9));
    for (let k = 0; k <= N; k++) {
      const t = k * dt;
      const exact = model.hOf(t);
      let v = k === 0 ? exact : exact + sigma * gauss();
      v = res > 0 ? Math.round(v / res) * res : v;
      v = Math.max(model.z0, +v.toFixed(9));
      tt.push(+t.toFixed(9)); hh.push(v);
    }
    return { t: tt, h: hh };
  }

  /* Tabla teórica del laboratorio: filas cada dt minutos hasta el nivel final,
     más la fila exacta del instante de vaciado si no cae en un múltiplo de dt. */
  function theoryTable(model, dt, maxRows = 5000) {
    const rows = [];
    const N = Math.ceil(model.tEmpty / dt - 1e-9);
    const n = Math.min(N, maxRows);
    for (let k = 0; k <= n; k++) {
      const t = Math.min(k * dt, model.tEmpty);
      rows.push({ k, t, h: model.hOf(t), final: false });
      if (k * dt >= model.tEmpty) break;
    }
    const last = rows[rows.length - 1];
    if (n === N && Math.abs(last.t - model.tEmpty) > 1e-12) rows.push({ k: rows.length, t: model.tEmpty, h: model.z0, final: true, extra: true });
    else if (n === N) last.final = true;
    return { rows, truncated: n < N, N };
  }

  /* ---------- Datos del artículo de referencia (Tablas 1 y 2) ---------- */
  const PAPER = {
    t: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5],
    h: [45.7, 43, 40.4, 37.8, 35.2, 32.8, 30.3, 27.9, 25.6, 23.3, 21.1, 18.9, 16.7, 14.9, 12.8, 11, 9.2, 7.6, 6, 4.6, 3.3, 2, 1, 0]
  };

  global.Num = { G, TANKS, torricelli, fitCd, analyze, simulate, theoryTable, niceStep, linfit, r2det, r2corr, PAPER, fmt, fmtT, tn, ts, setDecimal, getDecimal: () => DEC };
})(window);
