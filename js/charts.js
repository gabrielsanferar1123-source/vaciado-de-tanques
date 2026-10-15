/* Gráficos SVG vectoriales (nítidos en pantalla y en el PDF) y dibujo del tanque. */
(function (global) {
  'use strict';
  let uid = 0;

  const COLORS = {
    datos: '#0f172a',
    lineal: '#dc2626',
    exponencial: '#d97706',
    potencial: '#2563eb',
    torricelli: '#059669',
    regresion: '#dc2626'
  };

  function niceTicks(min, max, count = 6) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    let step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = (count / span) * step;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    const ticks = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return { ticks, step };
  }
  const fmtTick = (v, step) => {
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
    return Num.fmtT(v, d);
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* opts: { width, height, xLabel, yLabel, series:[{kind:'points'|'line', pts:[[x,y]], color, label, dash, width}],
            xMin,xMax,yMin,yMax, legend:'tr'|'bl'|'tl'|'br'|false, fontSize } */
  function chart(opts) {
    const W = opts.width || 560, H = opts.height || 330, fs = opts.fontSize || 12;
    const m = { l: 54, r: 14, t: 14, b: 44 };
    const all = opts.series.flatMap(s => s.pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
    let xMin = opts.xMin ?? Math.min(...all.map(p => p[0]));
    let xMax = opts.xMax ?? Math.max(...all.map(p => p[0]));
    let yMin = opts.yMin ?? Math.min(0, ...all.map(p => p[1]));
    let yMax = opts.yMax ?? Math.max(...all.map(p => p[1]));
    const xt = niceTicks(xMin, xMax), yt = niceTicks(yMin, yMax);
    if (opts.xMin === undefined) xMin = Math.min(xMin, xt.ticks[0]);
    if (opts.xMax === undefined) xMax = Math.max(xMax, xt.ticks[xt.ticks.length - 1]);
    if (opts.yMin === undefined) yMin = Math.min(yMin, yt.ticks[0]);
    if (opts.yMax === undefined) yMax = Math.max(yMax, yt.ticks[yt.ticks.length - 1]);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const X = x => m.l + (x - xMin) / (xMax - xMin) * pw;
    const Y = y => m.t + ph - (y - yMin) / (yMax - yMin) * ph;
    const id = 'clip' + (++uid);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="inherit" font-size="${fs}" role="img">`;
    s += `<defs><clipPath id="${id}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="#fff" stroke="#cbd5e1"/>`;
    xt.ticks.filter(v => v >= xMin - 1e-9 && v <= xMax + 1e-9).forEach(v => {
      s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ph}" stroke="#e2e8f0"/>`;
      s += `<text x="${X(v)}" y="${m.t + ph + fs + 4}" text-anchor="middle" fill="#475569">${fmtTick(v, xt.step)}</text>`;
    });
    yt.ticks.filter(v => v >= yMin - 1e-9 && v <= yMax + 1e-9).forEach(v => {
      s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${Y(v)}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-12 ? '#94a3b8' : '#e2e8f0'}"/>`;
      s += `<text x="${m.l - 6}" y="${Y(v) + fs * 0.35}" text-anchor="end" fill="#475569">${fmtTick(v, yt.step)}</text>`;
    });
    s += `<text x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle" fill="#0f172a" font-weight="600">${esc(opts.xLabel || '')}</text>`;
    s += `<text transform="translate(${14},${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="#0f172a" font-weight="600">${esc(opts.yLabel || '')}</text>`;
    s += `<g clip-path="url(#${id})">`;
    opts.series.forEach(se => {
      if (se.kind === 'line') {
        let d = '', pen = false;
        se.pts.forEach(p => {
          if (!Number.isFinite(p[1]) || !Number.isFinite(p[0])) { pen = false; return; }
          d += (pen ? 'L' : 'M') + X(p[0]).toFixed(2) + ' ' + Y(p[1]).toFixed(2);
          pen = true;
        });
        s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      } else {
        se.pts.forEach(p => {
          if (Number.isFinite(p[0]) && Number.isFinite(p[1]))
            s += `<circle cx="${X(p[0]).toFixed(2)}" cy="${Y(p[1]).toFixed(2)}" r="${se.r || 3.2}" fill="${se.fill || '#fff'}" stroke="${se.color}" stroke-width="1.6"/>`;
        });
      }
    });
    s += '</g>';
    // leyenda
    const legItems = opts.series.filter(se => se.label);
    if (opts.legend !== false && legItems.length) {
      const lw = Math.max(...legItems.map(se => se.label.length)) * fs * 0.56 + 40;
      const lh = legItems.length * (fs + 6) + 8;
      const pos = opts.legend || 'tr';
      const lx = pos.includes('r') ? m.l + pw - lw - 8 : m.l + 8;
      const ly = pos.includes('t') ? m.t + 8 : m.t + ph - lh - 8;
      s += `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="6" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1"/>`;
      legItems.forEach((se, i) => {
        const yy = ly + 6 + i * (fs + 6) + fs / 2 + 1;
        if (se.kind === 'line') s += `<line x1="${lx + 8}" x2="${lx + 30}" y1="${yy}" y2="${yy}" stroke="${se.color}" stroke-width="${se.width || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
        else s += `<circle cx="${lx + 19}" cy="${yy}" r="3.2" fill="${se.fill || '#fff'}" stroke="${se.color}" stroke-width="1.6"/>`;
        s += `<text x="${lx + 36}" y="${yy + fs * 0.35}" fill="#0f172a">${esc(se.label)}</text>`;
      });
    }
    s += '</svg>';
    return s;
  }

  /* Muestra una función en n puntos */
  function sample(f, a, b, n = 160) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; pts.push([x, f(x)]); }
    return pts;
  }

  /* Dibujo del tanque (vista frontal) con nivel de líquido `level` (cm). */
  function tank(key, p, level, o = {}) {
    const T = Num.TANKS[key];
    const W = o.width || 280, Hpx = o.height || 300;
    const Ht = T.height(p);
    const N = 60;
    let maxHalf = 0;
    for (let i = 0; i <= N; i++) maxHalf = Math.max(maxHalf, T.half(Ht * i / N, p));
    const s = Math.min((W - 110) / (2 * maxHalf), (Hpx - 80) / Ht);
    const cx = W / 2 - 14, base = Hpx - 46;
    const P = (x, h) => [(cx + x * s).toFixed(2), (base - h * s).toFixed(2)];
    const closed = key === 'esfera' || key === 'horizontal';
    const left = [], right = [];
    for (let i = 0; i <= N; i++) { const h = Ht * i / N; const w = T.half(h, p); left.push(P(-w, h)); right.push(P(w, h)); }
    const outline = 'M' + left.slice().reverse().map(q => q.join(' ')).join('L') + 'L' + right.map(q => q.join(' ')).join('L') + (closed ? 'Z' : '');
    const lv = Math.max(0, Math.min(level, Ht));
    let water = '';
    if (lv > 0) {
      const wl = [], wr = [];
      for (let i = 0; i <= N; i++) { const h = lv * i / N; const w = T.half(h, p); wl.push(P(-w, h)); wr.push(P(w, h)); }
      water = 'M' + wl.slice().reverse().map(q => q.join(' ')).join('L') + 'L' + wr.map(q => q.join(' ')).join('L') + 'Z';
    }
    const gid = 'wg' + (++uid);
    let svg = `<svg class="tank-svg" viewBox="0 0 ${W} ${Hpx}" xmlns="http://www.w3.org/2000/svg" font-size="12" font-family="inherit">`;
    svg += `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>`;
    if (water) svg += `<path d="${water}" fill="url(#${gid})" opacity="0.85"/>`;
    if (lv > 0) { const w = T.half(lv, p); const a = P(-w, lv), b = P(w, lv); svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#93c5fd" stroke-width="2"/>`; }
    svg += `<path d="${outline}" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>`;
    // orificio y chorro en el fondo
    const ob = P(0, 0);
    svg += `<rect x="${+ob[0] - 5}" y="${+ob[1]}" width="10" height="14" fill="#334155" rx="1.5"/>`;
    if (o.flow && lv > 0.05) {
      const len = 18 + 14 * Math.sqrt(lv / Ht);
      svg += `<path d="M${ob[0]} ${+ob[1] + 14} q 2 ${len / 2} 0 ${len}" stroke="#3b82f6" stroke-width="${2 + 2 * Math.sqrt(lv / Ht)}" fill="none" stroke-linecap="round"/>`;
    }
    svg += `<text x="${+ob[0] + 10}" y="${+ob[1] + 12}" fill="#334155">A₀</text>`;
    if (o.labels !== false) {
      // cota de altura total
      const xr = cx + maxHalf * s + 22;
      const top = P(0, Ht)[1];
      svg += `<line x1="${xr}" x2="${xr}" y1="${top}" y2="${base}" stroke="#64748b" marker-start="" />`;
      svg += `<line x1="${xr - 5}" x2="${xr + 5}" y1="${top}" y2="${top}" stroke="#64748b"/><line x1="${xr - 5}" x2="${xr + 5}" y1="${base}" y2="${base}" stroke="#64748b"/>`;
      svg += `<text x="${xr + 7}" y="${(+top + base) / 2}" fill="#334155">${key === 'esfera' || key === 'horizontal' ? 'D' : 'H'}</text>`;
      // cota del nivel h
      if (lv > 0) {
        const xl = cx - maxHalf * s - 20, yl = P(0, lv)[1];
        svg += `<line x1="${xl}" x2="${xl}" y1="${yl}" y2="${base}" stroke="#2563eb"/>`;
        svg += `<line x1="${xl - 5}" x2="${xl + 5}" y1="${yl}" y2="${yl}" stroke="#2563eb"/><line x1="${xl - 5}" x2="${xl + 5}" y1="${base}" y2="${base}" stroke="#2563eb"/>`;
        svg += `<text x="${xl - 8}" y="${(+yl + base) / 2}" text-anchor="end" fill="#2563eb" font-style="italic">h</text>`;
        const w = T.half(lv, p);
        svg += `<text x="${cx}" y="${+yl - 6}" text-anchor="middle" fill="#1e3a8a">A<tspan font-size="9" dy="3">w</tspan></text>`;
        if (w < 0) svg += '';
      }
      if (o.caption) svg += `<text x="${W / 2}" y="${Hpx - 6}" text-anchor="middle" fill="#334155">${esc(o.caption)}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  global.Charts = { chart, sample, tank, COLORS };
})(window);
