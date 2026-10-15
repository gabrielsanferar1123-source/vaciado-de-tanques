/* Gráfica SVG interactiva: tooltip, cursor, zoom (arrastrar), doble clic para
   restablecer, leyenda que activa/desactiva series y marcador del tiempo actual. */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  function ticks(min, max, count = 6) {
    if (!(max > min)) { min -= 1; max += 1; }
    const span = max - min;
    let step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = count / span * step;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(12));
    return { out, step };
  }
  const tickFmt = (v, step) => Num.fmtT(v, step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)));

  class IChart {
    /* opts: { title, xLabel, yLabel, unitX, unitY, onSeek(x), digits() } */
    constructor(host, opts) {
      this.host = host; this.o = opts;
      this.series = []; this.hidden = new Set(); this.zoom = null; this.cursorX = null;
      host.classList.add('ichart');
      host.innerHTML = `<div class="ic-head"><h4>${opts.title}</h4><div class="ic-legend"></div><button class="ic-reset" hidden title="Restablecer zoom">Restablecer zoom</button></div><div class="ic-plot"></div><div class="ic-tip" hidden></div>`;
      this.legend = host.querySelector('.ic-legend');
      this.plot = host.querySelector('.ic-plot');
      this.tip = host.querySelector('.ic-tip');
      this.resetBtn = host.querySelector('.ic-reset');
      this.resetBtn.addEventListener('click', () => { this.zoom = null; this.draw(); });
      new ResizeObserver(() => { if (this.plot.clientWidth !== this.lastW) this.draw(); }).observe(this.plot);
    }
    setData(series) { this.series = series; this.draw(); }

    domain() {
      const vis = this.series.filter(s => !this.hidden.has(s.name));
      const pts = vis.flatMap(s => s.pts).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
      if (this.zoom) [x0, x1] = this.zoom;
      const inX = pts.filter(p => p[0] >= x0 - 1e-12 && p[0] <= x1 + 1e-12);
      let y0 = Math.min(0, ...inX.map(p => p[1])), y1 = Math.max(...inX.map(p => p[1]));
      if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; }
      if (!Number.isFinite(y1) || y1 <= y0) y1 = y0 + 1;
      y1 += (y1 - y0) * 0.05;
      return { x0, x1, y0, y1 };
    }

    draw() {
      const W = Math.max(280, this.plot.clientWidth || 520), H = Math.round(Math.min(300, Math.max(220, W * 0.55)));
      this.lastW = this.plot.clientWidth;
      const m = { l: 58, r: 14, t: 10, b: 40 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const D = this.domain();
      const xt = ticks(D.x0, D.x1), yt = ticks(D.y0, D.y1, 5);
      const X = x => m.l + (x - D.x0) / (D.x1 - D.x0) * pw;
      const Y = y => m.t + ph - (y - D.y0) / (D.y1 - D.y0) * ph;
      this.geom = { m, pw, ph, X, Y, D, W, H };
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ic-svg' });
      const id = 'icc' + Math.random().toString(36).slice(2, 8);
      const defs = el('defs', {}, svg); const cp = el('clipPath', { id }, defs); el('rect', { x: m.l, y: m.t, width: pw, height: ph }, cp);
      el('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'ic-bg' }, svg);
      xt.out.filter(v => v >= D.x0 && v <= D.x1).forEach(v => {
        el('line', { x1: X(v), x2: X(v), y1: m.t, y2: m.t + ph, class: 'ic-grid' }, svg);
        el('text', { x: X(v), y: m.t + ph + 16, 'text-anchor': 'middle', class: 'ic-tick' }, svg).textContent = tickFmt(v, xt.step);
      });
      yt.out.filter(v => v >= D.y0 && v <= D.y1).forEach(v => {
        el('line', { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: Math.abs(v) < 1e-12 ? 'ic-zero' : 'ic-grid' }, svg);
        el('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'ic-tick' }, svg).textContent = tickFmt(v, yt.step);
      });
      el('text', { x: m.l + pw / 2, y: H - 4, 'text-anchor': 'middle', class: 'ic-axis' }, svg).textContent = `${this.o.xLabel} (${this.o.unitX})`;
      el('text', { transform: `translate(13 ${m.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle', class: 'ic-axis' }, svg).textContent = `${this.o.yLabel} (${this.o.unitY()})`;
      const g = el('g', { 'clip-path': `url(#${id})` }, svg);
      this.series.forEach(s => {
        if (this.hidden.has(s.name)) return;
        if (s.kind === 'points') {
          s.pts.forEach(p => { if (Number.isFinite(p[1])) el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.4, fill: 'var(--card)', stroke: s.color, 'stroke-width': 1.7 }, g); });
        } else {
          let d = '', pen = false;
          s.pts.forEach(p => { if (!Number.isFinite(p[1])) { pen = false; return; } d += (pen ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); pen = true; });
          el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round' }, g);
        }
      });
      // cursor del tiempo actual
      this.cur = el('g', { class: 'ic-cur' }, svg);
      this.curLine = el('line', { y1: m.t, y2: m.t + ph }, this.cur);
      this.curDot = el('circle', { r: 4.5 }, this.cur);
      // capa de interacción
      this.hover = el('line', { y1: m.t, y2: m.t + ph, class: 'ic-hover', visibility: 'hidden' }, svg);
      this.sel = el('rect', { y: m.t, height: ph, class: 'ic-sel', visibility: 'hidden' }, svg);
      const ov = el('rect', { x: m.l, y: m.t, width: pw, height: ph, class: 'ic-ov' }, svg);
      this.bind(ov);
      this.plot.replaceChildren(svg);
      this.svg = svg;
      // leyenda
      this.legend.innerHTML = this.series.filter(s => s.label !== false).map(s =>
        `<button class="ic-key${this.hidden.has(s.name) ? ' off' : ''}" data-s="${s.name}"><i style="${s.kind === 'points' ? `border:2px solid ${s.color};border-radius:50%;width:9px;height:9px` : `background:${s.color};${s.dash ? 'opacity:.7' : ''}`}"></i>${s.name}</button>`).join('');
      this.legend.querySelectorAll('.ic-key').forEach(b => b.addEventListener('click', () => {
        const n = b.dataset.s; this.hidden.has(n) ? this.hidden.delete(n) : this.hidden.add(n); this.draw();
      }));
      this.resetBtn.hidden = !this.zoom;
      this.setCursor(this.cursorX);
    }

    valueAt(s, x) {
      const P = s.pts;
      if (!P.length) return NaN;
      if (s.kind === 'points') {
        let best = null, bd = Infinity;
        P.forEach(p => { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = p; } });
        const { D, pw } = this.geom;
        return bd / (D.x1 - D.x0) * pw < 10 ? best : null;
      }
      let lo = 0, hi = P.length - 1;
      if (x <= P[0][0]) return P[0];
      if (x >= P[hi][0]) return P[hi];
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid][0] <= x) lo = mid; else hi = mid; }
      const a = P[lo], b = P[hi], f = (x - a[0]) / (b[0] - a[0]);
      return [x, a[1] + (b[1] - a[1]) * f];
    }

    setCursor(x) {
      this.cursorX = x;
      if (!this.cur || !this.geom) return;
      const { X, Y, D } = this.geom;
      const main = this.series.find(s => s.main && !this.hidden.has(s.name));
      if (x === null || x === undefined || x < D.x0 || x > D.x1 || !main) { this.cur.setAttribute('visibility', 'hidden'); return; }
      this.cur.setAttribute('visibility', 'visible');
      this.curLine.setAttribute('x1', X(x)); this.curLine.setAttribute('x2', X(x));
      const v = this.valueAt(main, x);
      if (v && Number.isFinite(v[1])) { this.curDot.setAttribute('cx', X(x)); this.curDot.setAttribute('cy', Y(v[1])); this.curDot.setAttribute('fill', main.color); }
    }

    bind(ov) {
      const toX = e => {
        const r = this.svg.getBoundingClientRect();
        const px = (e.clientX - r.left) * (this.geom.W / r.width);
        const { m, pw, D } = this.geom;
        return { px, x: D.x0 + (px - m.l) / pw * (D.x1 - D.x0) };
      };
      let drag = null;
      ov.addEventListener('pointerdown', e => { drag = toX(e); ov.setPointerCapture(e.pointerId); });
      ov.addEventListener('pointermove', e => {
        const { px, x } = toX(e);
        this.hover.setAttribute('x1', px); this.hover.setAttribute('x2', px); this.hover.setAttribute('visibility', 'visible');
        if (drag && Math.abs(px - drag.px) > 4) {
          this.sel.setAttribute('x', Math.min(px, drag.px)); this.sel.setAttribute('width', Math.abs(px - drag.px)); this.sel.setAttribute('visibility', 'visible');
        }
        const dg = this.o.digits();
        const rows = this.series.filter(s => !this.hidden.has(s.name)).map(s => {
          const v = this.valueAt(s, x);
          return v && Number.isFinite(v[1]) ? `<div><i style="background:${s.color}"></i>${s.name}: <b>${Num.fmt(v[1], dg)}</b> ${this.o.unitY()}</div>` : '';
        }).join('');
        this.tip.innerHTML = `<div class="ic-tip-x">${this.o.xLabel} = ${Num.fmt(x, dg)} ${this.o.unitX}</div>${rows}`;
        this.tip.hidden = false;
        const host = this.host.getBoundingClientRect(), r = this.svg.getBoundingClientRect();
        const left = e.clientX - host.left + 14;
        this.tip.style.left = Math.min(left, host.width - this.tip.offsetWidth - 6) + 'px';
        this.tip.style.top = (r.top - host.top + 16) + 'px';
      });
      ov.addEventListener('pointerleave', () => { this.hover.setAttribute('visibility', 'hidden'); this.tip.hidden = true; });
      ov.addEventListener('pointerup', e => {
        const end = toX(e);
        this.sel.setAttribute('visibility', 'hidden');
        if (drag && Math.abs(end.px - drag.px) > 10) { this.zoom = [Math.min(drag.x, end.x), Math.max(drag.x, end.x)]; this.draw(); }
        else if (drag && this.o.onSeek) this.o.onSeek(end.x);
        drag = null;
      });
      ov.addEventListener('dblclick', () => { this.zoom = null; this.draw(); });
    }
  }
  global.IChart = IChart;
})(window);
