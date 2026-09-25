// GRID home: live hero background, price tape, the grid replay, the molt ladder and the calculator.
(() => {
  const { $, $$, esc, fmt, api, market, icon, tickerChips } = I;
  const E = window.Engine;
  const SOL = 'So11111111111111111111111111111111111111112';
  const FEATURED = ['SOL', 'JUP', 'BONK', 'WIF', 'BTC', 'ETH'];
  let PAIRS = [];
  const pfmt = p => p == null ? '—' : p >= 1000 ? '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? '$' + p.toFixed(p >= 100 ? 2 : 3) : '$' + p.toPrecision(3);
  const pct = (n, d = 2) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%';
  const usd = n => n == null || isNaN(n) ? '—' : (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- reveal ----------
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' }) : null;
  const reveal = () => $$('.reveal:not(.shown)').forEach(e => io ? io.observe(e) : e.classList.add('shown'));
  reveal();

  // ---------- molt ladder ----------
  $('#moltRow').innerHTML = E.MOLTS.map((m, i) => `<div class="mk panel reveal${i === E.MOLTS.length - 1 ? ' king' : ''}" style="min-height:${300 + i * 22}px">
    <div class="img"><img src="/assets/img/crab-front.png" alt="" style="height:${56 + i * 18}px"></div>
    <span class="lv">MOLT ${i + 1}</span><h3>${esc(m.name)}</h3><span class="bag">${esc(m.bag)}</span><p>${esc(m.line)}</p>
    <div class="req"><span>${m.fills ? m.fills + ' fills' : 'Day one'}</span><span>${m.lines} lines</span></div></div>`).join('');
  reveal();

  // ---------- hero background: real price, drawn across tide lines ----------
  const bg = $('#bgc'), bgx = bg.getContext('2d');
  let bgData = null, bgT0 = performance.now();
  function bgSize() { const d = Math.min(2, devicePixelRatio || 1); bg.width = bg.clientWidth * d; bg.height = bg.clientHeight * d; bgx.setTransform(d, 0, 0, d, 0, 0); }
  bgSize(); addEventListener('resize', bgSize);
  function bgDraw(now) {
    const W = bg.clientWidth, H = bg.clientHeight; bgx.clearRect(0, 0, W, H);
    const top = H * 0.2, bot = H * 0.84, lines = 9;
    for (let k = 0; k < lines; k++) { const y = Math.round(top + (bot - top) * k / (lines - 1)) + .5; bgx.strokeStyle = 'rgba(255,255,255,0.045)'; bgx.setLineDash([6, 8]); bgx.beginPath(); bgx.moveTo(0, y); bgx.lineTo(W, y); bgx.stroke(); }
    bgx.setLineDash([]);
    if (bgData) {
      const c = bgData, n = c.length; let lo = Infinity, hi = -Infinity; for (const r of c) { lo = Math.min(lo, r[3]); hi = Math.max(hi, r[2]); }
      const Y = p => bot - (p - lo) / (hi - lo) * (bot - top), X = i => W * (i / (n - 1));
      const period = 26000, t = ((now - bgT0) % period) / period, upto = Math.max(2, Math.floor(t * n * 1.1));
      bgx.strokeStyle = 'rgba(242,243,246,0.22)'; bgx.lineWidth = 2; bgx.beginPath();
      for (let i = 0; i < Math.min(n, upto); i++) { const y = Y(c[i][4]); i ? bgx.lineTo(X(i), y) : bgx.moveTo(X(i), y); }
      bgx.stroke(); bgx.lineWidth = 1;
      // fills: where the close crossed a tide line
      for (let i = 1; i < Math.min(n, upto); i++) for (let k = 0; k < lines; k++) {
        const ly = top + (bot - top) * k / (lines - 1), a = Y(c[i - 1][4]), b = Y(c[i][4]);
        if ((a - ly) * (b - ly) < 0) { const age = Math.min(n, upto) - i; const al = Math.max(0.12, 0.7 - age * 0.012); bgx.fillStyle = b > a ? `rgba(61,220,132,${al})` : `rgba(236,58,64,${al})`; bgx.beginPath(); bgx.arc(X(i), ly, 3.5, 0, 7); bgx.fill(); }
      }
    }
    if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(bgDraw);
  }
  requestAnimationFrame(bgDraw);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(bgDraw); });
  api(`candles?mint=${SOL}&tf=15m`).then(j => { if (j.ok && j.candles.length > 20) { bgData = j.candles.slice(-192); $('#bgnote').textContent = `SOL · last ${Math.round((bgData.length * 15) / 60)}h, real prices`; } });

  // ---------- pairs, tape, links ----------
  market().then(m => {
    if (!m || !m.ok) { $('#tape').innerHTML = '<span class="chip">Live prices are unavailable right now.</span>'; return; }
    PAIRS = m.pairs.filter(p => p.price != null);
    const chips = tickerChips(PAIRS); $('#tape').innerHTML = chips + chips;
    const cfg = m.cfg || {}, links = [];
    if (cfg.ca) links.push(`<a class="btn red" href="https://pump.fun/coin/${encodeURIComponent(cfg.ca)}" target="_blank" rel="noopener">Buy ${esc(cfg.ticker)}</a>`, `<a class="btn" href="https://dexscreener.com/solana/${encodeURIComponent(cfg.ca)}" target="_blank" rel="noopener">Chart</a>`, `<button class="btn" id="copyca" type="button">CA ${esc(fmt.short(cfg.ca))}</button>`);
    if (cfg.x) { links.push(`<a class="btn" href="https://x.com/${encodeURIComponent(cfg.x)}" target="_blank" rel="noopener">X</a>`); $('#navx').innerHTML = `<a class="btn sm ghost" href="https://x.com/${encodeURIComponent(cfg.x)}" target="_blank" rel="noopener">@${esc(cfg.x)}</a>`; }
    $('#links2').innerHTML = links.join(''); const cc = $('#copyca'); if (cc) cc.onclick = () => I.copy(cfg.ca, 'CA copied');
    watchInit(); tryInit();
  });
  const featured = () => FEATURED.map(s => PAIRS.find(p => p.symbol === s)).filter(Boolean);
  const pairBtns = (el, sel, on) => { el.innerHTML = featured().map(p => `<button type="button" data-m="${p.mint}" class="${p.mint === sel ? 'on' : ''}">${icon(p)}${esc(p.symbol)}</button>`).join(''); el.onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('button', el).forEach(x => x.classList.toggle('on', x === b)); on(PAIRS.find(p => p.mint === b.dataset.m)); }; };

  // ---------- watch it work: a real backtest, replayed ----------
  const wc = new GridChart($('#wChart'), { drag: false, crabs: true, axis: true });
  let W = null, playing = true, raf = 0;
  function wStats(bt) {
    const cells = [['Round trips', bt.roundTrips ?? 0], ['Buys', bt.buys ?? 0], ['Sells', bt.sells ?? 0], ['Grid profit', `<span class="${bt.gridProfit > 0 ? 'up' : ''}">${usd(bt.gridProfit || 0)}</span>`], ['Grid total', `<span class="${(bt.pnlPct || 0) >= 0 ? 'up' : 'dn'}">${pct(bt.pnlPct)}</span>`], ['Just holding', `<span class="${(bt.hodlPct || 0) >= 0 ? 'up' : 'dn'}">${pct(bt.hodlPct)}</span>`]];
    $('#wStats').innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  async function wLoad(p) {
    clearTimeout(raf); wc.set({ candles: [], msg: 'Loading ' + p.symbol + ' prices…', levels: [], fills: [], lo: null, hi: null });
    const j = await api(`candles?mint=${p.mint}&tf=1h${p.under ? '&under=' + p.under : ''}`);
    if (!j.ok) { wc.set({ msg: j.msg || 'No prices right now.' }); return; }
    const c = j.candles, s = E.suggest(c), cfg = { lo: s.lo, hi: s.hi, n: 12, mode: 'arith', amount: 1000 };
    const pl = E.plan({ ...cfg, price: c[0][1] });
    W = { p, c, cfg, i: 24, t0: performance.now(), src: j.src };
    wc.set({ candles: c, lo: cfg.lo, hi: cfg.hi, levels: pl.levels, skip: pl.skip, price: c[0][1], fills: [], upto: W.i, span: c[c.length - 1][0] - c[0][0] });
    $('#wOpen').href = `/desk?m=${p.mint}&lo=${cfg.lo.toPrecision(6)}&hi=${cfg.hi.toPrecision(6)}&n=12&a=1000`;
    const days = Math.round((c[c.length - 1][0] - c[0][0]) / 864e5);
    $('#wNote').textContent = `${p.symbol}, last ${days} days of hourly prices from ${j.src === 'coinbase' ? 'Coinbase' : j.src === 'yahoo' ? 'Yahoo Finance' : 'GeckoTerminal'}. Grid: $1,000 over 12 lines in the range the price spent most of its time. Fills are simulated from the candles and include Jupiter's 0.1% fee.`;
    step();
  }
  function step() {
    if (!W) return;
    if (playing) {
      W.i = Math.min(W.c.length, W.i + 1);
      const bt = E.backtest(W.c.slice(0, W.i), W.cfg);
      wc.set({ upto: W.i, fills: bt.fills, price: W.c[W.i - 1][4] }); wStats(bt);
      if (W.i >= W.c.length) { setTimeout(() => { if (W) { W.i = 24; } }, 2600); }
    }
    raf = setTimeout(() => requestAnimationFrame(step), 55);
  }
  $('#wPlay').onclick = () => { playing = !playing; $('#wPlay').textContent = playing ? 'Pause' : 'Play'; };
  function watchInit() { const f = featured(); if (!f.length) return; pairBtns($('#wPairs'), f[0].mint, p => { clearTimeout(raf); wLoad(p); }); wLoad(f[0]); }

  // ---------- try a grid ----------
  let T = { p: null, mode: 'arith' };
  function tryInit() { const f = featured(); if (!f.length) return; T.p = f[0]; pairBtns($('#tPairs'), f[0].mint, p => { T.p = p; tCalc(); }); tCalc(); }
  function tCalc() {
    if (!T.p) return;
    const price = T.p.price, r = +$('#tRange').value / 100, n = +$('#tN').value, amt = parseFloat(String($('#tAmt').value).replace(/[^0-9.]/g, '')) || 0;
    $('#tNv').textContent = n; $('#tPct').textContent = '±' + Math.round(r * 100) + '%';
    const lo = price * (1 - r), hi = price * (1 + r);
    $('#tLo').textContent = pfmt(lo); $('#tHi').textContent = pfmt(hi);
    const pl = E.plan({ lo, hi, n, mode: T.mode, amount: amt, price });
    const molt = E.MOLTS.find(m => m.lines >= n) || E.MOLTS[E.MOLTS.length - 1];
    const cells = [
      ['Profit per round trip', pl.perGrid ? `${pct(pl.perGrid.min * 100, 2)}${Math.abs(pl.perGrid.max - pl.perGrid.min) > 1e-5 ? ' to ' + pct(pl.perGrid.max * 100, 2) : ''}` : '—'],
      ['Per round trip, in $', pl.perGridUsd ? usd(pl.perGridUsd.min) + (Math.abs(pl.perGridUsd.max - pl.perGridUsd.min) > 0.005 ? '–' + usd(pl.perGridUsd.max).slice(1) : '') : '—'],
      ['Buy orders', `${pl.buys.length} · ${usd(pl.usdNeeded)} USDC`],
      ['Sell orders', `${pl.sells.length} · ${fmt.amt(pl.tokenNeeded)} ${esc(T.p.symbol)}`],
      ['Each order', pl.q ? `${fmt.amt(pl.q)} ${esc(T.p.symbol)}` : '—'],
      ['Needs a', `${esc(molt.name)} (${molt.lines} lines)`],
    ];
    $('#tStats').innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    $('#tWarn').innerHTML = pl.warnings.map(w => `<div class="warn">${esc(w.msg)}</div>`).join('');
    const rows = pl.levels.map((p, i) => ({ p, i })).reverse();
    $('#tLadder').innerHTML = rows.map(({ p, i }) => { const side = i === pl.skip ? 'mid' : p < price ? 'buy' : 'sell'; return `<div class="lrow"><span class="sd ${side}">${side === 'mid' ? 'skip' : side}</span><span>${pfmt(p)}</span><em>${side === 'mid' ? 'nearest the price' : usd(pl.q * p)}</em></div>`; }).join('');
    $('#tGo').href = `/desk?m=${T.p.mint}&lo=${lo.toPrecision(6)}&hi=${hi.toPrecision(6)}&n=${n}&a=${amt}&mode=${T.mode}`;
  }
  ['tRange', 'tN', 'tAmt'].forEach(id => $('#' + id).addEventListener('input', tCalc));
  $('#tMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; T.mode = b.dataset.m; $$('#tMode button').forEach(x => x.classList.toggle('on', x === b)); tCalc(); };
})();
