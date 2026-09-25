// GRID desk: pick a token, draw the range, backtest it, and place it as Jupiter limit orders from your own wallet.
(() => {
  const { $, $$, esc, fmt, api, toast, store, icon, copy } = I;
  const E = window.Engine, WL = window.Wallet;
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', SOL = 'So11111111111111111111111111111111111111112';
  const qs = new URLSearchParams(location.search);
  const D = { pairs: [], pair: null, tf: '1h', candles: [], lo: null, hi: null, n: 6, mode: qs.get('mode') === 'geo' ? 'geo' : 'arith', amt: 200, plan: null, bt: null, bal: null, fills: 0, active: [], history: [], sub: 'active' };
  const pfmt = p => p == null || !isFinite(p) ? '—' : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(p >= 100 ? 2 : 4) : p.toPrecision(4);
  const usd = n => n == null || isNaN(n) ? '—' : (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n, d = 2) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%';
  const num = v => { const x = parseFloat(String(v).replace(/[^0-9.eE-]/g, '')); return isFinite(x) ? x : NaN; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let busy = false;

  // ---------------- the crab ----------------
  let crabName = store.get('crab.name'); if (!crabName) { crabName = 'Crab #' + (100 + Math.floor(Math.random() * 900)); store.set('crab.name', crabName); }
  $('#crabName').value = crabName;
  $('#crabName').addEventListener('change', e => { const v = e.target.value.trim().slice(0, 20) || crabName; e.target.value = v; store.set('crab.name', v); toast(`${v} likes the new name.`); });
  function molt() {
    const m = E.moltFor(D.fills);
    $('#crabStage').textContent = `${m.name.toUpperCase()} · ${m.bag.toUpperCase()}`;
    $('#crabXp').style.width = (m.progress * 100).toFixed(0) + '%';
    $('#crabNext').textContent = !WL.W.address ? 'Connect a wallet to start growing.' : m.next ? `${D.fills} filled order${D.fills === 1 ? '' : 's'}. Molts into a ${m.next.name} at ${m.next.fills}.` : `${D.fills} filled orders. Top of the pit.`;
    const cap = m.lines; const n = $('#n'); n.max = cap;
    if (D.n > cap) { D.n = cap; }
    n.value = D.n; $('#nv').textContent = D.n;
    $('#nCap').textContent = m.next ? `A ${m.name} works up to ${cap} lines. ${m.next.name}s get ${m.next.lines}.` : `A ${m.name} works up to ${cap} lines.`;
    return m;
  }

  // ---------------- chart ----------------
  const chart = new GridChart($('#chart'), { drag: true, crabs: true, axis: true });
  let rq = 0;
  chart.onRange = (lo, hi, dragging) => { D.lo = lo; D.hi = hi; $('#lo').value = pfmt(lo); $('#hi').value = pfmt(hi); cancelAnimationFrame(rq); rq = requestAnimationFrame(() => recalc(!dragging)); };

  // ---------------- pair picker ----------------
  const drop = $('#drop'), list = $('#list');
  $('#ppBtn').onclick = e => { e.stopPropagation(); drop.classList.toggle('on'); if (drop.classList.contains('on')) { $('#search').value = ''; renderList(); setTimeout(() => $('#search').focus(), 30); } };
  document.addEventListener('click', e => { if (!e.target.closest('.pp')) drop.classList.remove('on'); });
  const optRow = p => `<button class="opt${D.pair && p.mint === D.pair.mint ? ' on' : ''}" data-m="${p.mint}" type="button">${icon(p)}<span><b>${esc(p.symbol)}</b><small>${esc(p.name || '')}</small></span><span class="r">${p.price != null ? '$' + pfmt(p.price) : ''}<br><span class="${(p.change24h || 0) >= 0 ? 'up' : 'dn'}">${p.change24h != null ? pct(p.change24h) : ''}</span></span></button>`;
  let found = [];
  function renderList() {
    const q = $('#search').value.trim().toLowerCase();
    const match = p => !q || p.symbol.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || p.mint.toLowerCase() === q;
    const crypto = D.pairs.filter(p => p.kind === 'crypto' && match(p)), stocks = D.pairs.filter(p => p.kind === 'stock' && match(p));
    const extra = found.filter(t => !D.pairs.some(p => p.mint === t.mint));
    list.innerHTML = (crypto.length ? '<div class="dsec">Crypto</div>' + crypto.map(optRow).join('') : '') + (stocks.length ? '<div class="dsec">Tokenized stocks</div>' + stocks.map(optRow).join('') : '') + (extra.length ? '<div class="dsec">Any Solana token</div>' + extra.map(optRow).join('') : '') || '<div class="empty">No match. Paste the token\'s mint address.</div>';
  }
  let st = 0;
  $('#search').addEventListener('input', () => { renderList(); clearTimeout(st); const q = $('#search').value.trim(); if (q.length < 2) { found = []; return; } st = setTimeout(async () => { const j = await api('token?q=' + encodeURIComponent(q)); found = j.ok ? j.tokens : []; renderList(); }, 300); });
  list.onclick = e => { const b = e.target.closest('.opt'); if (!b) return; const p = D.pairs.find(x => x.mint === b.dataset.m) || found.find(x => x.mint === b.dataset.m); if (!p) return; drop.classList.remove('on'); selectPair(p, true); };

  function selectPair(p, reset) {
    D.pair = p; store.set('pair', p.mint);
    $('#ppBtn').innerHTML = `${icon(p)}<span>${esc(p.symbol)}</span><small>/ USDC</small><span aria-hidden="true">▾</span>`;
    $('#pxNow').textContent = p.price != null ? '$' + pfmt(p.price) : '—';
    $('#pxChg').innerHTML = p.change24h != null ? `<span class="${p.change24h >= 0 ? 'up' : 'dn'}">${pct(p.change24h)}</span>` : '';
    document.title = `GRID · ${p.symbol}`;
    if (reset) { D.lo = D.hi = null; }
    loadCandles();
    if (WL.W.address) loadBalances();
  }
  $('#tf').onclick = e => { const b = e.target.closest('button'); if (!b) return; D.tf = b.dataset.t; $$('#tf button').forEach(x => x.classList.toggle('on', x === b)); loadCandles(); };

  async function loadCandles() {
    const p = D.pair; chart.set({ candles: [], msg: `Loading ${p.symbol} prices…`, levels: [], fills: [], upto: null });
    const j = await api(`candles?mint=${p.mint}&tf=${D.tf}${p.under ? '&under=' + p.under : ''}`);
    if (D.pair !== p) return;
    if (!j.ok) { chart.set({ msg: j.msg || 'No price history for this token right now.' }); $('#srcNote').textContent = ''; D.candles = []; recalc(); return; }
    D.candles = j.candles;
    const last = D.candles[D.candles.length - 1][4];
    if (p.price == null) { p.price = last; $('#pxNow').textContent = '$' + pfmt(last); }
    $('#srcNote').textContent = `${D.tf} candles · ${j.src === 'coinbase' ? 'Coinbase' : j.src === 'yahoo' ? 'Yahoo Finance (' + (p.under || '') + ')' : 'GeckoTerminal'}`;
    const lo = D.lo, hi = D.hi, cur = price();
    if (!(lo > 0 && hi > lo) || cur < lo * 0.5 || cur > hi * 2) { const s = E.suggest(D.candles); D.lo = s.lo; D.hi = s.hi; }
    $('#lo').value = pfmt(D.lo); $('#hi').value = pfmt(D.hi);
    chart.set({ candles: D.candles, span: D.candles[D.candles.length - 1][0] - D.candles[0][0], upto: null });
    recalc(true);
  }
  const price = () => (D.pair && D.pair.price) || (D.candles.length ? D.candles[D.candles.length - 1][4] : null);

  // ---------------- build ----------------
  $('#lo').addEventListener('change', () => { const v = num($('#lo').value); if (v > 0 && v < D.hi) { D.lo = v; recalc(true); } else $('#lo').value = pfmt(D.lo); });
  $('#hi').addEventListener('change', () => { const v = num($('#hi').value); if (v > D.lo) { D.hi = v; recalc(true); } else $('#hi').value = pfmt(D.hi); });
  $('#quick').onclick = e => { const b = e.target.closest('button'); if (!b || !price()) return; if (b.dataset.q === 'fit') { const s = E.suggest(D.candles); if (s) { D.lo = s.lo; D.hi = s.hi; } } else { const r = +b.dataset.q / 100; D.lo = price() * (1 - r); D.hi = price() * (1 + r); } $('#lo').value = pfmt(D.lo); $('#hi').value = pfmt(D.hi); recalc(true); };
  $('#n').addEventListener('input', e => { D.n = +e.target.value; $('#nv').textContent = D.n; recalc(false); });
  $('#n').addEventListener('change', () => recalc(true));
  $('#mode').onclick = e => { const b = e.target.closest('button'); if (!b) return; D.mode = b.dataset.m; $$('#mode button').forEach(x => x.classList.toggle('on', x === b)); recalc(true); };
  $('#amt').addEventListener('input', () => { D.amt = num($('#amt').value) || 0; recalc(false); });
  $('#amt').addEventListener('change', () => recalc(true));

  function recalc(withTest) {
    const p = D.pair, P = price();
    if (!p || !P || !(D.lo > 0) || !(D.hi > D.lo)) { $('#sum').innerHTML = ''; $('#planBody').innerHTML = ''; return; }
    const pl = E.plan({ lo: D.lo, hi: D.hi, n: D.n, mode: D.mode, amount: D.amt, price: P });
    D.plan = pl;
    chart.set({ lo: D.lo, hi: D.hi, levels: pl.levels, skip: pl.skip, price: P });
    const cells = [
      ['Per round trip', pl.perGrid ? pct(pl.perGrid.min * 100) + (Math.abs(pl.perGrid.max - pl.perGrid.min) > 1e-5 ? ' – ' + pct(pl.perGrid.max * 100) : '') : '—'],
      ['In dollars', pl.perGridUsd ? usd(pl.perGridUsd.min) + (Math.abs(pl.perGridUsd.max - pl.perGridUsd.min) > 0.005 ? ' – ' + usd(pl.perGridUsd.max) : '') : '—'],
      ['Buys (USDC)', `${pl.buys.length} · ${usd(pl.usdNeeded)}`],
      [`Sells (${esc(p.symbol)})`, `${pl.sells.length} · ${fmt.amt(pl.tokenNeeded)}`],
      ['Each order', pl.q ? `${fmt.amt(pl.q)} ${esc(p.symbol)}` : '—'],
      ['Smallest order', pl.q ? `<span class="${pl.minOrderUsd < E.MIN_ORDER ? 'dn' : ''}">${usd(pl.minOrderUsd)}</span>` : '—'],
    ];
    $('#sum').innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    const warns = [...pl.warnings];
    if (D.bal) { const need = needs(); if (need.shortUsd > 0.01) warns.push({ k: 'bal', msg: `Your wallet is ${usd(need.shortUsd)} short for this grid. Lower the amount or top up.` }); else if (need.swap) warns.push({ k: 'swap', msg: need.swap.msg, ok: true }); }
    $('#warn').innerHTML = warns.map(w => `<div class="${w.ok ? 'okmsg' : 'warn'}">${esc(w.msg)}</div>`).join('');
    $('#planBody').innerHTML = pl.levels.map((lv, i) => ({ lv, i })).reverse().map(({ lv, i }) => {
      const side = i === pl.skip ? 'mid' : lv < P ? 'buy' : 'sell';
      return `<tr><td>${i + 1}</td><td><span class="sd ${side}">${side === 'mid' ? 'skip' : side}</span></td><td class="r">$${pfmt(lv)}</td><td class="r">${side === 'mid' ? '—' : fmt.amt(pl.q) + ' ' + esc(p.symbol)}</td><td class="r">${side === 'mid' ? 'nearest the price' : usd(pl.q * lv)}</td></tr>`;
    }).join('');
    deployBtn();
    if (withTest) backtest();
  }

  // ---------------- backtest ----------------
  function backtest() {
    if (!D.candles.length || !D.plan) { $('#bt').innerHTML = ''; return; }
    const bt = E.backtest(D.candles, { lo: D.lo, hi: D.hi, n: D.n, mode: D.mode, amount: D.amt || 100 });
    D.bt = bt; chart.set({ fills: bt.fills });
    const cells = [
      ['Round trips', bt.roundTrips], ['Fills', `${bt.buys} buys · ${bt.sells} sells`],
      ['Grid profit', `<span class="${bt.gridProfit > 0 ? 'up' : ''}">${usd(bt.gridProfit)}</span>`], ['Fees paid', usd(bt.fees)],
      ['Grid total', `<span class="${bt.pnlPct >= 0 ? 'up' : 'dn'}">${pct(bt.pnlPct)}</span>`], ['Just holding', `<span class="${bt.hodlPct >= 0 ? 'up' : 'dn'}">${pct(bt.hodlPct)}</span>`],
      ['Time in range', `${bt.inRangePct.toFixed(0)}%`], ['Period', `${bt.days.toFixed(1)} days`],
    ];
    $('#bt').innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
    const beat = bt.pnlPct - bt.hodlPct;
    $('#btNote').innerHTML = `Simulated on the ${D.candles.length} real ${D.tf} candles on the chart, starting with ${usd(D.amt || 100)} split across the grid at the first candle's price, 0.1% fee per fill. ${beat >= 0 ? `The grid beat holding by <b class="up">${beat.toFixed(2)} points</b>: crab season.` : `Holding beat the grid by <b class="dn">${(-beat).toFixed(2)} points</b>: the market trended, and grids like sideways markets.`} The past promises nothing.`;
    const t = $('#tabs button[data-p="test"]'); t.innerHTML = `Backtest <span class="n" style="background:${bt.pnlPct >= 0 ? '#1f8a53' : 'var(--red)'}">${pct(bt.pnlPct, 1)}</span>`;
  }
  let rp = 0;
  $('#replay').onclick = () => {
    if (!D.candles.length) return; clearTimeout(rp);
    let i = 12; const n = D.candles.length, cfg = { lo: D.lo, hi: D.hi, n: D.n, mode: D.mode, amount: D.amt || 100 };
    const tick = () => { i = Math.min(n, i + Math.max(1, Math.round(n / 160))); const bt = E.backtest(D.candles.slice(0, i), cfg); chart.set({ upto: i, fills: bt.fills }); if (i < n) rp = setTimeout(tick, 40); else chart.set({ upto: null }); };
    tick(); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---------------- tabs ----------------
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); ['build', 'test', 'mine'].forEach(k => $('#p-' + k).classList.toggle('hide', k !== b.dataset.p)); if (b.dataset.p === 'mine') loadOrders(); };

  // ---------------- wallet ----------------
  $('#walletBtn').onclick = () => {
    if (!WL.W.address) return WL.picker();
    const box = document.createElement('div'); box.className = 'modal';
    box.innerHTML = `<div class="sheet"><button class="x" aria-label="Close">×</button><h3>${esc(fmt.short(WL.W.address))}</h3><button class="wbtn" data-a="copy">Copy address</button><a class="wbtn" href="https://solscan.io/account/${WL.W.address}" target="_blank" rel="noopener">View on Solscan ↗</a><button class="wbtn" data-a="out">Disconnect</button></div>`;
    document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on'));
    const close = () => { box.classList.remove('on'); setTimeout(() => box.remove(), 200); };
    box.onclick = async e => { if (e.target === box || e.target.closest('.x')) return close(); const a = e.target.closest('[data-a]'); if (!a) return; if (a.dataset.a === 'copy') copy(WL.W.address, 'Address copied'); if (a.dataset.a === 'out') { await WL.disconnect(); } close(); };
  };
  WL.on(w => {
    const b = $('#walletBtn');
    if (w.address) { b.innerHTML = `<span class="dot"></span>${esc(fmt.short(w.address))}`; b.classList.remove('white'); loadBalances(); loadHistoryForMolt(); loadOrders(true); }
    else { b.textContent = 'Connect wallet'; b.classList.add('white'); D.bal = null; D.fills = 0; D.active = []; D.history = []; molt(); $('#maxBtn').hidden = true; $('#mineN').classList.add('hide'); renderOrders(); recalc(false); }
    deployBtn();
  });

  async function loadBalances() {
    if (!WL.W.address || !D.pair) return;
    const j = await api('portfolio?address=' + WL.W.address);
    if (!j.ok) { toast(j.msg || 'Couldn\'t read the wallet.'); return; }
    const get = m => { const h = j.holdings.find(x => x.mint === m); return h ? h.amount : 0; };
    const sol = get(SOL), tok = D.pair.mint === SOL ? Math.max(0, sol - 0.05) : get(D.pair.mint), usdc = get(USDC);
    D.bal = { usdc, tok, sol };
    const mx = usdc + tok * (price() || 0);
    const mb = $('#maxBtn'); mb.hidden = !(mx > 1); mb.textContent = 'Max ' + usd(mx).replace('.00', ''); mb.onclick = () => { D.amt = Math.floor(mx * 0.98 * 100) / 100; $('#amt').value = D.amt; recalc(true); };
    recalc(false);
  }
  // what the grid needs vs what the wallet has, and the one swap that would balance it
  function needs() {
    const pl = D.plan, b = D.bal, P = price(); if (!pl || !b) return {};
    const shortTok = Math.max(0, pl.tokenNeeded - b.tok), shortUsdc = Math.max(0, pl.usdNeeded - b.usdc);
    const spareUsdc = Math.max(0, b.usdc - pl.usdNeeded), spareTok = Math.max(0, b.tok - pl.tokenNeeded);
    if (shortTok > 0 && shortUsdc > 0) return { shortUsd: shortTok * P + shortUsdc };
    if (shortTok > 1e-12) { const cost = shortTok * P * 1.012; if (cost > spareUsdc) return { shortUsd: cost - spareUsdc }; return { swap: { from: USDC, to: D.pair.mint, uiIn: cost, msg: `Your crab will first swap about ${usd(cost)} of USDC into ${D.pair.symbol} for the sell lines.` } }; }
    if (shortUsdc > 0.01) { const tokIn = shortUsdc / P * 1.012; if (tokIn > spareTok) return { shortUsd: (tokIn - spareTok) * P }; return { swap: { from: D.pair.mint, to: USDC, uiIn: tokIn, msg: `Your crab will first swap about ${fmt.amt(tokIn)} ${D.pair.symbol} into USDC for the buy lines.` } }; }
    return {};
  }
  function deployBtn() {
    const b = $('#deploy'), pl = D.plan;
    if (!WL.W.address) { b.textContent = 'Connect wallet to deploy'; b.disabled = false; return; }
    const blocked = !pl || !pl.q || pl.warnings.some(w => w.k === 'min' || w.k === 'fee') || (D.bal && (needs().shortUsd || 0) > 0.01);
    b.disabled = !!blocked || busy;
    b.textContent = busy ? 'Working…' : `Deploy ${pl ? pl.buys.length + pl.sells.length : 0} orders`;
  }

  // ---------------- deploy ----------------
  const prog = $('#prog');
  const step = (id, label) => { prog.insertAdjacentHTML('beforeend', `<div class="pr do" id="pr-${id}"><i></i><div>${esc(label)}</div><span></span></div>`); return { ok: (t = '') => { const e = $('#pr-' + id); e.className = 'pr ok'; e.querySelector('span').textContent = t; }, no: (t = '') => { const e = $('#pr-' + id); e.className = 'pr no'; e.querySelector('span').textContent = t; }, set: t => { $('#pr-' + id).querySelector('div').textContent = t; } }; };
  const toRaw = (ui, dec) => BigInt(Math.floor(ui * Math.pow(10, dec))).toString();
  function orderBody(o, dec) {
    const maker = WL.W.address;
    if (o.side === 'buy') return { op: 'create', inputMint: USDC, outputMint: D.pair.mint, maker, makingAmount: toRaw(o.token * o.price, 6), takingAmount: toRaw(o.token, dec) };
    return { op: 'create', inputMint: D.pair.mint, outputMint: USDC, maker, makingAmount: toRaw(o.token, dec), takingAmount: toRaw(o.token * o.price, 6) };
  }
  async function placeOrders(list, label) {
    const dec = D.pair.decimals ?? 9;
    const s1 = step('build' + label, `Building ${list.length} limit orders on Jupiter`);
    const built = [];
    for (let k = 0; k < list.length; k++) {
      const r = await api('trigger', orderBody(list[k], dec));
      if (!r.ok) { s1.no(); throw new Error(`Line at $${pfmt(list[k].price)}: ${r.msg || 'Jupiter refused the order.'}`); }
      built.push({ ...list[k], order: r.order, tx: r.transaction, requestId: r.requestId });
      s1.set(`Building limit orders on Jupiter (${k + 1}/${list.length})`);
    }
    s1.ok(`${built.length} ready`);
    const s2 = step('sign' + label, 'Approve the orders in your wallet');
    let signed; try { signed = await WL.signAll(built.map(b => b.tx)); } catch { s2.no('cancelled'); throw new Error('You cancelled in the wallet. Nothing was placed.'); }
    s2.ok('signed');
    const s3 = step('send' + label, 'Placing orders on Jupiter');
    let okN = 0; const placed = [];
    for (let k = 0; k < built.length; k++) {
      const r = await api('trigger', { op: 'execute', signedTransaction: signed[k], requestId: built[k].requestId });
      if (r.ok && (r.status === 'Success' || r.signature)) { okN++; placed.push(built[k]); }
      s3.set(`Placing orders on Jupiter (${k + 1}/${built.length})`);
    }
    okN === built.length ? s3.ok(`${okN} placed`) : s3.no(`${okN}/${built.length} placed`);
    return placed;
  }
  $('#deploy').onclick = async () => {
    if (!WL.W.address) return WL.picker();
    if (busy || !D.plan) return;
    busy = true; deployBtn(); prog.innerHTML = '';
    try {
      await loadBalances();
      const need = needs();
      if ((need.shortUsd || 0) > 0.01) throw new Error(`Your wallet is ${usd(need.shortUsd)} short for this grid.`);
      if (need.swap) {
        const sw = need.swap, s0 = step('swap', `Swapping to balance the bag`);
        const dec = sw.from === USDC ? 6 : (D.pair.decimals ?? 9);
        const q = await api('trade', { op: 'quote', inputMint: sw.from, outputMint: sw.to, amount: toRaw(sw.uiIn, dec), slippageBps: 50 });
        if (!q.ok) { s0.no(); throw new Error(q.msg || 'No swap route right now.'); }
        const s = await api('trade', { op: 'swap', quote: q.quote, user: WL.W.address });
        if (!s.ok) { s0.no(); throw new Error(s.msg); }
        let sig; try { sig = await WL.signAndSend(s.tx); } catch { s0.no('cancelled'); throw new Error('Swap cancelled in the wallet. Nothing moved.'); }
        s0.set('Waiting for Solana to confirm the swap');
        const stt = await WL.confirm(sig);
        if (stt !== 'confirmed') { s0.no(stt); throw new Error(stt === 'failed' ? 'The swap failed on-chain.' : 'The swap isn\'t confirmed yet. Try again in a minute.'); }
        s0.ok('confirmed'); await loadBalances();
      }
      const orders = [...D.plan.buys, ...D.plan.sells];
      const placed = await placeOrders(orders, 'g');
      if (placed.length) {
        const saved = { mint: D.pair.mint, symbol: D.pair.symbol, decimals: D.pair.decimals, levels: D.plan.levels, q: D.plan.q, lo: D.lo, hi: D.hi, n: D.n, mode: D.mode, at: Date.now(), orders: {} };
        placed.forEach(o => { saved.orders[o.order] = { side: o.side, i: o.i, price: o.price }; });
        store.set('plan:' + WL.W.address + ':' + D.pair.mint, saved);
        toast(`${crabName} is on ${placed.length} lines. Grid live.`, 4200);
        setTimeout(() => { $('#tabs button[data-p="mine"]').click(); }, 900);
      }
    } catch (e) { toast(e.message || 'Something went wrong. Nothing else was placed.', 5200); }
    busy = false; deployBtn(); loadBalances();
  };

  // ---------------- my grid ----------------
  $('#mineTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'refresh') return loadOrders(); D.sub = b.dataset.s; $$('#mineTabs button[data-s]').forEach(x => x.classList.toggle('on', x === b)); renderOrders(); };
  async function fetchAll(status) {
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const j = await api(`trigger?user=${WL.W.address}&status=${status}&page=${page}`);
      if (!j.ok) { if (page === 1) throw new Error(j.msg); break; }
      out.push(...(j.orders || [])); if (!(j.hasMoreData || (j.totalPages && page < j.totalPages))) break;
    }
    return out;
  }
  async function loadHistoryForMolt() {
    try { D.history = await fetchAll('history'); D.fills = D.history.filter(o => /complet/i.test(o.status)).length; } catch { D.fills = 0; }
    const before = store.get('molt:' + WL.W.address, 0), m = molt();
    if (m.index > before) { toast(`${crabName} molted into a ${m.name}! Now works ${m.lines} lines.`, 4800); }
    store.set('molt:' + WL.W.address, m.index); recalc(false);
  }
  async function loadOrders(quiet) {
    if (!WL.W.address) { renderOrders(); return; }
    if (!quiet) $('#orders').innerHTML = '<div class="empty"><span class="spin"></span></div>';
    try { const [a, h] = await Promise.all([fetchAll('active'), fetchAll('history')]); D.active = a; D.history = h; D.fills = h.filter(o => /complet/i.test(o.status)).length; molt(); }
    catch (e) { if (!quiet) $('#orders').innerHTML = `<div class="bad">${esc(e.message || 'Couldn\'t read your orders from Jupiter.')}</div>`; return; }
    const nb = $('#mineN'); nb.textContent = D.active.length; nb.classList.toggle('hide', !D.active.length);
    renderOrders();
  }
  const symOf = m => m === USDC ? 'USDC' : (D.pairs.find(p => p.mint === m) || (D.pair && D.pair.mint === m ? D.pair : null) || { symbol: fmt.short(m) }).symbol;
  function orderView(o) {
    const buy = o.inputMint === USDC, tokMint = buy ? o.outputMint : o.inputMint;
    const mk = parseFloat(o.makingAmount), tk = parseFloat(o.takingAmount);
    const tokAmt = buy ? tk : mk, usdAmt = buy ? mk : tk, px = tokAmt ? usdAmt / tokAmt : null;
    return { buy, sym: symOf(tokMint), tokAmt, usdAmt, px };
  }
  function renderOrders() {
    const box = $('#orders');
    if (!WL.W.address) { box.innerHTML = '<div class="empty"><img src="/assets/img/crab-q.png" alt="">Connect a wallet to see your orders.</div>'; $('#cancelAll').hidden = true; $('#rearm').innerHTML = ''; return; }
    const rows = D.sub === 'active' ? D.active : D.history;
    $('#cancelAll').hidden = !(D.sub === 'active' && D.active.length > 1);
    rearmBox();
    if (!rows.length) { box.innerHTML = `<div class="empty"><img src="/assets/img/crab-q.png" alt="">${D.sub === 'active' ? 'No open orders. Build a grid and deploy it.' : 'Nothing filled or closed yet.'}</div>`; return; }
    box.innerHTML = rows.map(o => { const v = orderView(o); const stt = D.sub === 'active' ? `${(100 - (parseFloat(o.remainingMakingAmount) / parseFloat(o.makingAmount) * 100 || 100)).toFixed(0)}% filled` : esc(o.status || '');
      return `<div class="orow"><span class="sd ${v.buy ? 'buy' : 'sell'}">${v.buy ? 'buy' : 'sell'}</span><div class="m">${fmt.amt(v.tokAmt)} ${esc(v.sym)} at $${pfmt(v.px)}<small>${usd(v.usdAmt)} · ${stt} · ${fmt.ago(Date.parse(o.updatedAt || o.createdAt))}</small></div>${D.sub === 'active' ? `<button class="x" data-o="${esc(o.orderKey)}" type="button">Cancel</button>` : o.closeTx ? `<a class="x" href="https://solscan.io/tx/${esc(o.closeTx)}" target="_blank" rel="noopener">Tx ↗</a>` : ''}</div>`; }).join('');
  }
  $('#orders').onclick = async e => {
    const b = e.target.closest('button.x[data-o]'); if (!b) return;
    b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('trigger', { op: 'cancel', maker: WL.W.address, order: b.dataset.o }); if (!r.ok) throw new Error(r.msg);
      const [s] = await WL.signAll([r.transaction]);
      const x = await api('trigger', { op: 'execute', signedTransaction: s, requestId: r.requestId }); if (!x.ok) throw new Error(x.error || x.msg || 'Jupiter didn\'t accept the cancel.');
      toast('Order cancelled. Funds go back to your wallet.'); await sleep(1500); loadOrders(true); loadBalances();
    } catch (err) { toast(err.message || 'Cancel stopped. The order is still open.'); b.disabled = false; b.textContent = 'Cancel'; }
  };
  $('#cancelAll').onclick = async () => {
    const btn = $('#cancelAll'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Building cancels…';
    try {
      const r = await api('trigger', { op: 'cancelAll', maker: WL.W.address, orders: D.active.map(o => o.orderKey) }); if (!r.ok) throw new Error(r.msg);
      btn.innerHTML = '<span class="spin"></span> Approve in your wallet…';
      const signed = await WL.signAll(r.transactions);
      let ok = 0; for (const s of signed) { const x = await api('trigger', { op: 'execute', signedTransaction: s, requestId: r.requestId }); if (x.ok) ok++; }
      toast(`${ok ? 'Grid pulled.' : 'Jupiter didn\'t accept the cancels.'} Funds go back to your wallet.`); await sleep(1500); loadOrders(true); loadBalances();
    } catch (err) { toast(err.message || 'Cancel stopped.'); }
    btn.disabled = false; btn.textContent = 'Cancel every open order';
  };

  // re-arm: a filled buy gets its sell one line up, a filled sell gets its buy one line down
  function rearmList() {
    if (!WL.W.address || !D.pair) return [];
    const plan = store.get('plan:' + WL.W.address + ':' + D.pair.mint); if (!plan) return [];
    const done = new Set(store.get('rearmed:' + WL.W.address, []));
    const activeLv = new Set(D.active.map(o => { const v = orderView(o); return (v.buy ? 'b' : 's') + (v.px ? v.px.toPrecision(5) : ''); }));
    const out = [];
    for (const o of D.history) {
      const meta = plan.orders[o.orderKey]; if (!meta || !/complet/i.test(o.status) || done.has(o.orderKey)) continue;
      const j = meta.side === 'buy' ? meta.i + 1 : meta.i - 1; if (j < 0 || j >= plan.levels.length) continue;
      const side = meta.side === 'buy' ? 'sell' : 'buy', px = plan.levels[j];
      if (activeLv.has((side === 'buy' ? 'b' : 's') + px.toPrecision(5))) continue;
      out.push({ from: o.orderKey, side, i: j, price: px, token: plan.q });
    }
    return out;
  }
  function rearmBox() {
    const list = rearmList(), box = $('#rearm');
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="okmsg"><b>${list.length} line${list.length > 1 ? 's' : ''} filled.</b> ${esc(crabName)} can re-arm ${list.length > 1 ? 'them' : 'it'} one line over: ${list.slice(0, 4).map(o => `${o.side} at $${pfmt(o.price)}`).join(', ')}${list.length > 4 ? '…' : ''}.<div style="margin-top:10px"><button class="btn sm white" id="rearmBtn" type="button">Re-arm ${list.length} order${list.length > 1 ? 's' : ''}</button></div></div>`;
    $('#rearmBtn').onclick = async () => {
      if (busy) return; busy = true; prog.innerHTML = ''; $('#tabs button[data-p="build"]').click();
      try {
        const placed = await placeOrders(list, 'r');
        const plan = store.get('plan:' + WL.W.address + ':' + D.pair.mint);
        placed.forEach(o => { plan.orders[o.order] = { side: o.side, i: o.i, price: o.price }; });
        store.set('plan:' + WL.W.address + ':' + D.pair.mint, plan);
        store.set('rearmed:' + WL.W.address, [...new Set([...store.get('rearmed:' + WL.W.address, []), ...placed.map(o => o.from)])]);
        toast(`Re-armed ${placed.length} line${placed.length > 1 ? 's' : ''}.`); loadOrders(true);
      } catch (e) { toast(e.message || 'Re-arm stopped.'); }
      busy = false; deployBtn();
    };
  }

  // ---------------- boot ----------------
  (async () => {
    molt();
    const j = await api('pairs');
    if (!j.ok) { chart.set({ msg: 'Live prices are unavailable right now. Reload in a minute.' }); return; }
    D.pairs = j.pairs;
    const want = qs.get('m') || store.get('pair') || SOL;
    let p = D.pairs.find(x => x.mint === want);
    if (!p && want && want !== SOL) { const t = await api('token?q=' + encodeURIComponent(want)); p = t.ok && t.tokens.find(x => x.mint === want); }
    p = p || D.pairs[0];
    const lo = num(qs.get('lo')), hi = num(qs.get('hi')), n = parseInt(qs.get('n'), 10), a = num(qs.get('a'));
    if (lo > 0 && hi > lo) { D.lo = lo; D.hi = hi; }
    if (n >= 2) D.n = n; if (a > 0) { D.amt = a; }
    $('#amt').value = D.amt; if (D.mode === 'geo') $$('#mode button').forEach(x => x.classList.toggle('on', x.dataset.m === 'geo'));
    molt();
    if (n > E.moltFor(0).lines) toast(`A Hatchling works up to ${E.moltFor(0).lines} lines. Fill orders to molt and unlock more.`, 4200);
    selectPair(p, false);
    WL.reconnect();
    setInterval(async () => { const r = await api('pairs'); if (r.ok) { D.pairs = r.pairs; const q = r.pairs.find(x => D.pair && x.mint === D.pair.mint); if (q && q.price) { D.pair.price = q.price; D.pair.change24h = q.change24h; $('#pxNow').textContent = '$' + pfmt(q.price); $('#pxChg').innerHTML = `<span class="${q.change24h >= 0 ? 'up' : 'dn'}">${pct(q.change24h)}</span>`; } } }, 30000);
  })();
})();
