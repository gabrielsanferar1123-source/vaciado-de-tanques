/* Generador del artículo científico (estructura de Plaza Gálvez, 2017). */
(function (global) {
  'use strict';
  const { fmt, fmtT, tn, ts } = Num;

  function K(tex, display = false) {
    if (!global.katex) return `<code class="tex-fallback">${tex}</code>`;
    try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false }); }
    catch (e) { return `<code>${tex}</code>`; }
  }
  global.K = K;

  const EN = {
    cilindro: 'vertical cylindrical', rectangular: 'rectangular', tronco: 'truncated-cone (bucket-shaped)',
    cono: 'conical (apex down)', esfera: 'spherical', horizontal: 'horizontal cylindrical'
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---- Expresiones LaTeX de los modelos (compartidas con la app) ---- */
  const TeX = {
    linReg: L => `h = f(t) = ${tn(L.a, 4)}\\,t ${ts(L.b, 4)}`,
    ode: m => {
      const c = m.coef;
      if (m.key === 'lineal') return `\\dfrac{dh}{dt} = -\\left(${tn(c.alpha, 5)}\\,h ${ts(c.beta, 5)}\\right)`;
      if (m.key === 'exponencial') return `\\dfrac{dh}{dt} = -\\left(${tn(c.A, 5)}\\,e^{${tn(c.B, 5)}\\,h}\\right)`;
      return `\\dfrac{dh}{dt} = -\\left(${tn(c.A, 5)}\\,h^{${tn(c.n, 5)}}\\right)`;
    },
    fit: m => {
      const c = m.coef;
      if (m.key === 'lineal') return `-\\dfrac{dh}{dt} = ${tn(c.alpha, 5)}\\,h ${ts(c.beta, 5)}`;
      if (m.key === 'exponencial') return `-\\dfrac{dh}{dt} = ${tn(c.A, 5)}\\,e^{${tn(c.B, 5)}\\,h}`;
      return `-\\dfrac{dh}{dt} = ${tn(c.A, 5)}\\,h^{${tn(c.n, 5)}}`;
    },
    sol: m => {
      const c = m.coef;
      if (m.key === 'lineal') return `h = ${tn(c.C1, 5)}\\,e^{${tn(-c.alpha, 5)}\\,t} ${ts(-c.C2, 5)}`;
      if (m.key === 'exponencial') return `h = ${tn(-c.invB, 4)}\\,\\ln\\!\\left(${tn(c.AB, 5)}\\,t ${ts(c.c, 7)}\\right)`;
      return `h = \\left(${tn(-c.k, 6)}\\,t ${ts(c.base0, 5)}\\right)^{${tn(c.exp, 5)}}`;
    },
    solSym: {
      lineal: 'h(t) = \\left(h_0 + \\dfrac{\\beta}{\\alpha}\\right)e^{-\\alpha t} - \\dfrac{\\beta}{\\alpha}',
      exponencial: 'h(t) = -\\dfrac{1}{B}\\,\\ln\\!\\left(A B\\,t + e^{-B h_0}\\right)',
      potencial: 'h(t) = \\left[h_0^{\\,1-n} - (1-n)A\\,t\\right]^{\\frac{1}{1-n}}'
    },
    odeSym: {
      lineal: '\\dfrac{dh}{dt} = -(\\alpha h + \\beta)',
      exponencial: '\\dfrac{dh}{dt} = -A\\,e^{B h}',
      potencial: '\\dfrac{dh}{dt} = -A\\,h^{n}'
    },
    tEmptySym: {
      lineal: 't_v = \\dfrac{1}{\\alpha}\\ln\\!\\left(1 + \\dfrac{\\alpha h_0}{\\beta}\\right)',
      exponencial: 't_v = \\dfrac{1 - e^{-B h_0}}{A B}',
      potencial: 't_v = \\dfrac{h_0^{\\,1-n}}{(1-n)A}'
    },
    torricelliSol: (key, z0 = 0) => {
      const T = Num.TANKS[key];
      if (z0 > 0) {
        if (T.constArea) return 'h(t) = z_0 + \\left[\\sqrt{h_0 - z_0} - \\dfrac{C_d A_0}{A_w}\\sqrt{\\dfrac{g}{2}}\\;t\\right]^2';
        return 't(h) = \\dfrac{1}{C_d A_0\\sqrt{2g}}\\int_h^{h_0}\\dfrac{A_w(s)}{\\sqrt{s - z_0}}\\,ds';
      }
      if (T.constArea) return 'h(t) = \\left[\\sqrt{h_0} - \\dfrac{C_d A_0}{A_w}\\sqrt{\\dfrac{g}{2}}\\;t\\right]^2';
      return T.tSym();
    },
    torricelliTv: (key) => {
      const T = Num.TANKS[key];
      if (T.constArea) return 't_v = \\dfrac{A_w}{C_d A_0}\\sqrt{\\dfrac{2h_0}{g}}';
      return 't_v = t(0)';
    }
  };
  global.TeX = TeX;

  /* ---- Bloques ---- */
  const eq = (tex, n) => `<div class="eq"><div class="eq-body">${K(tex, true)}</div><div class="eq-num">(${n})</div></div>`;
  function table(headers, rows, caption, cls = '') {
    return `<figure class="tbl ${cls}"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table><figcaption>${caption}</figcaption></figure>`;
  }
  /* Para series largas (p. ej. Δt = 1 s) el artículo muestra filas equiespaciadas. */
  function thin(rows, max = 36) {
    if (rows.length <= max) return { rows, note: '' };
    const idx = new Set();
    for (let i = 0; i < max; i++) idx.add(Math.round(i * (rows.length - 1) / (max - 1)));
    return { rows: rows.filter((_, i) => idx.has(i)), note: ` Se muestran ${idx.size} de ${rows.length} filas, equiespaciadas; los cálculos usan todas.` };
  }
  const fig = (svg, caption, cls = '') => `<figure class="fig ${cls}">${svg}<figcaption>${caption}</figcaption></figure>`;

  function minsec(tmin) {
    if (!Number.isFinite(tmin)) return 'no se vacía (tiempo infinito)';
    const tot = Math.round(tmin * 60), m = Math.floor(tot / 60), s = tot % 60;
    return `${fmt(tmin, 2)} min (${m} min ${String(s).padStart(2, '0')} s)`;
  }
  global.minsec = minsec;

  /* ---- Figuras del análisis (reutilizadas en la app) ---- */
  function figures(ctx, size = {}) {
    const R = ctx.R, C = Charts.COLORS, ch = Charts.chart, sm = Charts.sample;
    const w = size.width || 560, hgt = size.height || 330, fs = size.fontSize || 12;
    const tMax = R.t[R.n - 1];
    const dataPts = R.t.map((t, i) => [t, R.h[i]]);
    const hMax = Math.max(...R.pairs.map(p => p.h));
    const hMin = Math.min(...R.pairs.map(p => p.h));
    const derivPts = R.pairs.map(p => [p.h, p.y]);
    const [ml, me, mp] = R.models;
    const base = { width: w, height: hgt, fontSize: fs };
    const out = {};
    out.linear = ch({ ...base, xLabel: 'Tiempo, t (min)', yLabel: 'Altura, h (cm)', legend: 'tr', series: [
      { kind: 'line', pts: dataPts, color: '#64748b', width: 1.2 },
      { kind: 'points', pts: dataPts, color: C.datos, label: 'h medida (cm)' },
      { kind: 'line', pts: sm(t => R.lin.a * t + R.lin.b, 0, tMax * 1.05, 2), color: C.regresion, label: 'Regresión lineal' }
    ] });
    const dv = (f, color, label) => ch({ ...base, xLabel: 'Altura, h (cm)', yLabel: '−dh/dt (cm/min)', legend: 'br', xMin: 0, series: [
      { kind: 'line', pts: derivPts.slice().sort((a, b) => a[0] - b[0]), color: '#94a3b8', width: 1.2 },
      { kind: 'points', pts: derivPts, color: C.datos, label: '−dh/dt numérica' },
      { kind: 'line', pts: sm(f, Math.max(0.01, hMin * 0.0), hMax * 1.04), color, label }
    ] });
    out.dLin = dv(h => ml.coef.alpha * h + ml.coef.beta, C.lineal, 'Ajuste lineal');
    out.dExp = dv(h => me.coef.A * Math.exp(me.coef.B * h), C.exponencial, 'Ajuste exponencial');
    out.dPow = dv(h => mp.coef.A * Math.pow(h, mp.coef.n), C.potencial, 'Ajuste potencial');
    const tEnd = tMax * 1.04;
    const series = [
      { kind: 'points', pts: dataPts, color: C.datos, label: 'h real' },
      { kind: 'line', pts: sm(ml.f, 0, tEnd), color: C.lineal, label: 'Modelo lineal' },
      { kind: 'line', pts: sm(me.f, 0, tEnd), color: C.exponencial, label: 'Modelo exponencial' },
      { kind: 'line', pts: sm(mp.f, 0, tEnd), color: C.potencial, label: 'Modelo potencial' }
    ];
    if (ctx.fitModel) series.push({ kind: 'line', pts: sm(ctx.fitModel.hOf, 0, tEnd), color: C.torricelli, dash: '6 4', label: `Torricelli (Cd = ${fmt(ctx.CdFit, 3)})` });
    out.compare = ch({ ...base, xLabel: 'Tiempo, t (min)', yLabel: 'Altura, h (cm)', legend: 'tr', series });
    return out;
  }
  global.ArticleFigures = figures;

  /* ---- Artículo completo ---- */
  function build(ctx) {
    const { meta, key, p, d, Cd, theory, R, src, CdFit, fitModel, nEff } = ctx;
    const z0 = ctx.z0 || 0;
    const T = Num.TANKS[key];
    const [ml, me, mp] = R.models;
    const best = R.best;
    const F = figures(ctx, { width: 440, height: 290, fontSize: 12 });
    const A0 = Math.PI * d * d / 4;
    const h0 = R.h0;
    const V0 = T.vol(h0, p) / 1000;
    const dtTxt = R.uniform ? `${fmtT(R.steps[0], 4)} min` : 'intervalos variables';
    const linTv = -R.lin.b / R.lin.a;
    let n = 0; const E = () => ++n;
    const eqn = {};

    let srcText;
    if (src.mode === 'paper') {
      srcText = `Se emplearon los datos experimentales reportados por Plaza Gálvez [4], obtenidos en el laboratorio de Ingeniería con un recipiente plástico provisto de un orificio lateral en el fondo. Cada 30 segundos se registró la altura del nivel, tomando como cero de tiempo el instante en que el nivel pasó por la marca de referencia; a cada lectura se le restó una misma cifra (45,7 cm) para referir las alturas a la base del tanque. La práctica se filmó para conservar el registro histórico y poder confrontar los datos.`;
    } else if (src.mode === 'table') {
      srcText = src.sigma > 0
        ? `Los datos se obtuvieron mediante una simulación del ensayo basada en la ley de Torricelli para el tanque descrito, con lecturas cada ${fmtT(src.dtSec, 3)} s, ${src.res > 0 ? `resolución de lectura de ${fmtT(src.res, 3)} cm y ` : ''}un ruido de medición gaussiano de desviación estándar ${fmtT(src.sigma, 3)} cm, con el fin de emular la toma de datos con cronómetro y regla graduada.`
        : `Los datos corresponden a la solución teórica de la ecuación (4) muestreada cada ${fmtT(src.dtSec, 3)} s hasta el vaciado, sin ruido de medición; sirven para verificar que el método numérico recupera el modelo físico.`;
    } else {
      srcText = esc(meta.procedure || '');
    }
    if (R.t0 !== 0) srcText += ` El tiempo se midió desde la primera lectura (t = 0 corresponde a ${fmtT(R.t0, 3)} min del registro original).`;

    const exps = [ml, me, mp].map(m => `${m.nombre.toLowerCase()} (R² = ${fmt(m.R2, 5)})`).join(', ');

    let html = `<article class="paper ${meta.twoCol ? 'two-col' : 'one-col'}" id="paper" ${meta.editable ? 'contenteditable="true" spellcheck="false"' : ''}>`;
    html += `<div class="paper-runhead"><span>${esc(meta.journal)}</span><span>${esc(meta.date)}</span></div>`;
    html += `<header class="paper-head"><h1>${esc(meta.title)}</h1>`;
    html += `<p class="paper-authors">${esc(meta.authors)}</p><p class="paper-affil">${esc(meta.affiliation)}${meta.email ? '<br>' + esc(meta.email) : ''}</p></header>`;
    html += '<div class="paper-body">';

    // Resumen
    html += `<p class="abstract"><b><i>Resumen</i>—</b> En este trabajo se presenta la modelación matemática de la relación entre la altura del nivel de líquido en un tanque ${T.articulo} y el tiempo que toma su vaciado a través de un orificio de ${fmtT(d * 10, 2)} mm en el fondo. A partir de ${R.n} lecturas de altura contra tiempo se ajusta primero una regresión lineal directa (R² = ${fmt(R.lin.r2, 4)}); luego, mediante diferenciación numérica con diferencias centradas, se plantean tres ecuaciones diferenciales ordinarias con soporte en mínimos cuadrados (lineal, exponencial y potencial), que se resuelven por separación de variables. El mejor ajuste lo ofrece el modelo ${best.nombre.toLowerCase()}, con un coeficiente de determinación R² = ${fmt(best.R2, 6)} y un tiempo estimado de vaciado de ${fmt(best.tEmpty, 2)} min. Los resultados se contrastan con el modelo teórico de Torricelli, del cual se estima un coeficiente de descarga efectivo C<sub>d</sub> = ${fmt(CdFit, 3)}.</p>`;
    html += `<p class="keywords"><b><i>Palabras clave</i>—</b> Ecuación diferencial, ley de Torricelli, mínimos cuadrados, modelamiento matemático, tanque.</p>`;
    html += `<p class="abstract"><b><i>Abstract</i>—</b> This work presents the mathematical modeling of the relation between the liquid level in a ${EN[key]} tank and the time it takes to empty through a ${fmtT(d * 10, 2).replace(',', '.')} mm orifice at the bottom. From ${R.n} height–time readings a direct linear regression is fitted first; then, using central-difference numerical differentiation, three ordinary differential equations supported by least squares (linear, exponential and power) are proposed and solved by separation of variables. The best fit is given by the ${({ lineal: 'linear', exponencial: 'exponential', potencial: 'power' })[best.key]} model, with a coefficient of determination R² = ${fmt(best.R2, 6).replace(',', '.')}. Results are compared with Torricelli's theoretical model.</p>`;
    html += `<p class="keywords"><b><i>Key Words</i>—</b> Differential equation, least squares, mathematical modeling, tank, Torricelli's law.</p>`;

    // I. Introducción
    html += `<h2>I. Introducción</h2>`;
    html += `<p>Es importante predecir el tiempo que demora en vaciarse total o parcialmente el contenido de un tanque, o conocer el volumen que se desaloja o que permanece en un instante determinado. En algunas ocasiones se requiere conocer el momento en el que se puede descargar una cantidad específica de líquido, realizar una mezcla o interactuar con un sistema de control de nivel. El vaciado de tanques y la transferencia de líquidos entre recipientes son operaciones comunes en plantas de hidrocarburos y en industrias procesadoras de alimentos y bebidas, lo que permite llevar a cabo diferentes procesos de planeación.</p>`;
    html += `<p>En este trabajo se analiza el vaciado de un tanque ${T.articulo} y la forma como varía la altura del líquido en el tiempo. Inicialmente se revisa la ley de Torricelli teniendo en cuenta la geometría del recipiente; posteriormente se realiza una regresión lineal de los datos, que se mejora ostensiblemente al aplicar diferenciación numérica y plantear las ecuaciones diferenciales que permiten las regresiones lineal, exponencial y potencial, junto con sus respectivas soluciones. Finalmente se obtiene una expresión de la altura del nivel en función del tiempo y se compara con el modelo teórico.</p>`;

    // II. Antecedentes
    html += `<h2>II. Antecedentes</h2>`;
    html += `<p>En hidrodinámica, la ley de Torricelli establece que la velocidad <i>v</i> de salida de un líquido a través de un orificio en el fondo de un tanque lleno hasta una altura <i>h</i> es igual a la velocidad que adquiere un cuerpo que cae libremente desde esa altura, ${K('v=\\sqrt{2gh}')}, donde <i>g</i> es la aceleración de la gravedad. Esta expresión se origina al igualar la energía cinética ${K('mv^2/2')} con la energía potencial ${K('mgh')}.</p>`;
    html += `<p>Si el área transversal del orificio es ${K('A_0')} y se considera el coeficiente de descarga ${K('C_d')} (que tiene en cuenta la contracción de la vena líquida y las pérdidas por fricción), el volumen que sale por unidad de tiempo es ${K('C_d A_0\\sqrt{2gh}')}. Así, si ${K('V(t)')} representa el volumen de líquido en el tanque en el instante <i>t</i>:</p>`;
    eqn.v = E(); html += eq('\\dfrac{dV}{dt} = -C_d\\,A_0\\sqrt{2gh}', eqn.v);
    html += `<p>Si ${K('A_w(h)')} es el área de la superficie libre del líquido a la altura <i>h</i>, entonces ${K('dV = A_w(h)\\,dh')}, es decir,</p>`;
    eqn.a = E(); html += eq('\\dfrac{dV}{dt} = A_w(h)\\,\\dfrac{dh}{dt}', eqn.a);
    html += `<p>Al reemplazar (${eqn.a}) en (${eqn.v}) se llega a</p>`;
    eqn.ode = E(); html += eq('\\dfrac{dh}{dt} = -\\dfrac{C_d\\,A_0}{A_w(h)}\\sqrt{2gh}', eqn.ode);
    html += `<p>que es una ecuación diferencial de variables separables. Para el tanque ${T.articulo} el área de la superficie libre es ${K(T.areaSym())}, de modo que la solución con la condición inicial ${K('h(0)=h_0')} es:</p>`;
    eqn.tor = E(); html += eq(TeX.torricelliSol(key, z0), eqn.tor);
    html += `<p>${T.constArea ? `con ${K('h_0')} como el máximo nivel de líquido para ${K('t=0')}. Esta es una aplicación clásica expuesta en textos de ecuaciones diferenciales [3]; con ${K('C_d = 1')} corresponde al caso ideal.` : `donde ${K('h_0')} es el nivel inicial y ${K('t(h)')} es el tiempo necesario para que el nivel descienda hasta <i>h</i>. Con ${K('h = 0')} se obtiene el tiempo teórico de vaciado.`}</p>`;
    html += fig(Charts.tank(key, p, h0, { width: 300, height: 300, flow: true }), `Figura 1: Diagrama del tanque ${T.articulo}. Ley de Torricelli.`);

    // III. Modelo propuesto
    html += `<h2>III. Modelo propuesto</h2>`;
    html += `<p>Se desea modelar el vaciado de un tanque ${T.articulo} con ${T.dims(p)}, que se llena inicialmente de ${esc(meta.fluid)} hasta una altura ${K(`h_0 = ${tn(h0, 2, true)}\\ \\text{cm}`)} (volumen inicial de ${fmt(V0, 2)} L). El tanque cuenta con un orificio circular en el fondo de diámetro ${K(`d = ${tn(d * 10, 2, true)}\\ \\text{mm}`)}, es decir, ${K(`A_0 = \\pi d^2/4 = ${tn(A0, 4)}\\ \\text{cm}^2`)}, que regula el paso del líquido en su salida${z0 > 0 ? `, ubicado a ${K(`z_0 = ${tn(z0, 2, true)}\\ \\text{cm}`)} sobre el fondo; en ese caso la carga hidráulica es ${K('h - z_0')} y el tanque se vacía hasta el nivel de la salida` : ''}. El área de la superficie libre es</p>`;
    html += `<div class="eq"><div class="eq-body">${K(T.areaNum(p), true)}</div></div>`;
    html += `<p>Con ${K(`g = 981\\ \\text{cm/s}^2`)} y un coeficiente de descarga ${K(`C_d = ${tn(Cd, 3, true)}`)}, la ecuación (${eqn.tor}) predice un tiempo teórico de vaciado de ${minsec(theory.tEmpty)} y un caudal inicial de ${fmt(theory.Q(h0), 2)} cm³/s.</p>`;

    // IV. Toma de datos
    html += `<h2>IV. Toma de datos</h2>`;
    html += `<p>${srcText} Los datos quedaron consignados en la Tabla 1 (paso de tiempo: ${dtTxt}).</p>`;
    const t1 = thin(R.tRaw.map((t, i) => [fmtT(t, 4), fmtT(R.h[i], 4)]));
    html += table(['t (min)', 'h (cm)'], t1.rows, 'Tabla 1. Toma de datos h = f(t).' + t1.note, 'narrow');

    // V. Regresión lineal
    html += `<h2>V. Regresión lineal</h2>`;
    html += `<p>Se toma inicialmente el método de los mínimos cuadrados como instrumento estadístico. Al aplicar regresión lineal a los datos de la Tabla 1 se llega a lo expuesto en la Figura 2, que permite una expresión del tipo ${K('h=f(t)')}:</p>`;
    eqn.lin = E(); html += eq(TeX.linReg(R.lin), eqn.lin);
    html += `<p>con un coeficiente de determinación ${K(`R^2 = ${tn(R.lin.r2, 4)}`)}, ${R.lin.r2 > 0.95 ? 'el cual es alto, pero que puede ser mejorado' : 'que indica que la relación no es lineal y puede ser mejorada'}: la recta supone una velocidad de descenso constante (${fmt(-R.lin.a, 4)} cm/min) y predice el vaciado en ${K(`t = -b/a = ${tn(linTv, 2)}`)} min, mientras que el fenómeno real desacelera a medida que disminuye la carga hidráulica.</p>`;
    html += fig(F.linear, 'Figura 2. Análisis de altura vs. tiempo. Regresión lineal.');

    // VI. Diferenciación numérica
    html += `<h2>VI. Diferenciación numérica</h2>`;
    html += `<p>Para llevar a cabo la diferenciación se utiliza el método numérico de tres puntos con diferencias centradas propuesto en [1], en el que la derivada se obtiene a partir de la expansión en serie de Taylor, aproximándola por diferencias divididas finitas:</p>`;
    eqn.cd = E(); html += eq('f\'(t_i) \\approx \\dfrac{f(t_{i+1}) - f(t_{i-1})}{t_{i+1} - t_{i-1}} = \\dfrac{f(t+\\Delta t) - f(t-\\Delta t)}{2\\,\\Delta t}', eqn.cd);
    html += `<p>donde ${K('\\Delta t')} es el tamaño de paso de la variable independiente, en este caso el tiempo${R.uniform ? `; como se observa en la Tabla 1, ${K(`\\Delta t = ${tn(R.steps[0], 4, true)}\\ \\text{min}`)}, por lo que el denominador es ${K(`2\\Delta t = ${tn(2 * R.steps[0], 4, true)}`)}` : '; como el paso no es constante se usa la forma general con ' + K('t_{i+1}-t_{i-1}')}. A partir de los datos de la Tabla 1 se construye la Tabla 2. Por ejemplo, para ${K(`t = ${tn(R.t[1], 3, true)}`)}: ${K(`\\dfrac{dh}{dt} \\approx \\dfrac{${tn(R.h[2], 3, true)} - ${tn(R.h[0], 3, true)}}{${tn(R.t[2] - R.t[0], 3, true)}} = ${tn(R.deriv[1], 3)}\\ \\text{cm/min}`)}.</p>`;
    const t2 = thin(R.tRaw.map((t, i) => [fmtT(t, 4), fmtT(R.h[i], 4), R.deriv[i] === null ? '' : fmtT(R.deriv[i], 4)]));
    html += table(['t (min)', 'h (cm)', 'dh/dt = Δh/(2Δt)'], t2.rows, 'Tabla 2. Cálculo de la derivada h = f(t).' + t2.note, 'narrow');
    html += `<p>En la Tabla 2 la primera y la última fila no presentan cálculo de derivada por la forma de (${eqn.cd}). Se extrae entonces la Tabla 3, tomando valores positivos de ${K('dh/dt')} (es decir, ${K('-dh/dt')}), con la que se realizan los diferentes tipos de regresión.${R.excluded ? ` Para las regresiones exponencial y potencial se excluyeron ${R.excluded} punto(s) con valores no positivos, pues requieren logaritmos.` : ''}</p>`;
    const t3 = thin(R.pairs.map(q => [fmtT(q.h, 4), fmtT(q.y, 4)]));
    html += table(['h (cm)', '−dh/dt (cm/min)'], t3.rows, 'Tabla 3. Cálculo de la derivada para h′ = f(h).' + t3.note, 'narrow');
    html += `<p>Al hacer el ajuste de curva por mínimos cuadrados, aplicando regresión lineal, exponencial y potencial [2] a los datos de la Tabla 3 (las dos últimas mediante linealización logarítmica, ${K('\\ln y = \\ln A + Bh')} y ${K('\\ln y = \\ln A + n\\ln h')}), se obtienen los resultados de las Figuras 3, 4 y 5, que originan las respectivas ecuaciones diferenciales.</p>`;
    html += fig(F.dLin, `Figura 3: Regresión lineal. Análisis de la derivada numérica (R² = ${fmt(ml.fitR2, 4)}).`);
    html += fig(F.dExp, `Figura 4: Regresión exponencial. Análisis de la derivada numérica (R² = ${fmt(me.fitR2, 4)}).`);
    html += fig(F.dPow, `Figura 5: Regresión potencial. Análisis de la derivada numérica (R² = ${fmt(mp.fitR2, 4)}).`);
    html += `<p>En el Cuadro 4 se resumen los resultados obtenidos en las Figuras 3, 4 y 5.</p>`;
    html += table(['Regresión', 'Ecuación diferencial', 'R²'], R.models.map(m => [m.nombre, K(TeX.ode(m)), fmt(m.fitR2, 5)]), 'Cuadro 4. Ecuaciones diferenciales obtenidas por regresión, h′ = f(h).', 'wide-ok');
    html += `<p>El signo menos que aparece en el Cuadro 4 corresponde al signo que se omitió en la Tabla 3. Cada ecuación es de variables separables; al integrar con la condición inicial ${K(`h(0) = h_0 = ${tn(h0, 3, true)}`)}, tomada de la Tabla 1, se obtienen las soluciones generales:</p>`;
    ['lineal', 'exponencial', 'potencial'].forEach(k => { eqn[k] = E(); html += eq(`${TeX.odeSym[k]}\\;\\Rightarrow\\;${TeX.solSym[k]}`, eqn[k]); });
    html += `<p>Al sustituir los coeficientes se obtienen los modelos del Cuadro 5.</p>`;
    html += table(['Regresión', 'Expresión matemática h = f(t)', 'R²'], R.models.map(m => [m.nombre, K(TeX.sol(m)), fmt(m.R2, 6)]), 'Cuadro 5. Diferentes modelos matemáticos para el vaciado del tanque (R² = 1 − SSE/SST frente a los datos reales).', 'span-all');

    // VII. Análisis de resultados
    html += `<h2>VII. Análisis de resultados</h2>`;
    html += `<p>El análisis del Cuadro 5 permite evidenciar que se mejoró la expresión (${eqn.lin}) planteada inicialmente. Los modelos obtenidos se evaluaron en cada uno de los tiempos para generar el Cuadro 6, junto con la comparación con los datos reales. El coeficiente de determinación se calculó como</p>`;
    eqn.r2 = E(); html += eq('R^2 = 1 - \\dfrac{\\sum_i \\left(h_i - \\hat h_i\\right)^2}{\\sum_i \\left(h_i - \\bar h\\right)^2}', eqn.r2);
    const c6h = ['t (min)', 'h (cm) real', 'h aprox. lineal', 'h aprox. exponencial', 'h aprox. potencial'];
    if (fitModel) c6h.push('h Torricelli');
    const c6all = R.t.map((t, i) => {
      const row = [fmtT(R.tRaw[i], 4), fmtT(R.h[i], 4), fmt(ml.pred[i], 5), fmt(me.pred[i], 5), fmt(mp.pred[i], 5)];
      if (fitModel) row.push(fmt(fitModel.hOf(t), 5));
      return row;
    });
    const r2row = ['', '<b>R²</b>', ...[ml, me, mp].map(m => `<b>${fmt(m.R2, 6)}</b>`)];
    const r2crow = ['', '<b>r²</b>', ...[ml, me, mp].map(m => fmt(m.r2c, 6))];
    const rmrow = ['', '<b>RMSE (cm)</b>', ...[ml, me, mp].map(m => fmt(m.rmse, 4))];
    if (fitModel) { r2row.push(`<b>${fmt(ctx.fitR2, 6)}</b>`); r2crow.push(fmt(ctx.fitR2c, 6)); rmrow.push(fmt(ctx.fitRmse, 4)); }
    const c6t = thin(c6all, 40); const c6 = c6t.rows;
    c6.push(r2row, r2crow, rmrow);
    html += table(c6h, c6, `Cuadro 6. Análisis de resultados. r²: cuadrado del coeficiente de correlación entre datos y modelo.${R.models.some(m => m.nValid < R.n) ? ' “—”: el modelo no tiene valor real (el tanque ya se vació).' : ''}${c6t.note}`, 'span-all c6');
    html += `<p>El mejor modelo lo representa la regresión ${best.nombre.toLowerCase()} de la ecuación diferencial, con ${K(`R^2 = ${tn(best.R2, 6)}`)} y un error cuadrático medio de ${fmt(best.rmse, 3)} cm. En orden, los modelos obtuvieron: ${exps}. Los tiempos de vaciado que predicen (${K('h = 0')}) son ${fmt(ml.tEmpty, 2)} min (lineal), ${fmt(me.tEmpty, 2)} min (exponencial) y ${fmt(mp.tEmpty, 2)} min (potencial).</p>`;
    html += fig(F.compare, 'Figura 6. Comparación de los modelos con los datos reales.', 'span-all-fig');
    html += `<p>Al contrastar con la teoría, el modelo de Torricelli (${eqn.tor}) se ajustó a los datos variando únicamente el coeficiente de descarga, con lo que se obtuvo ${K(`C_d = ${tn(CdFit, 3)}`)} (${K(`R^2 = ${tn(ctx.fitR2, 5)}`)}), ${CdFit > 0.55 && CdFit < 0.7 ? 'valor coherente con el rango típico de 0,6–0,65 para orificios de pared delgada' : CdFit >= 1 ? 'valor mayor que 1, lo que sugiere que las dimensiones del orificio o del tanque declaradas difieren de las reales' : 'valor que difiere del rango típico de 0,6–0,65 para orificios de pared delgada, posiblemente por la geometría real del orificio (boquilla, llave o válvula)'}. Además, el exponente del modelo potencial, ${K(`n = ${tn(mp.coef.n, 4)}`)}, puede compararse con el valor ${K('n = 0{,}5')} que predice Torricelli para tanques de sección constante; para la geometría estudiada el exponente efectivo teórico en el mismo intervalo de alturas es ${K(`n_{\\text{teórico}} \\approx ${tn(nEff, 4)}`)}, ${T.constArea ? '' : 'distinto de 0,5 porque el área de la superficie libre cambia con la altura'}.</p>`;

    // VIII. Conclusiones
    html += `<h2>VIII. Conclusiones</h2><ul class="concl">`;
    html += `<li>La regresión lineal directa (${K(`R^2 = ${tn(R.lin.r2, 4)}`)}) describe la tendencia general, pero supone una velocidad de descenso constante y no reproduce la desaceleración del vaciado.</li>`;
    html += `<li>La diferenciación numérica por diferencias centradas permitió transformar los datos en relaciones ${K('dh/dt = f(h)')} y plantear tres ecuaciones diferenciales de variables separables, cuyas soluciones mejoran el ajuste respecto a la recta inicial.</li>`;
    html += `<li>El modelo ${best.nombre.toLowerCase()}, ${K(TeX.sol(best))}, fue el de mejor desempeño (${K(`R^2 = ${tn(best.R2, 6)}`)}) y estima un tiempo de vaciado de ${minsec(best.tEmpty)}.</li>`;
    html += `<li>El modelo de Torricelli con ${K(`C_d = ${tn(Cd, 3, true)}`)} predice ${minsec(theory.tEmpty)}; ajustado a los datos, el coeficiente de descarga efectivo es ${fmt(CdFit, 3)}, lo que vincula el modelo empírico con la física del fenómeno.</li>`;
    html += `</ul>`;

    html += `<h2 class="unnum">Recomendaciones</h2>`;
    html += `<p>Se recomienda realizar la práctica con recipientes de geometría distinta y con otros tipos de líquidos, reducir el paso de tiempo cerca del final del vaciado (donde la derivada numérica pierde precisión), repetir el ensayo para estimar la incertidumbre de las lecturas y analizar el llenado como proceso inverso.</p>`;

    html += `<h2 class="unnum">Referencias</h2><ol class="refs">`;
    html += `<li>S. C. Chapra, R. P. Canale, <i>Métodos numéricos para ingenieros</i>, McGraw-Hill, 3.ª ed., México D.F., 2000.</li>`;
    html += `<li>R. E. Walpole, R. H. Myers, S. L. Myers, <i>Probabilidad y estadística para ingenieros</i>, Pearson Educación, 6.ª ed., México D.F., p. 362, 1998.</li>`;
    html += `<li>D. G. Zill, <i>Ecuaciones diferenciales con problemas de valores en la frontera</i>, Thomson Learning, 5.ª ed., México D.F., p. 16, 2002.</li>`;
    html += `<li>L. F. Plaza Gálvez, “Modelo matemático para vaciado de tanques”, <i>Scientia et Technica</i>, vol. 22, n.º 1, pp. 89–94, 2017.</li>`;
    html += `<li>F. M. White, <i>Mecánica de fluidos</i>, McGraw-Hill, 6.ª ed., Madrid, 2008.</li>`;
    html += `</ol></div></article>`;
    return html;
  }

  global.Article = { build, figures, K, TeX };
})(window);
