// A small canvas candle chart with grid lines, a draggable range, fill markers and crabs on the lines.
(function () {
  const C = { bg: '#0e0f13', grid: '#1d1f26', axis: '#6d7280', text: '#9aa0ac', up: '#3ddc84', dn: '#ec3a40', buy: '#3ddc84', sell: '#ec3a40', band: 'rgba(255,255,255,0.035)', white: '#f2f3f6' };
  const crabL = new Image(); crabL.src = '/assets/img/crab-sl.png';
  const crabR = new Image(); crabR.src = '/assets/img/crab-sr.png';
  class Chart {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.o = { drag: true, crabs: true, axis: true, ...opts };
      this.candles = []; this.lo = null; this.hi = null; this.levels = []; this.price = null; this.fills = []; this.upto = null; this.hover = null; this.dragging = null;
      this.pad = { l: 10, r: this.o.axis ? 74 : 10, t: 14, b: this.o.axis ? 26 : 10 };
      this.onRange = null;
      new ResizeObserver(() => this.resize()).observe(canvas);
      if (this.o.drag) this.bind();
      this.resize();
    }
    resize() {
      const r = this.cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(10, r.width); this.h = Math.max(10, r.height);
      this.cv.width = Math.round(this.w * d); this.cv.height = Math.round(this.h * d);
      this.g.setTransform(d, 0, 0, d, 0, 0); this.draw();
    }
    set(data) { Object.assign(this, data); this.draw(); }
    range() {
      let min = Infinity, max = -Infinity;
      for (const c of this.candles) { if (c[3] < min) min = c[3]; if (c[2] > max) max = c[2]; }
      if (this.lo) min = Math.min(min, this.lo); if (this.hi) max = Math.max(max, this.hi);
      const pad = (max - min) * 0.08 || max * 0.02; return [min - pad, max + pad];
    }
    y(p) { const [a, b] = this.yr; return this.pad.t + (1 - (p - a) / (b - a)) * (this.h - this.pad.t - this.pad.b); }
    py(y) { const [a, b] = this.yr; return a + (1 - (y - this.pad.t) / (this.h - this.pad.t - this.pad.b)) * (b - a); }
    x(i) { const n = this.candles.length, w = this.w - this.pad.l - this.pad.r; return this.pad.l + (i + 0.5) * (w / n); }
    fmt(p) { return p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(p >= 100 ? 2 : 3) : p.toPrecision(3); }
    draw() {
      const g = this.g, W = this.w, H = this.h; if (!g) return;
      g.clearRect(0, 0, W, H);
      if (!this.candles.length) { g.fillStyle = C.text; g.font = '600 13px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(this.msg || 'Loading prices…', W / 2, H / 2); return; }
      this.yr = this.range();
      const n = this.candles.length, cw = (W - this.pad.l - this.pad.r) / n;
      // horizontal price grid
      g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.axis; g.font = '500 11px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'left';
      const steps = 6, [a, b] = this.yr;
      for (let k = 0; k <= steps; k++) { const p = a + (b - a) * k / steps, y = Math.round(this.y(p)) + .5; g.beginPath(); g.moveTo(this.pad.l, y); g.lineTo(W - this.pad.r, y); g.stroke(); if (this.o.axis) g.fillText(this.fmt(p), W - this.pad.r + 8, y + 4); }
      // time labels
      if (this.o.axis) {
        g.textAlign = 'center'; const every = Math.max(1, Math.round(n / 6));
        for (let i = 0; i < n; i += every) { const t = new Date(this.candles[i][0]); const s = (this.span || 0) >= 86400000 * 3 ? `${t.getMonth() + 1}/${t.getDate()}` : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; g.fillText(s, this.x(i), H - 8); }
      }
      // the range band and the grid lines
      if (this.lo && this.hi) {
        const y1 = this.y(this.hi), y0 = this.y(this.lo);
        g.fillStyle = C.band; g.fillRect(this.pad.l, y1, W - this.pad.l - this.pad.r, y0 - y1);
        this.levels.forEach((p, i) => {
          const y = Math.round(this.y(p)) + .5, above = this.price != null && p > this.price;
          g.strokeStyle = i === this.skip ? 'rgba(255,255,255,.18)' : above ? 'rgba(236,58,64,.55)' : 'rgba(61,220,132,.55)';
          g.setLineDash([5, 5]); g.beginPath(); g.moveTo(this.pad.l, y); g.lineTo(W - this.pad.r, y); g.stroke(); g.setLineDash([]);
        });
        // crabs working the lines: one small crab per resting order, at the right end
        if (this.o.crabs && this.levels.length <= 60) {
          const s = Math.max(10, Math.min(26, (y0 - y1) / (this.levels.length) * 0.95));
          this.levels.forEach((p, i) => {
            if (i === this.skip) return; const img = (i % 2) ? crabL : crabR; if (!img.complete) return;
            const y = this.y(p), wv = s * img.width / img.height;
            g.drawImage(img, W - this.pad.r - wv - 6 - (i % 3) * 8, y - s + 2, wv, s);
          });
        }
        // handles
        for (const [p, k] of [[this.hi, 'hi'], [this.lo, 'lo']]) {
          const y = Math.round(this.y(p)) + .5;
          g.strokeStyle = C.white; g.lineWidth = 1.5; g.beginPath(); g.moveTo(this.pad.l, y); g.lineTo(W - this.pad.r, y); g.stroke(); g.lineWidth = 1;
          if (this.o.axis) { g.fillStyle = C.white; g.fillRect(W - this.pad.r + 2, y - 10, this.pad.r - 4, 20); g.fillStyle = '#0e0f13'; g.textAlign = 'left'; g.font = '700 11px "JetBrains Mono", monospace'; g.fillText(this.fmt(p), W - this.pad.r + 8, y + 4); }
          if (this.o.drag) { g.fillStyle = C.white; g.beginPath(); g.roundRect(this.pad.l + 8, y - 8, 34, 16, 8); g.fill(); g.fillStyle = '#0e0f13'; g.font = '800 9px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(k === 'hi' ? 'TOP' : 'LOW', this.pad.l + 25, y + 3); }
        }
      }
      // candles
      const upto = this.upto == null ? n : this.upto;
      for (let i = 0; i < upto; i++) {
        const [t, o, h, l, c] = this.candles[i], x = this.x(i), up = c >= o;
        g.strokeStyle = g.fillStyle = up ? C.up : C.dn;
        g.beginPath(); g.moveTo(Math.round(x) + .5, this.y(h)); g.lineTo(Math.round(x) + .5, this.y(l)); g.stroke();
        const yo = this.y(o), yc = this.y(c), bw = Math.max(1, cw * 0.62);
        g.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
      }
      // fills
      const tmax = upto < n ? this.candles[Math.max(0, upto - 1)][0] : Infinity;
      if (this.fills && this.fills.length) {
        const idx = new Map(this.candles.map((c, i) => [c[0], i]));
        for (const f of this.fills) {
          if (f.t > tmax) continue; const i = idx.get(f.t); if (i == null) continue;
          const x = this.x(i), y = this.y(f.price), s = 5;
          g.fillStyle = f.side === 'buy' ? C.buy : C.sell; g.strokeStyle = '#0e0f13'; g.lineWidth = 2;
          g.beginPath(); if (f.side === 'buy') { g.moveTo(x, y - s); g.lineTo(x - s, y + s); g.lineTo(x + s, y + s); } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s); g.lineTo(x + s, y - s); }
          g.closePath(); g.stroke(); g.fill(); g.lineWidth = 1;
        }
      }
      // last price
      const last = this.candles[Math.max(0, upto - 1)][4], yl = Math.round(this.y(last)) + .5;
      g.strokeStyle = 'rgba(242,243,246,.35)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(this.pad.l, yl); g.lineTo(W - this.pad.r, yl); g.stroke(); g.setLineDash([]);
      if (this.o.axis) { g.fillStyle = '#2a2d36'; g.fillRect(W - this.pad.r + 2, yl - 10, this.pad.r - 4, 20); g.fillStyle = C.white; g.textAlign = 'left'; g.font = '700 11px "JetBrains Mono", monospace'; g.fillText(this.fmt(last), W - this.pad.r + 8, yl + 4); }
      // hover
      if (this.hover && this.o.axis) {
        const { x, y } = this.hover, i = Math.max(0, Math.min(n - 1, Math.floor((x - this.pad.l) / cw)));
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(this.x(i), this.pad.t); g.lineTo(this.x(i), H - this.pad.b); g.moveTo(this.pad.l, y); g.lineTo(W - this.pad.r, y); g.stroke();
        const c = this.candles[i], t = new Date(c[0]);
        const s = `${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}  O ${this.fmt(c[1])}  H ${this.fmt(c[2])}  L ${this.fmt(c[3])}  C ${this.fmt(c[4])}`;
        g.font = '500 11px "JetBrains Mono", monospace'; const tw = g.measureText(s).width + 16;
        g.fillStyle = 'rgba(14,15,19,.92)'; g.fillRect(this.pad.l + 6, this.pad.t, tw, 22); g.fillStyle = C.text; g.textAlign = 'left'; g.fillText(s, this.pad.l + 14, this.pad.t + 15);
      }
    }
    bind() {
      const cv = this.cv;
      const pos = e => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return { x: p.clientX - r.left, y: p.clientY - r.top }; };
      const near = y => { if (!this.lo || !this.hi || !this.yr) return null; const dh = Math.abs(y - this.y(this.hi)), dl = Math.abs(y - this.y(this.lo)); if (Math.min(dh, dl) > 14) return null; return dh < dl ? 'hi' : 'lo'; };
      const down = e => { const p = pos(e); const k = near(p.y); if (!k) return; this.dragging = k; e.preventDefault(); };
      const move = e => {
        const p = pos(e);
        if (this.dragging) {
          const v = this.py(p.y);
          if (this.dragging === 'hi') this.hi = Math.max(v, this.lo * 1.002); else this.lo = Math.max(1e-12, Math.min(v, this.hi / 1.002));
          this.onRange && this.onRange(this.lo, this.hi, true); e.preventDefault(); return;
        }
        if (!e.touches && e.target === cv) { this.hover = p; cv.style.cursor = near(p.y) ? 'ns-resize' : 'crosshair'; this.draw(); }
      };
      const up = () => { if (this.dragging) { this.dragging = null; this.onRange && this.onRange(this.lo, this.hi, false); } };
      cv.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      cv.addEventListener('touchstart', down, { passive: false }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', up);
      cv.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    }
  }
  window.GridChart = Chart;
})();
