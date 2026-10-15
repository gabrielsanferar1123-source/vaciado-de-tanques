/* Controlador del laboratorio. Una sola fuente de verdad: el modelo de
   Torricelli (Num.torricelli). Tabla, gráficas, 3D, tarjetas y desarrollo
   leen el mismo objeto y el mismo instante t (segundos). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { TANKS, fmt, fmtT, tn, ts } = Num;
  const K = window.K, TeX = window.TeX;
  const G_SI = 9.81;

  const PRESETS = {
    balde: { geom: 'tronco', unit: 'cm', params: { d1: 30, d2: 40, H: 55 }, h0: 45.7, d: '5/16"', z0: 0, model: 'cd', cd: 0.61, dt: 30 },
    cilindro: { geom: 'cilindro', unit: 'm', params: { D: 0.8, H: 1.2 }, h0: 1, d: '3/4"', z0: 0, model: 'ideal', cd: 1, dt: 30 },
    rectangular: { geom: 'rectangular', unit: 'm', params: { L: 1, W: 0.6, H: 0.8 }, h0: 0.7, d: '3/4"', z0: 0.05, model: 'cd', cd: 0.61, dt: 15 },
    cono: { geom: 'cono', unit: 'm', params: { D: 0.8, H: 1 }, h0: 0.9, d: '1/2"', z0: 0, model: 'cd', cd: 0.61, dt: 5 },
    esfera: { geom: 'esfera', unit: 'm', params: { D: 1.2 }, h0: 1, d: '1"', z0: 0, model: 'cd', cd: 0.61, dt: 30 },
    horizontal: { geom: 'horizontal', unit: 'm', params: { D: 1, L: 2.5 }, h0: 0.9, d: '1"', z0: 0, model: 'cd', cd: 0.61, dt: 60 }
  };
  /* Diámetros en pulgadas fraccionadas (se muestran con su equivalente en mm) */
  const INCHES = ['1/8', '3/16', '1/4', '5/16', '3/8', '1/2', '5/8', '3/4', '7/8', '1', '1 1/4', '1 1/2', '2', '2 1/2', '3', '4'];
  function buildInchSelect() {
    $('doutSel').innerHTML = INCHES.map(f => `<option value='${f}"'>${f}" (${fmt(Units.parseNumber(f) * 25.4, 2)} mm)</option>`).join('') + '<option value="otro">Otro valor (escribir)…</option>';
  }
  function setDiameter(txt) {
    const opt = [...$('doutSel').options].find(o => o.value === txt);
    if (opt) { $('doutSel').value = txt; $('doutWrap').hidden = true; }
    else { $('doutSel').value = 'otro'; $('dout').value = txt; $('doutWrap').hidden = false; }
  }

  const state = {
    geom: 'tronco', unit: 'cm', params: {}, model: 'cd', dt: 30, digits: 4, src: 'table',
    t: 0, playing: false, speed: 1, speedAuto: true, last: null, lab: null, devOpen: true
  };
  Object.keys(TANKS).forEach(k => { state.params[k] = {}; TANKS[k].params.forEach(([pk, , def]) => { state.params[k][pk] = def; }); });

  const store = {
    get(k, d) { try { const v = localStorage.getItem('vt:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vt:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };

  /* ---------- Formato ---------- */
  const D = () => state.digits;
  const unitName = () => state.unit;
  const toU = cm => Units.fromCm(cm, state.unit);
  const fmtLen = (cm, d = D()) => `${fmt(toU(cm), d)} ${state.unit}`;
  const fmtLenShort = cm => `${fmtT(toU(cm), state.unit === 'm' ? 3 : state.unit === 'cm' ? 1 : 0)} ${state.unit}`;
  const sci = (x, d = D()) => {
    if (!Number.isFinite(x)) return fmt(x, d);
    if (x === 0 || (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e7)) return fmt(x, d);
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    return `${fmt(m, d)} × 10${String(e).replace('-', '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c])}`;
  };
  const tx = (x, d = D()) => {
    if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '\\text{—}';
    if (x === 0 || (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e7)) return tn(x, d);
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e);
    return `${tn(m, d)}\\times 10^{${e}}`;
  };
  const txU = (x, u, d) => `${tx(x, d)}\\ \\mathrm{${u}}`;

  /* ---------- Controles ---------- */
  function buildGeomSelect() {
    $('geom').innerHTML = Object.entries(TANKS).map(([k, T]) => `<option value="${k}">${T.nombre}</option>`).join('');
    $('geom').value = state.geom;
  }
  function buildGeomParams() {
    const T = TANKS[state.geom];
    $('geomParams').innerHTML = T.params.map(([k, label]) =>
      `<label>${label} <span class="u">(${unitName()})</span><input type="text" inputmode="decimal" data-p="${k}" id="p_${k}" value="${fmtT(toU(state.params[state.geom][k]), 6)}"></label>`).join('');
    document.querySelectorAll('[data-u]').forEach(s => { s.textContent = `(${unitName()})`; });
  }
  const segOn = (id, attr, val) => document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset[attr] === String(val)));
  const readNum = id => Units.parseNumber($(id).value);

  function parseOwn(text) {
    const t = [], h = [];
    text.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line) return;
      let tok = /[\t;]/.test(line) || /\s/.test(line) ? line.split(/[\t;]+|\s+/) : line.split(',');
      tok = tok.filter(Boolean).map(s => s.replace(',', '.'));
      if (tok.length < 2) return;
      const a = parseFloat(tok[0]), b = parseFloat(tok[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) { t.push(a); h.push(b); }
    });
    const idx = t.map((_, i) => i).sort((i, j) => t[i] - t[j]);
    return { t: idx.map(i => t[i]), h: idx.map(i => h[i]) };
  }

  /* ---------- Lectura y validación ---------- */
  function readConfig() {
    const errors = [], warns = [];
    const key = state.geom, T = TANKS[key];
    const p = {};
    document.querySelectorAll('#geomParams input').forEach(inp => inp.classList.remove('bad'));
    T.params.forEach(([k, label]) => {
      const v = readNum('p_' + k);
      if (!Number.isFinite(v) || v <= 0) { errors.push(`${label}: debe ser un número mayor que cero.`); $('p_' + k).classList.add('bad'); }
      else { p[k] = Units.toCm(v, state.unit); state.params[key][k] = p[k]; }
    });
    if (key === 'tronco' && p.d1 && p.d2 && p.d1 === p.d2) warns.push('Con d₁ = d₂ el tronco de cono es un cilindro.');
    const Ht = errors.length ? NaN : T.height(p);

    const h0v = readNum('h0');
    $('h0').classList.remove('bad');
    let h0 = NaN;
    if (!Number.isFinite(h0v) || h0v <= 0) { errors.push('La altura inicial h₀ debe ser mayor que cero.'); $('h0').classList.add('bad'); }
    else {
      h0 = Units.toCm(h0v, state.unit);
      if (h0 > Ht + 1e-9) { errors.push(`La altura inicial (${fmtLen(h0, 3)}) supera la altura del tanque (${fmtLen(Ht, 3)}).`); $('h0').classList.add('bad'); }
    }

    const dSel = $('doutSel').value;
    const dp = Units.parseLength(dSel === 'otro' ? $('dout').value : dSel, 'mm');
    $('dout').classList.remove('bad');
    let d = NaN, dHint = '';
    if (dp.error) { errors.push('Diámetro de salida: ' + dp.error); $('dout').classList.add('bad'); }
    else {
      d = dp.cm;
      dHint = dp.unit === 'in'
        ? `${/\//.test(dp.text) ? dp.text.replace(/["”]\s*$/, '') + '" = ' : ''}${fmtT(dp.value, 4)}" × 25,4 mm/" = <b>${fmt(d * 10, 3)} mm</b> = ${sci(d / 100, 5)} m.<br><span class="warn-t">Si es la medida nominal de una tubería, usa su diámetro interior real (elige “Otro valor”).</span>`
        : `d = <b>${fmt(d * 10, 3)} mm</b> = ${sci(d / 100, 5)} m (diámetro interior).`;
    }
    $('doutHint').innerHTML = dHint;

    const z0v = readNum('z0');
    $('z0').classList.remove('bad');
    let z0 = 0;
    if (!Number.isFinite(z0v) || z0v < 0) { errors.push('La elevación de la salida no puede ser negativa.'); $('z0').classList.add('bad'); }
    else z0 = Units.toCm(z0v, state.unit);
    if (Number.isFinite(h0) && z0 >= h0) { errors.push('La salida está a la altura del nivel inicial o por encima: no hay vaciado.'); $('z0').classList.add('bad'); }
    if (Number.isFinite(Ht) && z0 >= Ht) { errors.push('La salida debe estar por debajo de la altura del tanque.'); }

    let Cd = 1;
    $('cd').classList.remove('bad');
    if (state.model === 'cd') {
      Cd = readNum('cd');
      if (!Number.isFinite(Cd) || Cd <= 0) { errors.push('C_d debe ser mayor que cero.'); $('cd').classList.add('bad'); Cd = NaN; }
      else if (Cd > 1.5) { errors.push('C_d mayor que 1,5 no es físico para un orificio.'); $('cd').classList.add('bad'); }
      else if (Cd > 1) warns.push('C_d > 1 implica más caudal que el ideal de Torricelli; revisa el valor.');
    }
    if (Number.isFinite(d) && !errors.length) {
      const yc = Math.max(z0, 0);
      const wAt = key === 'horizontal' || key === 'esfera' || key === 'cono' ? Infinity : 2 * T.half(yc, p);
      const minDim = Math.min(wAt, key === 'rectangular' ? Math.min(p.L, p.W) : Infinity, key === 'horizontal' || key === 'esfera' ? p.D : Infinity);
      if (d >= minDim) errors.push('El diámetro de salida es mayor o igual que el ancho del tanque.');
      else if (d > 0.25 * minDim) warns.push('La salida es grande respecto al tanque: Torricelli supone un orificio pequeño frente a la superficie libre.');
    }

    let dt = state.dt;
    if (state.dt === 'custom') {
      dt = readNum('dtCustom');
      $('dtCustom').classList.remove('bad');
      if (!Number.isFinite(dt) || dt <= 0) { errors.push('El intervalo de medición debe ser mayor que cero.'); $('dtCustom').classList.add('bad'); }
    }
    return { key, T, p, h0, d, z0, Cd, dt, Ht, errors, warns, dParsed: dp };
  }

  function showMsgs(errors, warns) {
    $('msgs').innerHTML = errors.map(e => `<p class="msg err">✕ ${e}</p>`).join('') + warns.map(w => `<p class="msg warn">⚠ ${w}</p>`).join('');
  }

  /* ---------- Laboratorio (modelo teórico) ---------- */
  function computeLab(cfg) {
    const model = Num.torricelli(cfg.key, cfg.p, cfg.d, cfg.Cd, cfg.h0, cfg.z0);
    const tE = model.tEmpty * 60; // s
    const table = Num.theoryTable(model, cfg.dt / 60, 5000);
    const rows = table.rows.map(r => {
      const ts_ = r.t * 60;
      return { ...r, ts: ts_, V: model.vol(r.h), Q: model.Q(r.h), v: model.v(r.h) };
    });
    // diferencia centrada (extremos: progresiva / regresiva)
    rows.forEach((r, i) => {
      const a = rows[i - 1], b = rows[i + 1];
      r.dh = a ? r.h - a.h : null;
      if (a && b) { r.dhdt = (b.h - a.h) / (b.ts - a.ts); r.dmethod = 'c'; }
      else if (b) { r.dhdt = (b.h - r.h) / (b.ts - r.ts); r.dmethod = 'f'; }
      else if (a) { r.dhdt = (r.h - a.h) / (r.ts - a.ts); r.dmethod = 'b'; }
      r.exact = model.dhdt(r.h) / 60;
    });
    return { cfg, model, tE, rows, truncated: table.truncated, N: table.N, V0: model.vol(cfg.h0), Vres: model.vol(cfg.z0), Vmax: cfg.T.vol(cfg.Ht, cfg.p) };
  }

  /* ---------- Estado en el instante t ---------- */
  function at(lab, tsec) {
    const m = lab.model;
    const t = Math.max(0, Math.min(tsec, lab.tE));
    const h = m.hOf(t / 60);
    const V = m.vol(h);
    return { t, h, V, Vout: lab.V0 - V, Q: m.Q(h), v: m.v(h), dhdt: m.dhdt(h) / 60, pct: h / lab.cfg.h0 * 100, A: m.area(h) };
  }

  function renderLive(lab) {
    const s = at(lab, state.t), dg = D();
    const card = (label, val, unit, formula, cls = '') => `<div class="kpi ${cls}"><span>${label}</span><b>${val}</b><small>${unit}</small><em>${formula}</em></div>`;
    $('live').innerHTML =
      card('Altura h', fmt(toU(s.h), dg), `${unitName()} · ${fmt(s.pct, 1)} % de h₀`, 'h = h(t)', 'accent') +
      card('Volumen restante', fmt(s.V / 1000, dg), 'L', 'V = ∫ A<sub>w</sub> dh') +
      card('Volumen evacuado', fmt(s.Vout / 1000, dg), 'L', 'V₀ − V(t)') +
      card('Caudal Q', fmt(s.Q / 1000, dg), 'L/s', 'C<sub>d</sub>A₀√(2g(h−z₀))') +
      card('Velocidad v', fmt(s.v / 100, dg), 'm/s', '√(2g(h−z₀))') +
      card('dh/dt', fmt(toU(s.dhdt), dg), `${unitName()}/s`, '−C<sub>d</sub>A₀√(2g(h−z₀))/A<sub>w</sub>');
    $('tNow').textContent = `t = ${fmt(s.t, 2)} s · ${fmt(s.t / 60, 3)} min`;
    $('tEnd').textContent = `Final: ${fmt(lab.tE, 2)} s · ${fmt(lab.tE / 60, 3)} min`;
    $('tSlider').value = lab.tE > 0 ? Math.round(s.t / lab.tE * 1000) : 0;
    if (tank3d) tank3d.setLevel(s.h, s.v);
    charts.forEach(c => c.setCursor(s.t));
    highlightRow(lab, s.t);
  }

  function renderSummary(lab) {
    const c = lab.cfg;
    $('summary').innerHTML = `
      <div><span>Tiempo hasta el nivel final</span><b>${fmt(lab.tE, 2)} s · ${fmt(lab.tE / 60, 3)} min</b><small>${minsec(lab.tE / 60)}</small></div>
      <div><span>Capacidad del tanque</span><b>${fmt(lab.Vmax / 1000, 2)} L</b><small>${sci(lab.Vmax / 1e6, 4)} m³</small></div>
      <div><span>Volumen inicial V₀</span><b>${fmt(lab.V0 / 1000, 2)} L</b><small>h₀ = ${fmtLen(c.h0, 3)}</small></div>
      <div><span>Área de salida A₀</span><b>${sci(lab.model.A0 / 1e4, 4)} m²</b><small>d = ${fmt(c.d * 10, 2)} mm</small></div>
      <div><span>Volumen residual (bajo la salida)</span><b>${fmt(lab.Vres / 1000, 2)} L</b><small>z₀ = ${fmtLen(c.z0, 3)}</small></div>
      <div><span>Modelo</span><b>${state.model === 'ideal' ? 'Ideal' : 'Con C<sub>d</sub>'}</b><small>C<sub>d</sub> = ${fmtT(c.Cd, 4)} · g = 9,81 m/s²</small></div>`;
  }

  /* ---------- Gráficas ---------- */
  let charts = [];
  const C = { h: '#2563eb', V: '#0891b2', Q: '#d97706', v: '#7c3aed', exp: '#0f172a' };
  function initCharts() {
    const mk = (id, title, yLabel, unitY) => new IChart($(id), { title, xLabel: 't', yLabel, unitX: 's', unitY, digits: D, onSeek: x => { pause(); setTime(x); } });
    charts = [
      mk('chH', 'Altura h vs. tiempo', 'h', () => unitName()),
      mk('chV', 'Volumen restante vs. tiempo', 'V', () => 'L'),
      mk('chQ', 'Caudal Q vs. tiempo', 'Q', () => 'L/s'),
      mk('chv', 'Velocidad de salida v vs. tiempo', 'v', () => 'm/s')
    ];
  }
  function renderCharts(lab, R) {
    const m = lab.model, n = 300, tEnd = lab.tE * 1.02;
    const ts_ = []; for (let i = 0; i <= n; i++) ts_.push(tEnd * i / n);
    const H = ts_.map(t => m.hOf(t / 60));
    const hSeries = [{ name: 'Modelo teórico h(t)', pts: ts_.map((t, i) => [t, toU(H[i])]), color: C.h, main: true }];
    hSeries.push({ name: `Mediciones cada ${fmtT(lab.cfg.dt, 3)} s`, kind: 'points', pts: lab.rows.length <= 400 ? lab.rows.map(r => [r.ts, toU(r.h)]) : [], color: '#93c5fd' });
    if ($('overlay').checked && R && state.src === 'own') {
      hSeries.push({ name: 'Mis mediciones (experimentales)', kind: 'points', pts: R.tRaw.map((t, i) => [(t - R.t0) * 60, toU(R.h[i])]), color: C.exp });
    }
    charts[0].setData(hSeries);
    charts[1].setData([{ name: 'V(t)', pts: ts_.map((t, i) => [t, m.vol(H[i]) / 1000]), color: C.V, main: true }]);
    charts[2].setData([{ name: 'Q(t)', pts: ts_.map((t, i) => [t, m.Q(H[i]) / 1000]), color: C.Q, main: true }]);
    charts[3].setData([{ name: 'v(t)', pts: ts_.map((t, i) => [t, m.v(H[i]) / 100]), color: C.v, main: true }]);
  }

  /* ---------- Tabla ---------- */
  let rowEls = [];
  function renderTable(lab) {
    const dg = D(), u = unitName();
    $('tableSub').innerHTML = `${lab.rows.length} filas · Δt = ${fmtT(lab.cfg.dt, 4)} s · t<sub>k</sub> = k·Δt hasta el nivel final${lab.truncated ? ` · <b class="warn-t">tabla limitada a 5000 filas; aumenta Δt</b>` : ''}. dh/dt por diferencias centradas (extremos: progresiva y regresiva).`;
    const head = ['N°', 't (s)', 't (min)', `h (${u})`, 'h (%)', 'V restante (L)', 'V evacuado (L)', 'Q (L/s)', 'v (m/s)', `Δh (${u})`, `dh/dt (${u}/s)`];
    const body = lab.rows.map((r, i) => {
      const cls = [i === 0 ? 'first' : '', r.final ? 'final' : ''].join(' ');
      const tag = i === 0 ? '<span class="tag">inicio</span>' : r.final ? '<span class="tag fin">nivel final</span>' : '';
      return `<tr class="${cls}"><td>${i}${tag}</td><td>${fmt(r.ts, dg)}</td><td>${fmt(r.ts / 60, dg)}</td><td>${fmt(toU(r.h), dg)}</td><td>${fmt(r.h / lab.cfg.h0 * 100, 2)}</td><td>${fmt(r.V / 1000, dg)}</td><td>${fmt((lab.V0 - r.V) / 1000, dg)}</td><td>${fmt(r.Q / 1000, dg)}</td><td>${fmt(r.v / 100, dg)}</td><td>${r.dh === null ? '—' : fmt(toU(r.dh), dg)}</td><td>${fmt(toU(r.dhdt), dg)}${r.dmethod !== 'c' ? `<sup title="${r.dmethod === 'f' ? 'diferencia progresiva' : 'diferencia regresiva'}">${r.dmethod === 'f' ? 'p' : 'r'}</sup>` : ''}</td></tr>`;
    }).join('');
    $('tblCalc').innerHTML = `<table class="dt"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    rowEls = [...$('tblCalc').querySelectorAll('tbody tr')];
    lastRow = -1;
  }
  let lastRow = -1;
  function highlightRow(lab, t) {
    if (!rowEls.length) return;
    let lo = 0, hi = lab.rows.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lab.rows[mid].ts <= t + 1e-9) lo = mid; else hi = mid - 1; }
    if (lo === lastRow) return;
    if (rowEls[lastRow]) rowEls[lastRow].classList.remove('cur');
    lastRow = lo;
    const r = rowEls[lo];
    if (!r) return;
    r.classList.add('cur');
    const box = $('tblCalc');
    if (box.offsetParent) {
      const top = r.offsetTop - box.clientHeight / 2;
      box.scrollTop = Math.max(0, top);
    }
  }

  /* ---------- Desarrollo matemático 01–15 ---------- */
  const VOL = {
    cilindro: 'V(h) = A_w\\,h = \\pi r^2 h',
    rectangular: 'V(h) = L\\,W\\,h',
    tronco: 'V(h) = \\dfrac{\\pi h}{3}\\left(r_1^2 + r_1 r(h) + r(h)^2\\right),\\quad r(h) = r_1 + m h',
    cono: 'V(h) = \\dfrac{\\pi}{3}\\left(\\dfrac{R}{H}\\right)^2 h^3',
    esfera: 'V(h) = \\dfrac{\\pi h^2}{3}\\,(3R - h)',
    horizontal: 'V(h) = L\\left[R^2\\arccos\\!\\left(\\dfrac{R-h}{R}\\right) - (R-h)\\sqrt{2Rh - h^2}\\right]'
  };
  const blk = (n, title, body) => `<details class="dblk" ${state.devOpen ? 'open' : ''}><summary><span class="dn">${String(n).padStart(2, '0')}</span><span>${title}</span></summary><div class="dbody">${body}</div></details>`;
  const flow = (...lines) => `<div class="flow">${lines.filter(Boolean).map(([lab, tex]) => `<div class="fl"><span class="fl-l">${lab}</span><div class="fl-t">${K(tex, true)}</div></div>`).join('')}</div>`;

  function renderDev(lab) {
    const c = lab.cfg, m = lab.model, key = c.key, T = c.T, p = c.p;
    const u = unitName(), dg = D();
    const si = cm => cm / 100;
    const h0 = si(c.h0), z0 = si(c.z0), hc0 = h0 - z0, d = si(c.d);
    const A0 = Math.PI * d * d / 4, Cd = c.Cd;
    const constA = !!T.constArea;
    const Aw = constA ? T.area(0, p) / 1e4 : NaN;
    const head = z0 > 0;
    const hv = head ? '(h - z_0)' : 'h';
    let html = '';

    // 01
    const rowsIn = T.params.map(([k, label]) => `<tr><td>${label}</td><td>${fmtT(toU(p[k]), 6)} ${u}</td></tr>`).join('');
    html += blk(1, 'Datos iniciales', `<table class="mini"><tbody>${rowsIn}
      <tr><td>Altura inicial del líquido h₀</td><td>${fmtT(toU(c.h0), 6)} ${u}</td></tr>
      <tr><td>Diámetro interior de la salida d</td><td>${c.dParsed.text}</td></tr>
      <tr><td>Elevación de la salida z₀</td><td>${fmtT(toU(c.z0), 6)} ${u}</td></tr>
      <tr><td>Modelo</td><td>${state.model === 'ideal' ? 'Ideal, C<sub>d</sub> = 1' : `Con coeficiente de descarga, C<sub>d</sub> = ${fmtT(Cd, 4)}`}</td></tr>
      <tr><td>Gravedad g</td><td>9,81 m/s²</td></tr>
      <tr><td>Intervalo de medición Δt</td><td>${fmtT(c.dt, 4)} s</td></tr></tbody></table>`);

    // 02
    const f = Units.TO_CM[state.unit] / 100;
    const conv = T.params.map(([k]) => `${k.replace(/(\d)/, '_$1')} = ${tx(toU(p[k]), 4)}\\ \\text{${u}} \\times ${tx(f, 6)}\\ \\tfrac{\\text{m}}{\\text{${u}}} = ${txU(si(p[k]), 'm', dg)}`);
    conv.push(`h_0 = ${tx(toU(c.h0), 4)}\\ \\text{${u}} \\times ${tx(f, 6)} = ${txU(h0, 'm', dg)}`);
    if (head) conv.push(`z_0 = ${tx(toU(c.z0), 4)}\\ \\text{${u}} \\times ${tx(f, 6)} = ${txU(z0, 'm', dg)}`);
    const dc = c.dParsed;
    conv.push(dc.unit === 'in' ? `d = ${tx(dc.value, 4)}\\,\\text{in} \\times 25{,}4\\ \\tfrac{\\text{mm}}{\\text{in}} = ${tx(d * 1000, 3)}\\ \\text{mm} = ${txU(d, 'm', 6)}`
      : `d = ${tx(dc.value, 4)}\\ \\text{${dc.unit}} = ${txU(d, 'm', 6)}`);
    html += blk(2, 'Conversión de unidades (a SI)', `<p>Todas las operaciones se hacen en metros y segundos; las unidades de la interfaz solo se usan para mostrar.</p>${conv.map(t => `<div class="eqline">${K(t, true)}</div>`).join('')}${dc.unit === 'in' ? '<p class="warn-t">Si la medida en pulgadas es nominal (tubería comercial), el diámetro interior real es diferente y debe usarse ese.</p>' : ''}`);

    // 03
    let g3;
    if (key === 'cilindro') g3 = flow(['General', 'r = \\dfrac{D}{2},\\qquad A_w = \\pi r^2'], ['Sustitución', `r = \\dfrac{${tx(si(p.D), 4)}}{2} = ${tx(si(p.D) / 2, dg)}\\ \\text{m},\\qquad A_w = \\pi(${tx(si(p.D) / 2, dg)})^2`], ['Resultado', `A_w = ${txU(Aw, 'm^2', dg)}`]);
    else if (key === 'rectangular') g3 = flow(['General', 'A_w = L\\times W'], ['Sustitución', `A_w = ${tx(si(p.L), 4)}\\times${tx(si(p.W), 4)}`], ['Resultado', `A_w = ${txU(Aw, 'm^2', dg)}`]);
    else if (key === 'tronco' || key === 'cono') {
      const r1 = key === 'tronco' ? si(p.d1) / 2 : 0, r2 = si(key === 'tronco' ? p.d2 : p.D) / 2, H = si(p.H), mm = (r2 - r1) / H;
      g3 = flow(['General', key === 'tronco' ? 'r(h) = r_1 + m\\,h,\\quad m = \\dfrac{r_2-r_1}{H},\\quad A_w(h) = \\pi\\,r(h)^2' : 'r(h) = \\dfrac{R}{H}h,\\quad A_w(h) = \\pi\\left(\\dfrac{R}{H}\\right)^2 h^2'],
        ['Sustitución', key === 'tronco' ? `m = \\dfrac{${tx(r2, dg)} - ${tx(r1, dg)}}{${tx(H, dg)}} = ${tx(mm, 6)}` : `\\dfrac{R}{H} = \\dfrac{${tx(r2, dg)}}{${tx(H, dg)}} = ${tx(mm, 6)}`],
        ['Resultado', `A_w(h) = \\pi\\,(${tx(r1, dg)} + ${tx(mm, 6)}\\,h)^2\\ \\text{m}^2;\\quad A_w(h_0) = ${txU(T.area(c.h0, p) / 1e4, 'm^2', dg)}`]);
    } else if (key === 'esfera') g3 = flow(['General', 'A_w(h) = \\pi\\,(D h - h^2)'], ['Sustitución', `A_w(h) = \\pi\\,(${tx(si(p.D), dg)}\\,h - h^2)`], ['Resultado', `A_w(h_0) = ${txU(T.area(c.h0, p) / 1e4, 'm^2', dg)};\\quad A_{w,\\max} = A_w(R) = ${txU(T.area(p.D / 2, p) / 1e4, 'm^2', dg)}`]);
    else g3 = flow(['General', 'A_w(h) = 2L\\sqrt{D h - h^2}'], ['Sustitución', `A_w(h) = 2(${tx(si(p.L), dg)})\\sqrt{${tx(si(p.D), dg)}\\,h - h^2}`], ['Resultado', `A_w(h_0) = ${txU(T.area(c.h0, p) / 1e4, 'm^2', dg)}`]);
    html += blk(3, 'Geometría del tanque (área de la superficie libre A<sub>w</sub>)', `${constA ? '<p>La sección es constante: el área de la superficie libre no depende de h.</p>' : '<p>La sección varía con la altura: A<sub>w</sub> depende de h y la EDO se integra con esa función.</p>'}${g3}`);

    // 04
    html += blk(4, 'Volumen', flow(['General', VOL[key]],
      ['Volumen máximo', `V_{\\max} = V(H) = ${txU(lab.Vmax / 1e6, 'm^3', dg)} = ${txU(lab.Vmax / 1000, 'L', 2)}`],
      ['Volumen inicial', `V_0 = V(h_0 = ${tx(h0, dg)}) = ${txU(lab.V0 / 1e6, 'm^3', dg)} = ${txU(lab.V0 / 1000, 'L', 2)}`],
      head && ['Residual', `V(z_0) = ${txU(lab.Vres / 1000, 'L', 2)}\\ \\text{(no sale: queda bajo la salida)}`]));

    // 05
    html += blk(5, 'Geometría de salida', flow(['General', 'r_0 = \\dfrac{d}{2},\\qquad A_0 = \\dfrac{\\pi d^2}{4}'],
      ['Sustitución', `r_0 = \\dfrac{${tx(d, 6)}}{2} = ${txU(d / 2, 'm', 6)},\\qquad A_0 = \\dfrac{\\pi(${tx(d, 6)})^2}{4}`],
      ['Resultado', `A_0 = ${txU(A0, 'm^2', dg)}`]) + `<p>Relación de áreas: A₀/A<sub>w</sub>(h₀) = ${sci(A0 / (T.area(c.h0, p) / 1e4), 4)}.</p>`);

    // 06
    const v0 = Math.sqrt(2 * G_SI * hc0);
    html += blk(6, 'Ley de Torricelli (velocidad de salida)', `<p>Al igualar la energía cinética y la potencial de una partícula que desciende la carga ${head ? '(h − z₀) sobre la salida' : 'h'}: ½mv² = mg${head ? '(h − z₀)' : 'h'}.</p>` + flow(['General', `v = \\sqrt{2g\\,${hv}}`],
      ['Sustitución (t = 0)', `v_0 = \\sqrt{2(9{,}81)(${tx(hc0, dg)})}`], ['Resultado', `v_0 = ${txU(v0, 'm/s', dg)}`]));

    // 07
    const Q0 = Cd * A0 * v0;
    html += blk(7, 'Caudal instantáneo', flow(['General', `Q = C_d\\,A_0\\,\\sqrt{2g\\,${hv}}`],
      ['Sustitución (t = 0)', `Q_0 = ${tx(Cd, 4)}\\,(${tx(A0, dg)})\\,(${tx(v0, dg)})`],
      ['Resultado', `Q_0 = ${txU(Q0, 'm^3/s', dg)} = ${txU(Q0 * 1000, 'L/s', dg)}`]));

    // 08
    const cc = constA ? Cd * A0 / Aw * Math.sqrt(2 * G_SI) : NaN;
    html += blk(8, 'Ecuación diferencial', `<p>El volumen disminuye al ritmo del caudal de salida, y para una variación dh el volumen cambia dV = A<sub>w</sub>(h) dh:</p>` + flow(
      ['Balance', `\\dfrac{dV}{dt} = -Q = -C_d A_0\\sqrt{2g\\,${hv}},\\qquad \\dfrac{dV}{dt} = A_w${constA ? '' : '(h)'}\\,\\dfrac{dh}{dt}`],
      ['EDO', `\\dfrac{dh}{dt} = -\\dfrac{C_d A_0}{A_w${constA ? '' : '(h)'}}\\sqrt{2g\\,${hv}}`],
      constA && ['Sustitución', `\\dfrac{dh}{dt} = -\\dfrac{${tx(Cd, 4)}\\,(${tx(A0, dg)})}{${tx(Aw, dg)}}\\sqrt{2(9{,}81)}\\,\\sqrt{${hv}} = -${tx(cc, 6)}\\sqrt{${hv}}`]));

    // 09–13
    if (constA) {
      const sq0 = Math.sqrt(hc0), tv = 2 * sq0 / cc;
      const hcV = head ? 'h - z_0' : 'h';
      html += blk(9, 'Separación de variables', flow(['General', `\\dfrac{dh}{\\sqrt{${hcV}}} = -k\\,dt,\\qquad k = \\dfrac{C_d A_0}{A_w}\\sqrt{2g}`], ['Resultado', `k = ${txU(cc, 'm^{1/2}/s', 6)}`]));
      html += blk(10, 'Integración', flow(['General', `\\int \\dfrac{dh}{\\sqrt{${hcV}}} = -k\\int dt \\;\\Rightarrow\\; 2\\sqrt{${hcV}} = -k\\,t + C`]));
      html += blk(11, 'Condición inicial', flow(['General', `h(0) = h_0 \\;\\Rightarrow\\; C = 2\\sqrt{h_0${head ? ' - z_0' : ''}}`], ['Sustitución', `C = 2\\sqrt{${tx(hc0, dg)}} = ${tx(2 * sq0, 6)}`]));
      html += blk(12, 'Ecuación h(t)', flow(['General', `h(t) = ${head ? 'z_0 + ' : ''}\\left(\\sqrt{h_0${head ? ' - z_0' : ''}} - \\dfrac{k}{2}\\,t\\right)^2`],
        ['Particular', `h(t) = ${head ? tx(z0, dg) + ' + ' : ''}\\left(${tx(sq0, 6)} - ${tx(cc / 2, 6)}\\,t\\right)^2\\quad [h\\ \\text{en m},\\ t\\ \\text{en s}]`],
        ['Verificación', `h(60\\ \\text{s}) = ${txU(m.hOf(1) / 100, 'm', dg)}`]));
      html += blk(13, 'Tiempo de vaciado', flow(['General', `h(t_v) = ${head ? 'z_0' : '0'} \\;\\Rightarrow\\; t_v = \\dfrac{2\\sqrt{h_0${head ? ' - z_0' : ''}}}{k} = \\dfrac{A_w}{C_d A_0}\\sqrt{\\dfrac{2\\,(h_0${head ? ' - z_0' : ''})}{g}}`],
        ['Sustitución', `t_v = \\dfrac{2(${tx(sq0, 6)})}{${tx(cc, 6)}}`], ['Resultado', `t_v = ${txU(tv, 's', dg)} = ${txU(tv / 60, 'min', dg)}`]) + '<p>El intervalo de medición Δt no aparece en esta expresión: cambiarlo no modifica el tiempo de vaciado.</p>');
    } else {
      const Kc = Cd * A0 * Math.sqrt(2 * G_SI);
      const I = lab.tE * Kc; // m^2.5
      html += blk(9, 'Separación de variables', flow(['General', `\\dfrac{A_w(h)}{\\sqrt{${hv}}}\\,dh = -C_d A_0\\sqrt{2g}\\;dt`], ['Constante', `C_d A_0\\sqrt{2g} = ${tx(Cd, 4)}\\,(${tx(A0, dg)})\\sqrt{19{,}62} = ${txU(Kc, 'm^{5/2}/s', 6)}`]));
      html += blk(10, 'Integración', flow(['General', `\\int_{h}^{h_0} \\dfrac{A_w(s)}{\\sqrt{s${head ? ' - z_0' : ''}}}\\,ds = C_d A_0\\sqrt{2g}\\;t`],
        !head && T.tSym && ['Primitiva cerrada', T.tSym()]) + (head ? '<p>Con la salida elevada (z₀ &gt; 0) la integral se evalúa numéricamente (regla de Simpson con 2000 subintervalos, cambio de variable s = z₀ + u² para eliminar la singularidad).</p>' : ''));
      html += blk(11, 'Condición inicial', flow(['General', `h(0) = h_0 = ${txU(h0, 'm', dg)}\\;\\Rightarrow\\; t(h_0) = 0`]) + '<p>Los límites de integración incorporan la condición inicial.</p>');
      const sm = [0.25, 0.5, 0.75].map(fr => { const tt = lab.tE * fr; return `h(${tx(tt, 1)}\\ \\text{s}) = ${txU(m.hOf(tt / 60) / 100, 'm', dg)}`; }).join(',\\quad ');
      html += blk(12, 'Ecuación h(t)', `<p>La relación es implícita, t = t(h); h(t) se obtiene invirtiendo t(h) numéricamente (bisección) con la misma función que usan la tabla, las gráficas y el 3D.</p>` + flow(['Particular', `t(h) = \\dfrac{1}{${tx(Kc, 6)}}\\int_h^{${tx(h0, dg)}}\\dfrac{A_w(s)}{\\sqrt{s${head ? ' - ' + tx(z0, dg) : ''}}}\\,ds\\quad[\\text{s}]`], ['Valores', sm]));
      html += blk(13, 'Tiempo de vaciado', flow(['General', `t_v = \\dfrac{1}{C_d A_0\\sqrt{2g}}\\int_{${head ? 'z_0' : '0'}}^{h_0}\\dfrac{A_w(s)}{\\sqrt{s${head ? ' - z_0' : ''}}}\\,ds`],
        ['Sustitución', `t_v = \\dfrac{${tx(I, 6)}}{${tx(Kc, 6)}}`], ['Resultado', `t_v = ${txU(lab.tE, 's', dg)} = ${txU(lab.tE / 60, 'min', dg)}`]) + '<p>El intervalo de medición Δt no aparece en esta expresión: cambiarlo no modifica el tiempo de vaciado.</p>');
    }

    // 14
    const r1 = lab.rows[1], r2 = lab.rows[2];
    html += blk(14, 'Generación de la tabla', flow(['General', `t_k = k\\,\\Delta t,\\quad k = 0, 1, \\dots, N,\\qquad N = \\left\\lceil \\dfrac{t_v}{\\Delta t}\\right\\rceil`],
      ['Sustitución', `N = \\left\\lceil \\dfrac{${tx(lab.tE, 3)}}{${tx(c.dt, 3)}} \\right\\rceil = ${lab.N}`],
      r1 && ['Ejemplo', `h(t_1 = ${tx(r1.ts, 2)}\\ \\text{s}) = ${txU(r1.h / 100, 'm', dg)}${r2 ? `,\\quad h(t_2 = ${tx(r2.ts, 2)}\\ \\text{s}) = ${txU(r2.h / 100, 'm', dg)}` : ''}`]) +
      `<p>Para cada t<sub>k</sub> se evalúan h(t<sub>k</sub>), V = V(h), Q = C<sub>d</sub>A₀√(2g(h − z₀)) y v = √(2g(h − z₀)). La última fila corresponde al instante exacto en que el nivel llega a ${head ? 'la salida' : 'cero'}.</p>`);

    // 15
    const i = Math.min(1, lab.rows.length - 2);
    const a = lab.rows[i - 1], b = lab.rows[i + 1], r = lab.rows[i];
    if (a && b) {
      const num = (b.h - a.h) / 100 / (b.ts - a.ts), ex = r.exact / 100;
      html += blk(15, 'Diferenciación numérica', flow(['General', `\\left.\\dfrac{dh}{dt}\\right|_{t_k} \\approx \\dfrac{h(t_k + \\Delta t) - h(t_k - \\Delta t)}{2\\,\\Delta t}`],
        ['Sustitución', `\\left.\\dfrac{dh}{dt}\\right|_{t = ${tx(r.ts, 2)}} \\approx \\dfrac{${tx(b.h / 100, 6)} - ${tx(a.h / 100, 6)}}{2(${tx(c.dt, 3)})}`],
        ['Resultado', `${txU(num, 'm/s', 6)}\\qquad(\\text{exacta: } ${txU(ex, 'm/s', 6)};\\ \\text{error } ${tn(Math.abs((num - ex) / ex) * 100, 3)}\\,\\%)`]) +
        `<p>Δt proviene del intervalo de medición elegido (${fmtT(c.dt, 4)} s). En el primer punto no existe h(t − Δt) y en el último no existe h(t + Δt), por lo que la fórmula centrada no aplica: allí se usan la diferencia progresiva (h<sub>1</sub> − h<sub>0</sub>)/Δt y la regresiva (h<sub>N</sub> − h<sub>N−1</sub>)/Δt, de menor precisión (orden Δt en lugar de Δt²). En la tabla aparecen marcadas con <sup>p</sup> y <sup>r</sup>.</p>`);
    }
    $('dev').innerHTML = html;
  }

  /* ---------- Método del artículo ---------- */
  function computeAnalysis(lab) {
    const cfg = lab.cfg, key = cfg.key, p = cfg.p;
    let data = null, src = { mode: state.src };
    if (state.src === 'own') {
      data = parseOwn($('ownData').value);
      $('ownErr').textContent = data.t.length < 5 ? `Se necesitan al menos 5 lecturas válidas (hay ${data.t.length}).` : '';
      if (data.t.length < 5) data = null;
    } else {
      src = { mode: 'table', dt: cfg.dt / 60, dtSec: cfg.dt, sigma: 0, res: 0 };
      data = Num.simulate(lab.model, { dt: cfg.dt / 60 });
      if (data.t.length < 5) { $('banner').hidden = false; $('banner').innerHTML = '<p>⚠ Con este Δt la tabla tiene menos de 5 mediciones; reduce el intervalo para aplicar el método.</p>'; return null; }
    }
    if (!data) return null;
    const warnings = [];
    const R = Num.analyze(data.t, data.h);
    const Ht = cfg.Ht;
    const h0d = Math.min(R.h0, Ht);
    if (R.h0 > Ht) warnings.push(`La primera lectura (${fmtT(R.h0, 2)} cm) supera la altura del tanque configurado; el modelo teórico usa ${fmtT(Ht, 2)} cm.`);
    const z0 = Math.min(cfg.z0, h0d * 0.999);
    const theory = Num.torricelli(key, p, cfg.d, cfg.Cd, h0d, z0);
    const CdFit = Num.fitCd(key, p, cfg.d, h0d, R.t, R.h, z0);
    const fitModel = Num.torricelli(key, p, cfg.d, CdFit, h0d, z0);
    const fpred = R.t.map(fitModel.hOf);
    const hs = R.posPairs.map(q => q.h).filter(h => h > z0);
    const nEff = hs.length > 2 ? Num.linfit(hs.map(Math.log), hs.map(h => Math.log(-theory.dhdt(h)))).a : NaN;
    return {
      key, T: cfg.T, p, d: cfg.d, Cd: cfg.Cd, z0, theory, warnings, R, src, CdFit, fitModel, nEff,
      fitR2: Num.r2det(R.h, fpred), fitR2c: Num.r2corr(R.h, fpred),
      fitRmse: Math.sqrt(R.h.reduce((s, v, i) => s + (v - fpred[i]) ** 2, 0) / R.n)
    };
  }

  const eqBox = (tex, note) => `<div class="eqbox">${K(tex, true)}${note ? `<p class="eqnote">${note}</p>` : ''}</div>`;
  const step = (n, title, body) => `<div class="step"><div class="step-n">${n}</div><div class="step-b"><h4>${title}</h4>${body}</div></div>`;
  const tableH = (heads, rows, cls = '') => `<div class="tblwrap ${cls}"><table class="dt"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.cells || r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const kpi = (label, value, sub) => `<div class="kpi"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function renderData(ctx) {
    const R = ctx.R;
    const srcName = { table: `Mediciones de la tabla calculada de tu tanque (una cada Δt = ${fmtT(ctx.src.dtSec || 0, 4)} s)`, own: 'Mis mediciones reales' }[state.src];
    let html = `<p class="lead">${srcName}. <b>${R.n}</b> lecturas, ${R.uniform ? `paso constante Δt = <b>${fmtT(R.steps[0], 4)} min</b>` : 'paso de tiempo variable'}, desde h = ${fmtT(R.h[0], 3)} cm hasta h = ${fmtT(R.h[R.n - 1], 3)} cm.</p>`;
    html += `<div class="two"><div>${tableH(['i', 't (min)', 'h (cm)'], R.tRaw.map((t, i) => [i, fmtT(t, 4), fmtT(R.h[i], 4)]), 'scroll')}<p class="cap">Tabla 1. Toma de datos h = f(t).</p></div>`;
    html += `<div class="chart-card">${Charts.chart({ width: 620, height: 380, xLabel: 'Tiempo, t (min)', yLabel: 'Altura, h (cm)', legend: 'tr', series: [
      { kind: 'line', pts: R.t.map((t, i) => [t, R.h[i]]), color: '#94a3b8', width: 1.2 },
      { kind: 'points', pts: R.t.map((t, i) => [t, R.h[i]]), color: Charts.COLORS.datos, label: 'h medida' }] })}</div></div>`;
    $('dataSec').innerHTML = html;
  }

  function renderLinear(ctx) {
    const R = ctx.R, L = R.lin;
    const tv = -L.b / L.a;
    let html = '<div class="two"><div class="steps-list">';
    html += step(1, 'Modelo propuesto', eqBox('h = a\\,t + b'));
    html += step(2, 'Mínimos cuadrados', eqBox('a = \\dfrac{\\sum (t_i-\\bar t)(h_i-\\bar h)}{\\sum (t_i-\\bar t)^2},\\qquad b = \\bar h - a\\,\\bar t', `${K(`\\bar t = ${tn(R.t.reduce((s, v) => s + v, 0) / R.n, 4)}`)}, ${K(`\\bar h = ${tn(R.h.reduce((s, v) => s + v, 0) / R.n, 4)}`)}, ${K(`n = ${R.n}`)}`));
    html += step(3, 'Resultado', `${eqBox(TeX.linReg(L))}<div class="pill-row"><span class="pill">R² = ${fmt(L.r2, 4)}</span><span class="pill">Vaciado: t = −b/a = ${fmt(tv, 2)} min</span></div><p>La recta supone una velocidad de descenso <b>constante</b> de ${fmt(-L.a, 3)} cm/min, pero el nivel baja cada vez más despacio; por eso se mejora con las ecuaciones diferenciales.</p>`);
    html += `</div><div class="chart-card">${ArticleFigures(ctx, { width: 620, height: 380 }).linear}<p class="cap">Análisis de altura vs. tiempo. Regresión lineal.</p></div></div>`;
    $('linSec').innerHTML = html;
  }

  function renderDeriv(ctx) {
    const R = ctx.R;
    const i = Math.min(1, R.n - 2);
    let html = '<div class="steps-list">';
    html += step(1, 'Diferencias centradas (serie de Taylor)', eqBox('\\left.\\dfrac{dh}{dt}\\right|_{t_i} \\approx \\dfrac{h_{i+1} - h_{i-1}}{t_{i+1} - t_{i-1}} = \\dfrac{h(t+\\Delta t) - h(t-\\Delta t)}{2\\,\\Delta t}', R.uniform ? `Con ${K(`\\Delta t = ${tn(R.steps[0], 4, true)}`)} min el denominador es ${K(`2\\Delta t = ${tn(2 * R.steps[0], 4, true)}`)}. La primera y la última lectura no tienen derivada centrada.` : 'Paso variable: se usa la forma general.'));
    html += step(2, 'Ejemplo con la segunda lectura', eqBox(`\\left.\\dfrac{dh}{dt}\\right|_{t=${tn(R.tRaw[i], 3, true)}} \\approx \\dfrac{${tn(R.h[i + 1], 3, true)} - ${tn(R.h[i - 1], 3, true)}}{${tn(R.tRaw[i + 1], 3, true)} - ${tn(R.tRaw[i - 1], 3, true)}} = ${tn(R.deriv[i], 4)}\\ \\text{cm/min}`));
    html += step(3, 'Cambio de signo', `<p>Como el nivel baja, ${K('dh/dt < 0')}. Para las regresiones se usa ${K('y = -dh/dt > 0')} contra <i>h</i> (Tabla 3); el signo se recupera al plantear la EDO.${R.excluded ? ` Se excluyen ${R.excluded} punto(s) con valores ≤ 0 en las regresiones exponencial y potencial (requieren logaritmo).` : ''}</p>`);
    html += '</div><div class="two">';
    html += `<div>${tableH(['t (min)', 'h (cm)', 'dh/dt = Δh/(2Δt)'], R.tRaw.map((t, k) => [fmtT(t, 4), fmtT(R.h[k], 4), R.deriv[k] === null ? '<span class="muted">—</span>' : fmtT(R.deriv[k], 4)]), 'scroll')}<p class="cap">Tabla 2. Cálculo de la derivada h = f(t).</p></div>`;
    html += `<div>${tableH(['h (cm)', '−dh/dt (cm/min)'], R.pairs.map(q => [fmtT(q.h, 4), fmtT(q.y, 4)]), 'scroll')}<p class="cap">Tabla 3. Datos para la regresión h′ = f(h).</p></div></div>`;
    $('derivSec').innerHTML = html;
  }

  function modelSteps(m, R) {
    const c = m.coef, h0 = R.h0;
    const s = [];
    if (m.key === 'lineal') {
      s.push(['Regresión (Tabla 3)', eqBox(TeX.fit(m), `α = ${fmt(c.alpha, 5)}, β = ${fmt(c.beta, 5)}, R² = ${fmt(m.fitR2, 5)}`)]);
      s.push(['Ecuación diferencial', eqBox(`${TeX.odeSym.lineal} \\;\\Rightarrow\\; ${TeX.ode(m)}`)]);
      s.push(['Separación de variables', eqBox('\\int \\dfrac{dh}{\\alpha h + \\beta} = -\\int dt \\;\\Rightarrow\\; \\dfrac{1}{\\alpha}\\ln(\\alpha h + \\beta) = -t + C')]);
      s.push(['Condición inicial h(0) = h₀', eqBox('\\alpha h + \\beta = (\\alpha h_0 + \\beta)\\,e^{-\\alpha t}') + eqBox(`\\Rightarrow\\; ${TeX.solSym.lineal}`, `${K(`h_0 + \\beta/\\alpha = ${tn(h0, 3, true)} + ${tn(c.C2, 5)} = ${tn(c.C1, 5)}`)}`)]);
    } else if (m.key === 'exponencial') {
      s.push(['Regresión (Tabla 3)', eqBox(TeX.fit(m), `Linealizada: ${K('\\ln y = \\ln A + B h')} · A = ${fmt(c.A, 5)}, B = ${fmt(c.B, 5)}, R² = ${fmt(m.fitR2, 5)}`)]);
      s.push(['Ecuación diferencial', eqBox(`${TeX.odeSym.exponencial} \\;\\Rightarrow\\; ${TeX.ode(m)}`)]);
      s.push(['Separación de variables', eqBox('\\int e^{-Bh}\\,dh = -A\\int dt \\;\\Rightarrow\\; -\\dfrac{1}{B}e^{-Bh} = -A t + C')]);
      s.push(['Condición inicial h(0) = h₀', eqBox('e^{-Bh} = AB\\,t + e^{-Bh_0}') + eqBox(`\\Rightarrow\\; ${TeX.solSym.exponencial}`, `${K(`AB = ${tn(c.AB, 5)}`)}, ${K(`e^{-Bh_0} = ${tn(c.c, 7)}`)}, ${K(`-1/B = ${tn(-c.invB, 4)}`)}`)]);
    } else {
      s.push(['Regresión (Tabla 3)', eqBox(TeX.fit(m), `Linealizada: ${K('\\ln y = \\ln A + n\\ln h')} · A = ${fmt(c.A, 5)}, n = ${fmt(c.n, 5)}, R² = ${fmt(m.fitR2, 5)}`)]);
      s.push(['Ecuación diferencial', eqBox(`${TeX.odeSym.potencial} \\;\\Rightarrow\\; ${TeX.ode(m)}`)]);
      s.push(['Separación de variables', eqBox('\\int h^{-n}\\,dh = -A\\int dt \\;\\Rightarrow\\; \\dfrac{h^{1-n}}{1-n} = -A t + C')]);
      s.push(['Condición inicial h(0) = h₀', eqBox('h^{1-n} = h_0^{1-n} - (1-n)A\\,t') + eqBox(`\\Rightarrow\\; ${TeX.solSym.potencial}`, `${K(`1-n = ${tn(c.e, 5)}`)}, ${K(`h_0^{1-n} = ${tn(c.base0, 5)}`)}, ${K(`(1-n)A = ${tn(c.k, 6)}`)}, ${K(`\\tfrac{1}{1-n} = ${tn(c.exp, 5)}`)}`)]);
    }
    s.push(['Modelo final', `${eqBox(TeX.sol(m))}<div class="pill-row"><span class="pill strong">R² = ${fmt(m.R2, 6)}</span><span class="pill">RMSE = ${fmt(m.rmse, 3)} cm</span></div>`]);
    s.push(['Tiempo de vaciado (h = 0)', eqBox(`${TeX.tEmptySym[m.key]} = ${Number.isFinite(m.tEmpty) ? tn(m.tEmpty, 3) + '\\ \\text{min}' : '\\infty'}`)]);
    return s.map((x, i) => step(i + 1, x[0], x[1])).join('');
  }

  function renderModels(ctx) {
    const R = ctx.R, F = ArticleFigures(ctx, { width: 620, height: 380 });
    const figs = { lineal: F.dLin, exponencial: F.dExp, potencial: F.dPow };
    const sel = state.modelTab ?? 2;
    let html = `<div class="tabs" role="tablist">${R.models.map((m, i) => `<button class="tab${i === sel ? ' on' : ''}" data-tab="${i}">${m.nombre}${m === R.best ? ' ★' : ''}</button>`).join('')}</div>`;
    R.models.forEach((m, i) => {
      html += `<div class="tabpane" data-pane="${i}" ${i === sel ? '' : 'hidden'}><div class="two"><div class="steps-list">${modelSteps(m, R)}</div><div class="chart-card">${figs[m.key]}<p class="cap">Regresión ${m.nombre.toLowerCase()} · análisis de la derivada numérica.</p></div></div></div>`;
    });
    html += `<h3 class="sub">Cuadro 4 · Ecuaciones diferenciales</h3>`;
    html += tableH(['Regresión', 'Ecuación diferencial', 'R² del ajuste'], R.models.map(m => [m.nombre, K(TeX.ode(m)), fmt(m.fitR2, 5)]));
    html += `<h3 class="sub">Cuadro 5 · Modelos h = f(t)</h3>`;
    html += tableH(['Regresión', 'Expresión matemática h = f(t)', 'R² (1 − SSE/SST)', 'r² (correlación)'], R.models.map(m => ({ cls: m === R.best ? 'best' : '', cells: [m.nombre, K(TeX.sol(m)), fmt(m.R2, 6), fmt(m.r2c, 6)] })));
    html += `<p class="note"><b>R²</b> = 1 − SSE/SST mide qué tanto del cambio de h explica el modelo, penalizando también el sesgo. <b>r²</b> es el cuadrado de la correlación entre mediciones y modelo; siempre es igual o mayor.</p>`;
    $('modelSec').innerHTML = html;
  }

  function renderResults(ctx) {
    const R = ctx.R, best = R.best, F = ArticleFigures(ctx, { width: 900, height: 430, fontSize: 13 });
    const [ml, me, mp] = R.models;
    const bar = (r2, color) => `<span class="bar"><i style="width:${Math.max(2, Math.min(100, (r2 - 0.9) / 0.1 * 100))}%;background:${color}"></i></span>`;
    let html = `<div class="best-card"><div><span class="eyebrow">Mejor modelo</span><h3>${best.nombre}</h3>${K(TeX.sol(best), true)}</div><div class="kpis">${kpi('R²', fmt(best.R2, 6))}${kpi('RMSE', fmt(best.rmse, 3) + ' cm')}${kpi('Tiempo de vaciado', fmt(best.tEmpty, 2) + ' min')}</div></div>`;
    html += `<div class="rank">${R.models.slice().sort((a, b) => b.R2 - a.R2).map((m, i) => `<div class="rank-row"><span class="dot" style="background:${Charts.COLORS[m.key]}"></span><b>${i + 1}. ${m.nombre}</b>${bar(m.R2, Charts.COLORS[m.key])}<span>R² = ${fmt(m.R2, 6)}</span></div>`).join('')}`;
    html += `<div class="rank-row"><span class="dot" style="background:${Charts.COLORS.torricelli}"></span><b>Torricelli (C<sub>d</sub> ajustado = ${fmt(ctx.CdFit, 3)})</b>${bar(ctx.fitR2, Charts.COLORS.torricelli)}<span>R² = ${fmt(ctx.fitR2, 6)}</span></div>`;
    html += `<div class="rank-row"><span class="dot" style="background:#94a3b8"></span><b>Recta directa (B)</b>${bar(R.lin.r2, '#94a3b8')}<span>R² = ${fmt(R.lin.r2, 6)}</span></div></div>`;
    html += `<div class="chart-card">${F.compare}<p class="cap">Comparación de los modelos con los datos.</p></div>`;
    const rows = R.t.map((t, i) => [fmtT(R.tRaw[i], 4), `<b>${fmtT(R.h[i], 4)}</b>`, fmt(ml.pred[i], 5), fmt(me.pred[i], 5), fmt(mp.pred[i], 5), fmt(ctx.fitModel.hOf(t), 5)]);
    rows.push({ cls: 'foot', cells: ['', 'R²', fmt(ml.R2, 6), fmt(me.R2, 6), fmt(mp.R2, 6), fmt(ctx.fitR2, 6)] });
    rows.push({ cls: 'foot', cells: ['', 'r²', fmt(ml.r2c, 6), fmt(me.r2c, 6), fmt(mp.r2c, 6), fmt(ctx.fitR2c, 6)] });
    rows.push({ cls: 'foot', cells: ['', 'RMSE (cm)', fmt(ml.rmse, 4), fmt(me.rmse, 4), fmt(mp.rmse, 4), fmt(ctx.fitRmse, 4)] });
    rows.push({ cls: 'foot', cells: ['', 't vaciado (min)', fmt(ml.tEmpty, 2), fmt(me.tEmpty, 2), fmt(mp.tEmpty, 2), fmt(ctx.fitModel.tEmpty, 2)] });
    html += `<h3 class="sub">Cuadro 6 · Análisis de resultados</h3>`;
    html += tableH(['t (min)', 'h real (cm)', 'h lineal', 'h exponencial', 'h potencial', 'h Torricelli (C<sub>d</sub> ajustado)'], rows, 'scroll tall');
    html += `<p class="note">“—”: el modelo ya no tiene valor real (el tanque se vació antes). La columna de Torricelli usa un C<sub>d</sub> <b>calibrado</b> con estos datos (${fmt(ctx.CdFit, 3)}); el modelo teórico del laboratorio usa el C<sub>d</sub> que tú defines (${fmtT(ctx.Cd, 4)}) y no se fuerza a coincidir con los datos.</p>`;
    $('resSec').innerHTML = html;
  }

  /* ---------- Artículo ---------- */
  function defaultTitle(T) { return `Modelo matemático para el vaciado de un tanque ${T.articulo}`; }
  const metaIds = { title: 'mTitle', authors: 'mAuthors', email: 'mEmail', affiliation: 'mAffil', journal: 'mJournal', date: 'mDate', procedure: 'mProc' };
  function initMeta() {
    const today = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const saved = store.get('meta', {});
    const defs = {
      authors: 'Nombre del autor', email: '', affiliation: 'Programa de Ingeniería · Curso de Ecuaciones Diferenciales · Universidad',
      journal: 'Informe de laboratorio · Ecuaciones Diferenciales', date: today,
      procedure: 'Se llenó el tanque y se abrió la salida. Con una regla graduada y un cronómetro se registró la altura del nivel a intervalos regulares de tiempo, iniciando el conteo (t = 0) cuando el nivel pasó por la marca de referencia. La práctica se filmó para verificar las lecturas.'
    };
    Object.entries(metaIds).forEach(([k, id]) => {
      const el = $(id);
      if (saved[k] !== undefined) { el.value = saved[k]; if (k === 'title') el.dataset.dirty = '1'; }
      else if (defs[k] !== undefined) el.value = defs[k];
      el.addEventListener('input', () => {
        if (k === 'title') el.dataset.dirty = el.value ? '1' : '';
        const mm = store.get('meta', {}); mm[k] = el.value;
        if (!el.value && k === 'title') delete mm[k];
        store.set('meta', mm);
        renderArticle();
      });
    });
    ['mTwoCol', 'mEdit'].forEach(id => $(id).addEventListener('change', () => renderArticle()));
  }
  function renderArticle() {
    const ctx = state.last;
    if (!ctx || !ctx.R) { $('paperStage').innerHTML = '<p class="note">Se necesitan datos válidos para generar el artículo.</p>'; return; }
    if (!$('mTitle').dataset.dirty) $('mTitle').value = defaultTitle(ctx.T);
    const meta = {};
    Object.entries(metaIds).forEach(([k, id]) => { meta[k] = $(id).value; });
    meta.fluid = 'agua';
    meta.twoCol = $('mTwoCol').checked;
    meta.editable = $('mEdit').checked;
    $('procWrap').hidden = state.src !== 'own';
    $('paperStage').innerHTML = Article.build({ ...ctx, meta });
  }

  /* ---------- Render principal ---------- */
  let tank3d = null;
  function render() {
    const cfg = readConfig();
    showMsgs(cfg.errors, cfg.warns);
    if (cfg.errors.length) return; // se mantiene el último estado válido
    const lab = computeLab(cfg);
    const prevE = state.lab ? state.lab.tE : null;
    state.lab = lab;
    if (state.speedAuto) pickSpeed(lab.tE);
    if (prevE !== null && Math.abs(prevE - lab.tE) > 1e-9) state.t = Math.min(state.t, lab.tE);
    if (tank3d) tank3d.setTank(cfg.key, cfg.p, cfg.z0, cfg.d, fmtLenShort);
    renderSummary(lab);
    renderTable(lab);
    renderDev(lab);
    $('banner').hidden = true;
    const ctx = computeAnalysis(lab);
    state.last = ctx;
    if (ctx && ctx.warnings.length) { $('banner').hidden = false; $('banner').innerHTML = ctx.warnings.map(w => `<p>⚠ ${w}</p>`).join(''); }
    renderCharts(lab, ctx && ctx.R);
    renderLive(lab);
    const secs = ['dataSec', 'linSec', 'derivSec', 'modelSec', 'resSec'];
    if (!ctx) { secs.forEach(id => { $(id).innerHTML = '<p class="note">Faltan datos válidos (mínimo 5 lecturas).</p>'; }); renderArticle(); return; }
    renderData(ctx); renderLinear(ctx); renderDeriv(ctx); renderModels(ctx); renderResults(ctx);
    renderArticle();
  }
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 110); };

  /* ---------- Reproductor ---------- */
  function pickSpeed(tE) {
    const opts = [...$('speed').options].map(o => +o.value);
    const target = tE / 20; // ≈ 20 s de reproducción
    const s = opts.find(o => o >= target) || opts[opts.length - 1];
    state.speed = s; $('speed').value = String(s);
  }
  function setTime(t) { if (!state.lab) return; state.t = Math.max(0, Math.min(t, state.lab.tE)); renderLive(state.lab); }
  let raf = null, lastTs = 0;
  function play() {
    if (!state.lab) return;
    if (state.t >= state.lab.tE - 1e-9) state.t = 0;
    state.playing = true; $('playBtn').textContent = '⏸ Pausar';
    lastTs = performance.now();
    const tick = now => {
      if (!state.playing) return;
      const dtReal = Math.min(0.1, (now - lastTs) / 1000); lastTs = now;
      setTime(state.t + dtReal * state.speed);
      if (state.t >= state.lab.tE) { pause(); $('playBtn').textContent = '↺ Repetir'; return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function pause() { state.playing = false; if (raf) cancelAnimationFrame(raf); $('playBtn').textContent = '▶ Reproducir'; }

  /* ---------- Ejemplos ---------- */
  function applyPreset(name) {
    const P = PRESETS[name]; if (!P) return;
    pause();
    state.geom = P.geom; state.unit = P.unit;
    Object.entries(P.params).forEach(([k, v]) => { state.params[P.geom][k] = Units.toCm(v, P.unit); });
    $('geom').value = P.geom; segOn('unitSeg', 'unit', P.unit);
    buildGeomParams();
    $('h0').value = fmtT(P.h0, 6); setDiameter(P.d); $('z0').value = fmtT(P.z0, 6);
    state.model = P.model; segOn('modelSeg', 'model', P.model); $('cd').value = fmtT(P.cd, 4); updateCdUi();
    state.dt = P.dt; segOn('dtChips', 'dt', P.dt); $('dtCustomWrap').hidden = true;
    state.t = 0; state.speedAuto = true;
    if (tank3d) tank3d.sig = null;
    render();
    if (tank3d) tank3d.resetView();
  }
  function updateCdUi() {
    $('cdWrap').hidden = state.model === 'ideal';
  }
  function setSrc(src, rerender = true) {
    state.src = src;
    segOn('srcSeg', 'src', src);
    document.querySelectorAll('.srcbox').forEach(b => { b.hidden = b.dataset.for !== src; });
    if (src === 'own' && !$('ownData').value.trim() && state.last && state.last.R) copyData();
    $('overlayWrap').hidden = src !== 'own';
    if (rerender) render();
  }
  function copyData() {
    const R = state.last && state.last.R;
    if (!R) return;
    $('ownData').value = R.tRaw.map((t, i) => `${fmtT(t, 4)}\t${fmtT(R.h[i], 4)}`).join('\n');
  }

  /* ---------- Exportaciones ---------- */
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  function toast(msg) {
    let t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast no-print'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 7000);
  }
  const BLOCKED = 'Esta vista previa bloquea la impresión y las descargas. Abre la web localmente (index.html) o desde GitHub Pages para exportar.';
  function exportPdf() {
    if (framed) { toast(BLOCKED); return; }
    if (!state.last || !state.last.R) return;
    renderArticle();
    const prev = document.title;
    document.title = $('mTitle').value || 'Articulo vaciado de tanques';
    window.print();
    setTimeout(() => { document.title = prev; }, 500);
  }
  function download(name, lines) {
    if (framed) { toast(BLOCKED); return; }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvNum = v => (Number.isFinite(v) ? String(+v.toPrecision(10)) : '').replace('.', Num.getDecimal());
  const SEP = () => (Num.getDecimal() === ',' ? ';' : ',');
  function csvTable() {
    const lab = state.lab; if (!lab) return;
    const u = unitName(), sep = SEP();
    const lines = [['N', 't (s)', 't (min)', `h (${u})`, 'h (%)', 'V restante (L)', 'V evacuado (L)', 'Q (L/s)', 'v (m/s)', `dh (${u})`, `dh/dt (${u}/s)`].join(sep)];
    lab.rows.forEach((r, i) => lines.push([i, csvNum(r.ts), csvNum(r.ts / 60), csvNum(toU(r.h)), csvNum(r.h / lab.cfg.h0 * 100), csvNum(r.V / 1000), csvNum((lab.V0 - r.V) / 1000), csvNum(r.Q / 1000), csvNum(r.v / 100), r.dh === null ? '' : csvNum(toU(r.dh)), csvNum(toU(r.dhdt))].join(sep)));
    download('tabla-vaciado.csv', lines);
  }
  function csvAnalysis() {
    const ctx = state.last; if (!ctx || !ctx.R) return;
    const R = ctx.R, sep = SEP();
    const lines = [['t (min)', 'h real (cm)', 'dh/dt (cm/min)', 'h lineal', 'h exponencial', 'h potencial', 'h Torricelli'].join(sep)];
    R.t.forEach((t, i) => lines.push([csvNum(R.tRaw[i]), csvNum(R.h[i]), R.deriv[i] === null ? '' : csvNum(R.deriv[i]), ...R.models.map(m => csvNum(m.pred[i])), csvNum(ctx.fitModel.hOf(t))].join(sep)));
    download('analisis-vaciado.csv', lines);
  }

  /* ---------- Eventos ---------- */
  function bind() {
    $('preset').addEventListener('change', e => { applyPreset(e.target.value); e.target.value = ''; });
    $('geom').addEventListener('change', e => { state.geom = e.target.value; buildGeomParams(); render(); });
    $('geomParams').addEventListener('input', schedule);
    document.querySelectorAll('#unitSeg button').forEach(b => b.addEventListener('click', () => {
      const old = state.unit, nu = b.dataset.unit;
      if (old === nu) return;
      // convierte los valores escritos para que la dimensión física no cambie
      ['h0', 'z0'].forEach(id => { const v = readNum(id); if (Number.isFinite(v)) $(id).value = fmtT(Units.fromCm(Units.toCm(v, old), nu), 6); });
      state.unit = nu; segOn('unitSeg', 'unit', nu);
      buildGeomParams(); if (tank3d) tank3d.sig = null; render();
    }));
    ['h0', 'dout', 'z0', 'cd', 'dtCustom', 'ownData'].forEach(id => $(id).addEventListener('input', schedule));
    $('doutSel').addEventListener('change', e => {
      $('doutWrap').hidden = e.target.value !== 'otro';
      if (e.target.value === 'otro') $('dout').focus();
      render();
    });
    document.querySelectorAll('#modelSeg button').forEach(b => b.addEventListener('click', () => { state.model = b.dataset.model; segOn('modelSeg', 'model', state.model); updateCdUi(); render(); }));
    document.querySelectorAll('#dtChips button').forEach(b => b.addEventListener('click', () => {
      state.dt = b.dataset.dt === 'custom' ? 'custom' : +b.dataset.dt;
      segOn('dtChips', 'dt', b.dataset.dt);
      $('dtCustomWrap').hidden = state.dt !== 'custom';
      render();
    }));
    document.querySelectorAll('#digSeg button').forEach(b => b.addEventListener('click', () => { state.digits = +b.dataset.dig; segOn('digSeg', 'dig', b.dataset.dig); render(); }));
    document.querySelectorAll('#decSeg button').forEach(b => b.addEventListener('click', () => { Num.setDecimal(b.dataset.dec); segOn('decSeg', 'dec', b.dataset.dec); if (tank3d) tank3d.sig = null; render(); }));
    document.querySelectorAll('#srcSeg button').forEach(b => b.addEventListener('click', () => setSrc(b.dataset.src)));
    $('overlay').addEventListener('change', () => { if (state.lab) { renderCharts(state.lab, state.last && state.last.R); renderLive(state.lab); } });
    $('speed').addEventListener('change', e => { state.speed = +e.target.value; state.speedAuto = false; });
    $('tSlider').addEventListener('input', e => { pause(); if (state.lab) setTime(e.target.value / 1000 * state.lab.tE); });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'pdf') exportPdf();
        else if (act === 'csv') csvAnalysis();
        else if (act === 'csvTable') csvTable();
        else if (act === 'play') state.playing ? pause() : play();
        else if (act === 'restart') { pause(); setTime(0); }
        else if (act === 'home') tank3d && tank3d.resetView();
        else if (act === 'copyData') { copyData(); render(); }
        else if (act === 'toggleDev') {
          state.devOpen = !state.devOpen;
          document.querySelectorAll('.dblk').forEach(d => { d.open = state.devOpen; });
          a.textContent = state.devOpen ? 'Plegar todo' : 'Desplegar todo';
        }
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        state.modelTab = +tab.dataset.tab;
        document.querySelectorAll('#modelSec .tab').forEach(t => t.classList.toggle('on', t === tab));
        document.querySelectorAll('.tabpane').forEach(p => { p.hidden = +p.dataset.pane !== state.modelTab; });
      }
    });
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); state.playing ? pause() : play(); }
    });
    const links = [...document.querySelectorAll('#nav a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + en.target.id)); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['sim', 'graficas', 'tabla', 'desarrollo', 'metodo', 'articulo'].forEach(id => obs.observe($(id)));
    window.addEventListener('beforeprint', () => renderArticle());
  }

  buildGeomSelect();
  buildInchSelect();
  initMeta();
  initCharts();
  try { tank3d = new Tank3D($('viewer')); if (!tank3d.ok) tank3d = null; } catch (e) { tank3d = null; $('viewer').innerHTML = '<p class="nogl">No se pudo iniciar la vista 3D en este navegador.</p>'; }
  bind();
  applyPreset('balde');
})();
