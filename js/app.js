/* Controlador de la interfaz: lee la configuración, recalcula en tiempo real y renderiza. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { TANKS, fmt, fmtT, tn, ts } = Num;
  const K = window.K;
  const TeX = window.TeX;

  const PRESET = { geom: 'tronco', params: { d1: 30, d2: 40, H: 55 }, dmm: 8, cd: 0.61, h0: 45.7, src: 'paper' };
  const state = { src: 'paper', geom: 'tronco', params: {}, seed: 7, last: null, play: null, tView: 0 };
  Object.keys(TANKS).forEach(k => { state.params[k] = {}; TANKS[k].params.forEach(([pk, , def]) => { state.params[k][pk] = def; }); });
  state.params.tronco = { ...PRESET.params };

  const store = {
    get(k, d) { try { const v = localStorage.getItem('vt:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vt:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };

  /* ---------- Controles de geometría ---------- */
  function buildGeomSelect() {
    $('geom').innerHTML = Object.entries(TANKS).map(([k, T]) => `<option value="${k}">${T.nombre}</option>`).join('');
    $('geom').value = state.geom;
  }
  function buildGeomParams() {
    const T = TANKS[state.geom];
    $('geomParams').innerHTML = T.params.map(([k, label]) =>
      `<label>${label} (cm)<input type="number" data-p="${k}" step="0.1" min="0.1" value="${state.params[state.geom][k]}"></label>`).join('');
  }

  /* ---------- Lectura de datos propios ---------- */
  function parseOwn(text) {
    const t = [], h = [];
    text.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line) return;
      let tok;
      if (/[\t;]/.test(line) || /\s/.test(line)) tok = line.split(/[\t;]+|\s+/);
      else tok = line.split(',');
      tok = tok.filter(Boolean).map(s => s.replace(',', '.'));
      if (tok.length < 2) return;
      const a = parseFloat(tok[0]), b = parseFloat(tok[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) { t.push(a); h.push(b); }
    });
    const idx = t.map((_, i) => i).sort((i, j) => t[i] - t[j]);
    return { t: idx.map(i => t[i]), h: idx.map(i => h[i]) };
  }

  const num = (id, d) => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) ? v : d; };

  /* ---------- Cálculo ---------- */
  function compute() {
    const key = state.geom, T = TANKS[key];
    const p = { ...state.params[key] };
    const d = num('dmm', 8) / 10; // cm
    const Cd = num('cd', 0.61);
    const Ht = T.height(p);
    const warnings = [];

    let data, src = { mode: state.src };
    if (state.src === 'paper') data = { t: Num.PAPER.t.slice(), h: Num.PAPER.h.slice() };
    else if (state.src === 'own') {
      data = parseOwn($('ownData').value);
      $('ownErr').textContent = data.t.length < 5 ? `Se necesitan al menos 5 lecturas válidas (hay ${data.t.length}).` : '';
      if (data.t.length < 5) data = null;
    }

    let h0 = state.src === 'sim' ? num('h0', 40) : (data ? data.h[0] : num('h0', 40));
    if (h0 > Ht) { warnings.push(`El nivel inicial (${fmtT(h0, 2)} cm) supera la altura del tanque (${fmtT(Ht, 2)} cm); el modelo teórico usa h₀ = ${fmtT(Ht, 2)} cm.`); }
    const h0th = Math.min(h0, Ht);
    const theory = Num.torricelli(key, p, d, Cd, h0th);

    if (state.src === 'sim') {
      let dt = num('dt', 0.5);
      if ($('dtAuto').checked) { dt = Num.niceStep(theory.tEmpty / 23); $('dt').value = dt; }
      src = { mode: 'sim', dt, sigma: num('sigma', 0), res: num('res', 0.1), seed: state.seed };
      data = Num.simulate(theory, { dt, sigma: src.sigma, res: src.res, seed: num('seed', 7) });
    }
    if (!data) return { key, T, p, d, Cd, theory, warnings, R: null };

    const R = Num.analyze(data.t, data.h);
    const CdFit = Num.fitCd(key, p, d, Math.min(R.h0, Ht), R.t, R.h);
    const fitModel = Num.torricelli(key, p, d, CdFit, Math.min(R.h0, Ht));
    const fpred = R.t.map(fitModel.hOf);
    // exponente efectivo de Torricelli en el rango de alturas medido
    const hs = R.posPairs.map(q => q.h);
    const nEff = hs.length > 2 ? Num.linfit(hs.map(Math.log), hs.map(h => Math.log(-theory.dhdt(h)))).a : NaN;
    if (state.src === 'paper' && key !== 'tronco') warnings.push('Usas los datos reales del artículo (tanque tipo balde). La geometría elegida solo cambia el modelo teórico; para generar datos de este tanque cambia la fuente a “Simulación”.');
    if (R.models.some(m => !Number.isFinite(m.coef.A ?? m.coef.alpha))) warnings.push('Algún ajuste no pudo calcularse con estos datos.');

    return {
      key, T, p, d, Cd, theory, warnings, R, src, CdFit, fitModel, nEff,
      fitR2: Num.r2det(R.h, fpred), fitR2c: Num.r2corr(R.h, fpred),
      fitRmse: Math.sqrt(R.h.reduce((s, v, i) => s + (v - fpred[i]) ** 2, 0) / R.n)
    };
  }

  /* ---------- Bloques de presentación ---------- */
  const eqBox = (tex, note) => `<div class="eqbox">${K(tex, true)}${note ? `<p class="eqnote">${note}</p>` : ''}</div>`;
  const step = (n, title, body) => `<div class="step"><div class="step-n">${n}</div><div class="step-b"><h4>${title}</h4>${body}</div></div>`;
  const tableH = (heads, rows, cls = '') => `<div class="tblwrap ${cls}"><table class="dt"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.cells || r).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const kpi = (label, value, sub) => `<div class="kpi"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

  function renderTank(ctx) {
    const { key, p, theory } = ctx;
    const t = state.tView * theory.tEmpty;
    const h = theory.hOf(t);
    $('tankSvg').innerHTML = Charts.tank(key, p, h, { width: 300, height: 320, flow: true });
    $('live').innerHTML = `
      <div class="live-grid">
        <div><span>t</span><b>${fmt(t, 2)} min</b></div>
        <div><span>h(t)</span><b>${fmt(h, 2)} cm</b></div>
        <div><span>V(t)</span><b>${fmt(theory.vol(h) / 1000, 2)} L</b></div>
        <div><span>Q(t)</span><b>${fmt(theory.Q(h), 1)} cm³/s</b></div>
        <div><span>A<sub>w</sub>(h)</span><b>${fmt(theory.area(h), 1)} cm²</b></div>
        <div><span>dh/dt</span><b>${fmt(h > 0 ? theory.dhdt(h) : 0, 3)} cm/min</b></div>
      </div>`;
  }

  function renderKpis(ctx) {
    const { T, p, d, theory } = ctx;
    const h0 = Math.min(ctx.R ? (state.src === 'sim' ? num('h0', 40) : ctx.R.h0) : num('h0', 40), T.height(p));
    $('kpis').innerHTML =
      kpi('Volumen inicial', `${fmt(theory.vol(h0) / 1000, 2)} L`, `h₀ = ${fmtT(h0, 2)} cm`) +
      kpi('Área del orificio A₀', `${fmt(theory.A0, 4)} cm²`, `d = ${fmtT(d * 10, 2)} mm`) +
      kpi('Tiempo teórico de vaciado', `${fmt(theory.tEmpty, 2)} min`, minsec(theory.tEmpty).replace(/^.*\(|\)$/g, '')) +
      kpi('Caudal inicial', `${fmt(theory.Q(h0), 1)} cm³/s`, `${fmt(theory.Q(h0) * 60 / 1000, 2)} L/min`);
  }

  function renderTheory(ctx) {
    const { key, T, p, d, Cd, theory } = ctx;
    const h0 = theory.tOf(0) > 0 ? (ctx.R ? Math.min(state.src === 'sim' ? num('h0', 40) : ctx.R.h0, T.height(p)) : num('h0', 40)) : 0;
    const A0 = theory.A0;
    const Kc = theory.K;
    let html = '<div class="steps-list">';
    html += step(1, 'Velocidad de salida (Torricelli)', `<p>Al igualar la energía cinética con la potencial de una gota que cae desde la altura <i>h</i>:</p>${eqBox('\\tfrac12 m v^2 = m g h \\;\\Rightarrow\\; v = \\sqrt{2 g h}')}`);
    html += step(2, 'Balance de volumen', `<p>El caudal que sale por el orificio es ${K('Q = C_d A_0 v')}. Como el volumen disminuye:</p>${eqBox('\\dfrac{dV}{dt} = -C_d A_0\\sqrt{2gh}', `Orificio: ${K(`A_0 = \\dfrac{\\pi d^2}{4} = \\dfrac{\\pi (${tn(d, 3, true)})^2}{4} = ${tn(A0, 4)}\\ \\text{cm}^2`)}, ${K(`C_d = ${tn(Cd, 3, true)}`)}`)}`);
    html += step(3, 'Geometría del tanque', `<p>${K('dV = A_w(h)\\,dh')}, donde ${K('A_w(h)')} es el área de la superficie libre del líquido:</p>${eqBox(T.areaSym())}${eqBox(T.areaNum(p))}`);
    html += step(4, 'Ecuación diferencial', `<p>Sustituyendo ${K('dV/dt = A_w\\,dh/dt')}:</p>${eqBox('\\dfrac{dh}{dt} = -\\dfrac{C_d A_0 \\sqrt{2 g h}}{A_w(h)}', `Con ${K('g = 981\\ \\text{cm/s}^2')}: ${K(`C_d A_0\\sqrt{2g} = ${tn(Kc, 4)}\\ \\text{cm}^{5/2}/\\text{s}`)}`)}`);
    let sol = `<p>Separando variables e integrando desde ${K(`h_0 = ${tn(h0, 2, true)}\\ \\text{cm}`)}:</p>${eqBox(TeX.torricelliSol(key))}`;
    if (T.constArea) {
      const kk = Cd * A0 / T.area(0, p) * Math.sqrt(Num.G / 2) * 60;
      sol += eqBox(`h(t) = \\left(${tn(Math.sqrt(h0), 4)} - ${tn(kk, 5)}\\,t\\right)^2 \\quad [h\\ \\text{en cm},\\ t\\ \\text{en min}]`);
      sol += eqBox(`t_v = \\dfrac{A_w}{C_d A_0}\\sqrt{\\dfrac{2h_0}{g}} = \\dfrac{${tn(T.area(0, p), 2)}}{${tn(Cd * A0, 4)}}\\sqrt{\\dfrac{2(${tn(h0, 2, true)})}{981}} = ${tn(theory.tEmpty * 60, 1)}\\ \\text{s} = ${tn(theory.tEmpty, 2)}\\ \\text{min}`);
    } else {
      sol += eqBox(`t_v = t(h = 0) = ${tn(theory.tEmpty * 60, 1)}\\ \\text{s} = ${tn(theory.tEmpty, 2)}\\ \\text{min}`, 'El nivel en función del tiempo, h(t), se obtiene invirtiendo t(h) numéricamente.');
    }
    html += step(5, 'Solución y tiempo de vaciado', sol);
    html += '</div>';
    const series = [{ kind: 'line', pts: Charts.sample(theory.hOf, 0, theory.tEmpty * 1.02), color: Charts.COLORS.torricelli, label: `Torricelli (Cd = ${fmtT(Cd, 3)})` }];
    if (ctx.R) {
      series.push({ kind: 'points', pts: ctx.R.t.map((t, i) => [t, ctx.R.h[i]]), color: Charts.COLORS.datos, label: 'Datos' });
      if (Math.abs(ctx.CdFit - Cd) > 0.005) series.push({ kind: 'line', pts: Charts.sample(ctx.fitModel.hOf, 0, Math.max(ctx.fitModel.tEmpty, ctx.R.t[ctx.R.n - 1]) * 1.02), color: '#7c3aed', dash: '6 4', label: `Torricelli (Cd ajustado = ${fmt(ctx.CdFit, 3)})` });
    }
    html += `<div class="chart-card">${Charts.chart({ width: 900, height: 400, fontSize: 13, xLabel: 'Tiempo, t (min)', yLabel: 'Altura, h (cm)', series, legend: 'tr' })}</div>`;
    if (ctx.R) html += `<p class="note">Ajustando solo C<sub>d</sub> para que Torricelli pase por los datos se obtiene <b>C<sub>d</sub> = ${fmt(ctx.CdFit, 3)}</b> (R² = ${fmt(ctx.fitR2, 5)}). ${state.src === 'paper' ? 'Como el artículo no reporta las dimensiones del balde ni del orificio, este valor depende de las dimensiones que configures.' : ''}</p>`;
    $('theory').innerHTML = html;
  }

  function renderData(ctx) {
    const R = ctx.R;
    const srcName = { paper: 'Datos reales del artículo de Plaza Gálvez (2017)', sim: 'Datos simulados a partir de la ley de Torricelli con ruido de medición', own: 'Datos propios ingresados' }[state.src];
    let html = `<p class="lead">${srcName}. <b>${R.n}</b> lecturas, ${R.uniform ? `paso constante Δt = <b>${fmtT(R.steps[0], 4)} min</b>` : 'paso de tiempo variable'}, desde h = ${fmtT(R.h[0], 3)} cm hasta h = ${fmtT(R.h[R.n - 1], 3)} cm.</p>`;
    html += `<div class="two"><div>${tableH(['i', 't (min)', 'h (cm)'], R.tRaw.map((t, i) => [i, fmtT(t, 4), fmtT(R.h[i], 4)]), 'scroll')}<p class="cap">Tabla 1. Toma de datos h = f(t).</p></div>`;
    html += `<div class="chart-card">${Charts.chart({ xLabel: 'Tiempo, t (min)', yLabel: 'Altura, h (cm)', legend: 'tr', series: [
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
    html += step(3, 'Resultado', `${eqBox(TeX.linReg(L))}<div class="pill-row"><span class="pill">R² = ${fmt(L.r2, 4)}</span><span class="pill">Vaciado: t = −b/a = ${fmt(tv, 2)} min</span></div><p>Es un ajuste alto, pero la recta supone una velocidad de descenso <b>constante</b> de ${fmt(-L.a, 3)} cm/min, mientras que el nivel baja cada vez más despacio. Por eso se mejora con las ecuaciones diferenciales.</p>`);
    html += `</div><div class="chart-card">${ArticleFigures(ctx, { width: 620, height: 380 }).linear}<p class="cap">Análisis de altura vs. tiempo. Regresión lineal.</p></div></div>`;
    $('linSec').innerHTML = html;
  }

  function renderDeriv(ctx) {
    const R = ctx.R;
    const i = Math.min(1, R.n - 2);
    let html = '<div class="steps-list">';
    html += step(1, 'Diferencias centradas (serie de Taylor)', eqBox('\\left.\\dfrac{dh}{dt}\\right|_{t_i} \\approx \\dfrac{h_{i+1} - h_{i-1}}{t_{i+1} - t_{i-1}} = \\dfrac{h(t+\\Delta t) - h(t-\\Delta t)}{2\\,\\Delta t}', R.uniform ? `Con ${K(`\\Delta t = ${tn(R.steps[0], 4, true)}`)} min el denominador es ${K(`2\\Delta t = ${tn(2 * R.steps[0], 4, true)}`)}. La primera y la última lectura no tienen derivada.` : 'Paso variable: se usa la forma general.'));
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
      s.push(['Condición inicial h(0) = h₀', eqBox(`\\alpha h + \\beta = (\\alpha h_0 + \\beta)\\,e^{-\\alpha t}`) + eqBox(`\\Rightarrow\\; ${TeX.solSym.lineal}`, `${K(`h_0 + \\beta/\\alpha = ${tn(h0, 3, true)} + ${tn(c.C2, 5)} = ${tn(c.C1, 5)}`)}`)]);
    } else if (m.key === 'exponencial') {
      s.push(['Regresión (Tabla 3)', eqBox(TeX.fit(m), `Linealizada: ${K('\\ln y = \\ln A + B h')} · A = ${fmt(c.A, 5)}, B = ${fmt(c.B, 5)}, R² = ${fmt(m.fitR2, 5)}`)]);
      s.push(['Ecuación diferencial', eqBox(`${TeX.odeSym.exponencial} \\;\\Rightarrow\\; ${TeX.ode(m)}`)]);
      s.push(['Separación de variables', eqBox('\\int e^{-Bh}\\,dh = -A\\int dt \\;\\Rightarrow\\; -\\dfrac{1}{B}e^{-Bh} = -A t + C')]);
      s.push(['Condición inicial h(0) = h₀', eqBox(`e^{-Bh} = AB\\,t + e^{-Bh_0}`) + eqBox(`\\Rightarrow\\; ${TeX.solSym.exponencial}`, `${K(`AB = ${tn(c.AB, 5)}`)}, ${K(`e^{-Bh_0} = ${tn(c.c, 7)}`)}, ${K(`-1/B = ${tn(-c.invB, 4)}`)}`)]);
    } else {
      s.push(['Regresión (Tabla 3)', eqBox(TeX.fit(m), `Linealizada: ${K('\\ln y = \\ln A + n\\ln h')} · A = ${fmt(c.A, 5)}, n = ${fmt(c.n, 5)}, R² = ${fmt(m.fitR2, 5)}`)]);
      s.push(['Ecuación diferencial', eqBox(`${TeX.odeSym.potencial} \\;\\Rightarrow\\; ${TeX.ode(m)}`)]);
      s.push(['Separación de variables', eqBox('\\int h^{-n}\\,dh = -A\\int dt \\;\\Rightarrow\\; \\dfrac{h^{1-n}}{1-n} = -A t + C')]);
      s.push(['Condición inicial h(0) = h₀', eqBox(`h^{1-n} = h_0^{1-n} - (1-n)A\\,t`) + eqBox(`\\Rightarrow\\; ${TeX.solSym.potencial}`, `${K(`1-n = ${tn(c.e, 5)}`)}, ${K(`h_0^{1-n} = ${tn(c.base0, 5)}`)}, ${K(`(1-n)A = ${tn(c.k, 6)}`)}, ${K(`\\tfrac{1}{1-n} = ${tn(c.exp, 5)}`)}`)]);
    }
    s.push(['Modelo final', `${eqBox(TeX.sol(m))}<div class="pill-row"><span class="pill strong">R² = ${fmt(m.R2, 6)}</span><span class="pill">RMSE = ${fmt(m.rmse, 3)} cm</span></div>`]);
    s.push(['Tiempo de vaciado (h = 0)', eqBox(`${TeX.tEmptySym[m.key]} = ${Number.isFinite(m.tEmpty) ? tn(m.tEmpty, 3) + '\\ \\text{min}' : '\\infty'}`)]);
    return s.map((x, i) => step(i + 1, x[0], x[1])).join('');
  }

  function renderModels(ctx) {
    const R = ctx.R, F = ArticleFigures(ctx);
    const figs = { lineal: F.dLin, exponencial: F.dExp, potencial: F.dPow };
    let html = `<div class="tabs" role="tablist">${R.models.map((m, i) => `<button class="tab${i === (state.modelTab ?? 2) ? ' on' : ''}" data-tab="${i}">${m.nombre}${m === R.best ? ' ★' : ''}</button>`).join('')}</div>`;
    R.models.forEach((m, i) => {
      html += `<div class="tabpane" data-pane="${i}" ${i === (state.modelTab ?? 2) ? '' : 'hidden'}><div class="two"><div class="steps-list">${modelSteps(m, R)}</div><div class="chart-card">${figs[m.key]}<p class="cap">Regresión ${m.nombre.toLowerCase()} · análisis de la derivada numérica.</p></div></div></div>`;
    });
    html += `<h3 class="sub">Cuadro 4 · Ecuaciones diferenciales</h3>`;
    html += tableH(['Regresión', 'Ecuación diferencial', 'R² del ajuste'], R.models.map(m => [m.nombre, K(TeX.ode(m)), fmt(m.fitR2, 5)]));
    html += `<h3 class="sub">Cuadro 5 · Modelos h = f(t)</h3>`;
    html += tableH(['Regresión', 'Expresión matemática h = f(t)', 'R² (1 − SSE/SST)', 'r² (correlación)'], R.models.map(m => ({ cls: m === R.best ? 'best' : '', cells: [m.nombre, K(TeX.sol(m)), fmt(m.R2, 6), fmt(m.r2c, 6)] })));
    html += `<p class="note">El artículo original reporta en el Cuadro 5 el <b>r²</b> (cuadrado de la correlación entre datos y modelo); por ejemplo, con sus datos se obtiene 0,999461 · 0,998897 · 0,999965, igual que en el artículo. La columna R² = 1 − SSE/SST es más exigente porque también penaliza el sesgo.</p>`;
    $('modelSec').innerHTML = html;
  }

  function renderResults(ctx) {
    const R = ctx.R, best = R.best, F = ArticleFigures(ctx, { width: 900, height: 430, fontSize: 13 });
    const [ml, me, mp] = R.models;
    let html = `<div class="best-card"><div><span class="eyebrow">Mejor modelo</span><h3>${best.nombre}</h3>${K(TeX.sol(best), true)}</div><div class="kpis">${kpi('R²', fmt(best.R2, 6))}${kpi('RMSE', fmt(best.rmse, 3) + ' cm')}${kpi('Tiempo de vaciado', fmt(best.tEmpty, 2) + ' min')}</div></div>`;
    html += `<div class="rank">${R.models.slice().sort((a, b) => b.R2 - a.R2).map((m, i) => `<div class="rank-row"><span class="dot" style="background:${Charts.COLORS[m.key]}"></span><b>${i + 1}. ${m.nombre}</b><span class="bar"><i style="width:${Math.max(2, Math.min(100, (m.R2 - 0.9) / 0.1 * 100))}%;background:${Charts.COLORS[m.key]}"></i></span><span>R² = ${fmt(m.R2, 6)}</span></div>`).join('')}<div class="rank-row"><span class="dot" style="background:${Charts.COLORS.torricelli}"></span><b>Torricelli (C<sub>d</sub> = ${fmt(ctx.CdFit, 3)})</b><span class="bar"><i style="width:${Math.max(2, Math.min(100, (ctx.fitR2 - 0.9) / 0.1 * 100))}%;background:${Charts.COLORS.torricelli}"></i></span><span>R² = ${fmt(ctx.fitR2, 6)}</span></div><div class="rank-row"><span class="dot" style="background:#94a3b8"></span><b>Recta directa (sección 4)</b><span class="bar"><i style="width:${Math.max(2, Math.min(100, (R.lin.r2 - 0.9) / 0.1 * 100))}%;background:#94a3b8"></i></span><span>R² = ${fmt(R.lin.r2, 6)}</span></div></div>`;
    html += `<div class="chart-card">${F.compare}<p class="cap">Comparación de los modelos con los datos reales.</p></div>`;
    const rows = R.t.map((t, i) => [fmtT(R.tRaw[i], 4), `<b>${fmtT(R.h[i], 4)}</b>`, fmt(ml.pred[i], 5), fmt(me.pred[i], 5), fmt(mp.pred[i], 5), fmt(ctx.fitModel.hOf(t), 5)]);
    rows.push({ cls: 'foot', cells: ['', 'R²', fmt(ml.R2, 6), fmt(me.R2, 6), fmt(mp.R2, 6), fmt(ctx.fitR2, 6)] });
    rows.push({ cls: 'foot', cells: ['', 'r²', fmt(ml.r2c, 6), fmt(me.r2c, 6), fmt(mp.r2c, 6), fmt(ctx.fitR2c, 6)] });
    rows.push({ cls: 'foot', cells: ['', 'RMSE (cm)', fmt(ml.rmse, 4), fmt(me.rmse, 4), fmt(mp.rmse, 4), fmt(ctx.fitRmse, 4)] });
    rows.push({ cls: 'foot', cells: ['', 't vaciado (min)', fmt(ml.tEmpty, 2), fmt(me.tEmpty, 2), fmt(mp.tEmpty, 2), fmt(ctx.fitModel.tEmpty, 2)] });
    html += `<h3 class="sub">Cuadro 6 · Análisis de resultados</h3>`;
    html += tableH(['t (min)', 'h real (cm)', 'h lineal', 'h exponencial', 'h potencial', 'h Torricelli'], rows, 'scroll tall');
    html += `<p class="note">“—” indica que el modelo ya no tiene valor real (el tanque se vació antes de ese tiempo). Torricelli usa el C<sub>d</sub> ajustado a los datos.</p>`;
    $('resSec').innerHTML = html;
  }

  /* ---------- Artículo ---------- */
  const EN_T = { cilindro: 'a vertical cylindrical', rectangular: 'a rectangular', tronco: 'a truncated-cone', cono: 'a conical', esfera: 'a spherical', horizontal: 'a horizontal cylindrical' };
  function defaultMeta(ctx) {
    return {
      title: `Modelo matemático para el vaciado de un tanque ${ctx.T.articulo}`,
      titleEn: `Mathematical modeling for emptying ${EN_T[ctx.key]} tank`
    };
  }
  const metaIds = { title: 'mTitle', titleEn: 'mTitleEn', authors: 'mAuthors', email: 'mEmail', affiliation: 'mAffil', journal: 'mJournal', date: 'mDate', procedure: 'mProc' };
  function initMeta() {
    const today = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const saved = store.get('meta', {});
    const defs = {
      authors: 'Nombre del autor', email: '', affiliation: 'Programa de Ingeniería · Curso de Ecuaciones Diferenciales · Universidad',
      journal: 'Informe de laboratorio · Ecuaciones Diferenciales', date: today,
      procedure: 'Se llenó el tanque y se abrió el orificio del fondo. Con una regla graduada y un cronómetro se registró la altura del nivel a intervalos regulares de tiempo, iniciando el conteo (t = 0) cuando el nivel pasó por la marca de referencia. La práctica se filmó para verificar las lecturas.'
    };
    Object.entries(metaIds).forEach(([k, id]) => {
      const el = $(id);
      if (saved[k] !== undefined) { el.value = saved[k]; if (k === 'title' || k === 'titleEn') el.dataset.dirty = '1'; }
      else if (defs[k] !== undefined) el.value = defs[k];
      el.addEventListener('input', () => {
        if (k === 'title' || k === 'titleEn') el.dataset.dirty = el.value ? '1' : '';
        const m = store.get('meta', {}); m[k] = el.value;
        if (!el.value && (k === 'title' || k === 'titleEn')) delete m[k];
        store.set('meta', m);
        renderArticle(state.last);
      });
    });
    ['mTwoCol', 'mEdit'].forEach(id => $(id).addEventListener('change', () => renderArticle(state.last)));
  }
  function readMeta(ctx) {
    const d = defaultMeta(ctx);
    if (!$('mTitle').dataset.dirty) $('mTitle').value = d.title;
    if (!$('mTitleEn').dataset.dirty) $('mTitleEn').value = d.titleEn;
    const m = {};
    Object.entries(metaIds).forEach(([k, id]) => { m[k] = $(id).value; });
    m.fluid = $('fluid').value || 'agua';
    m.twoCol = $('mTwoCol').checked;
    m.editable = $('mEdit').checked;
    return m;
  }
  function renderArticle(ctx) {
    if (!ctx || !ctx.R) { $('paperStage').innerHTML = '<p class="note">Ingresa datos válidos para generar el artículo.</p>'; return; }
    const meta = readMeta(ctx);
    $('procWrap').hidden = state.src !== 'own';
    $('paperStage').innerHTML = Article.build({ ...ctx, meta });
  }

  /* ---------- Render principal ---------- */
  function render() {
    const ctx = compute();
    state.last = ctx;
    const ban = $('banner');
    ban.hidden = !ctx.warnings.length;
    ban.innerHTML = ctx.warnings.map(w => `<p>⚠ ${w}</p>`).join('');
    $('h0').disabled = state.src !== 'sim';
    $('h0hint').textContent = state.src === 'sim' ? `Máximo: ${fmtT(ctx.T.height(ctx.p), 2)} cm.` : 'Se toma de la primera lectura de los datos.';
    if (state.src !== 'sim' && ctx.R) $('h0').value = ctx.R.h0;
    renderKpis(ctx);
    renderTank(ctx);
    renderTheory(ctx);
    const secs = ['dataSec', 'linSec', 'derivSec', 'modelSec', 'resSec'];
    if (!ctx.R) { secs.forEach(id => { $(id).innerHTML = '<p class="note">Faltan datos válidos (mínimo 5 lecturas).</p>'; }); renderArticle(ctx); return; }
    renderData(ctx);
    renderLinear(ctx);
    renderDeriv(ctx);
    renderModels(ctx);
    renderResults(ctx);
    renderArticle(ctx);
  }
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(render, 90); };

  /* ---------- Eventos ---------- */
  function setSrc(src) {
    state.src = src;
    document.querySelectorAll('#srcSeg button').forEach(b => b.classList.toggle('on', b.dataset.src === src));
    document.querySelectorAll('.srcbox').forEach(b => { b.hidden = b.dataset.for !== src; });
    if (src === 'own' && !$('ownData').value.trim() && state.last && state.last.R) copyData();
    render();
  }
  function copyData() {
    const R = state.last && state.last.R;
    if (!R) return;
    $('ownData').value = R.tRaw.map((t, i) => `${fmtT(t, 4)}\t${fmtT(R.h[i], 4)}`).join('\n');
  }
  function preset() {
    state.geom = PRESET.geom;
    state.params.tronco = { ...PRESET.params };
    $('geom').value = state.geom; buildGeomParams();
    $('dmm').value = PRESET.dmm; $('cd').value = PRESET.cd; $('h0').value = PRESET.h0;
    setSrc('paper');
  }
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast no-print'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 7000);
  }
  const BLOCKED = 'Esta vista previa bloquea la impresión y las descargas. Abre la web localmente (index.html) o desde GitHub Pages para exportar.';
  function exportPdf() {
    if (framed) { toast(BLOCKED); return; }
    const ctx = state.last;
    if (!ctx || !ctx.R) return;
    if (!$('paperStage').querySelector('.paper')) renderArticle(ctx);
    const prev = document.title;
    document.title = $('mTitle').value || 'Articulo vaciado de tanques';
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => { document.title = prev; document.body.classList.remove('printing'); }, 500);
  }
  function downloadCsv() {
    if (framed) { toast(BLOCKED); return; }
    const ctx = state.last; if (!ctx || !ctx.R) return;
    const R = ctx.R, sep = Num.getDecimal() === ',' ? ';' : ',';
    const f = v => (Number.isFinite(v) ? String(+v.toFixed(6)) : '').replace('.', Num.getDecimal());
    const lines = [['t (min)', 'h real (cm)', 'dh/dt (cm/min)', 'h lineal', 'h exponencial', 'h potencial', 'h Torricelli'].join(sep)];
    R.t.forEach((t, i) => lines.push([f(R.tRaw[i]), f(R.h[i]), R.deriv[i] === null ? '' : f(R.deriv[i]), ...R.models.map(m => f(m.pred[i])), f(ctx.fitModel.hOf(t))].join(sep)));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'vaciado-tanque.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function togglePlay() {
    if (state.play) { cancelAnimationFrame(state.play); state.play = null; $('playBtn').textContent = '▶ Simular vaciado'; return; }
    if (state.tView >= 1) state.tView = 0;
    $('playBtn').textContent = '❚❚ Pausar';
    let last = performance.now();
    const tick = now => {
      state.tView = Math.min(1, state.tView + (now - last) / 9000); last = now;
      $('tSlider').value = Math.round(state.tView * 1000);
      if (state.last) renderTank(state.last);
      if (state.tView >= 1) { state.play = null; $('playBtn').textContent = '↺ Repetir'; return; }
      state.play = requestAnimationFrame(tick);
    };
    state.play = requestAnimationFrame(tick);
  }

  function bind() {
    $('geom').addEventListener('change', e => { state.geom = e.target.value; buildGeomParams(); render(); });
    $('geomParams').addEventListener('input', e => {
      const k = e.target.dataset.p; if (!k) return;
      const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) { state.params[state.geom][k] = v; schedule(); }
    });
    ['dmm', 'cd', 'h0', 'fluid', 'dt', 'res', 'sigma', 'seed', 'ownData'].forEach(id => $(id).addEventListener('input', schedule));
    $('dtAuto').addEventListener('change', () => { $('dt').disabled = $('dtAuto').checked; render(); });
    $('dt').disabled = true;
    document.querySelectorAll('#srcSeg button').forEach(b => b.addEventListener('click', () => setSrc(b.dataset.src)));
    document.querySelectorAll('#decSeg button').forEach(b => b.addEventListener('click', () => {
      Num.setDecimal(b.dataset.dec);
      document.querySelectorAll('#decSeg button').forEach(x => x.classList.toggle('on', x === b));
      render();
    }));
    $('tSlider').addEventListener('input', e => { state.tView = e.target.value / 1000; if (state.last) renderTank(state.last); });
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (a) {
        const act = a.dataset.action;
        if (act === 'pdf') exportPdf();
        else if (act === 'csv') downloadCsv();
        else if (act === 'play') togglePlay();
        else if (act === 'preset') preset();
        else if (act === 'copyData') { copyData(); render(); }
        else if (act === 'reseed') { $('seed').value = Math.floor(Math.random() * 99999); render(); }
      }
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        state.modelTab = +tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === tab));
        document.querySelectorAll('.tabpane').forEach(p => { p.hidden = +p.dataset.pane !== state.modelTab; });
      }
    });
    // resaltar la sección visible en la barra de navegación
    const links = [...document.querySelectorAll('#nav a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === '#' + en.target.id)); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('main > section.card').forEach(s => obs.observe(s));
    window.addEventListener('beforeprint', () => { if (state.last) renderArticle(state.last); });
  }

  buildGeomSelect();
  buildGeomParams();
  initMeta();
  bind();
  render();
})();
