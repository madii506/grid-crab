// THE PIT: the inside of your bag, where your grid crab lives and works. Every pocket is a room.
(() => {
  const { $, $$, esc, fmt, api, toast, store, icon, tickerChips, copy } = I;
  const E = window.Engine, WL = window.Wallet, MAP = window.PIT_MAP;
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', SOL = 'So11111111111111111111111111111111111111112';
  const TEMPERS = {
    calm: { name: 'Calm', range: 0.06, frac: 1, mode: 'arith', line: 'Tight range, lots of small pinches.' },
    balanced: { name: 'Balanced', range: 0.12, frac: 0.8, mode: 'arith', line: 'The classic crab. Medium range.' },
    scrappy: { name: 'Scrappy', range: 0.25, frac: 0.6, mode: 'geo', line: 'Wide range, rides the big chop.' },
  };
  const ROOMS = {
    burrow: { t: 'The Burrow', s: 'The main compartment. Your crab lives here.' },
    radio: { t: 'The Radio', s: 'Talk to your crab.' },
    tide: { t: 'The Tide Wall', s: 'The live price your crab watches.' },
    rack: { t: 'The Line Rack', s: 'Your grid: every rail is an order.' },
    reef: { t: 'The Reef Board', s: 'Your orders, pinned. Filled ones glow.' },
    molt: { t: 'The Molt Den', s: 'Five bags, five sizes. Grow into them.' },
    desk: { t: 'The Desk', s: 'Where orders get signed.' },
    stash: { t: 'The Stash', s: 'Your whole portfolio, counted by your crab.' },
  };
  const SPOT = { stash: 'burrow' };
  const S = { crab: store.get('crab', null), pf: null, pairs: [], pair: null, candles: [], plan: null, bt: null, active: [], history: [], fills: 0, log: store.get('log', null), chat: [], amt: store.get('amt', 200), room: null, busy: false };
  const pfmt = p => p == null || !isFinite(p) ? '—' : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(p >= 100 ? 2 : 3) : p.toPrecision(3);
  const usd = n => n == null || isNaN(n) ? '—' : (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n, d = 2) => n == null || isNaN(n) ? '—' : (n > 0 ? '+' : '') + n.toFixed(d) + '%';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const saveCrab = () => store.set('crab', S.crab);

  // ---------------- the world ----------------
  const wrap = $('#wrapw'), world = $('#world');
  const el = (tag, cls, css, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); if (html != null) e.innerHTML = html; world.appendChild(e); return e; };
  const LABEL = { desk: 'The <i>desk</i>', burrow: 'The <i>burrow</i>', radio: '<i>Radio</i>', tide: 'Tide <i>wall</i>', rack: 'Line <i>rack</i>', reef: 'Reef <i>board</i>', molt: 'Molt <i>den</i>' };
  const WIDTH = { desk: 8, burrow: 15, radio: 6, tide: 18, rack: 13, reef: 10, molt: 14 };
  for (const [id, st] of Object.entries(MAP.stations)) {
    el('div', 'sign', { left: st.sign[0] + '%', top: (st.sign[1] - (id === 'radio' ? 1 : 2.5)) + '%' }, LABEL[id]);
    const h = el('button', 'hot', { left: st.x + '%', top: st.sign[1] + '%', width: WIDTH[id] + '%', height: (st.feet - st.sign[1]) + '%' });
    h.setAttribute('aria-label', ROOMS[id].t); h.type = 'button';
    h.onclick = () => id === 'desk' ? (location.href = '/desk') : visit(id);
  }
  const scr = MAP.screen;
  const screen = el('div', 'screen', { left: scr.l + '%', top: scr.t + '%', width: (scr.r - scr.l) + '%', height: (scr.b - scr.t) + '%' }, '<canvas></canvas><div class="lbl" id="scrLbl"></div>');
  const wallChart = new GridChart(screen.querySelector('canvas'), { drag: false, crabs: false, axis: false });
  const SPRITE = { front: '/assets/img/crab-front.png', r: '/assets/img/crab-sr.png', l: '/assets/img/crab-sl.png' };
  const H = MAP.unitH * 2.3, FEET = MAP.stations.burrow.feet;
  const me = el('div', 'me', { height: H + '%', top: (FEET - H) + '%', left: MAP.stations.burrow.x + '%', display: 'none' }, `<img src="${SPRITE.front}" alt="Your crab"><span class="tag"></span>`);
  let myX = MAP.stations.burrow.x, moving = Promise.resolve();
  function fit() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    let ww = Math.min(w, h * 2.4), scroll = false;
    if (w < 900) { ww = Math.max(ww, Math.min(h * 2.4, 1500)); scroll = ww > w + 2; }
    world.style.width = ww + 'px'; wrap.classList.toggle('scroll', scroll);
    if (scroll) follow(myX, false);
  }
  function follow(x, smooth = true) { if (!wrap.classList.contains('scroll')) return; wrap.scrollTo({ left: Math.max(0, world.clientWidth * x / 100 - wrap.clientWidth / 2), behavior: smooth ? 'smooth' : 'auto' }); }
  addEventListener('resize', fit); fit();

  function walkTo(id) {
    id = SPOT[id] || id;
    moving = moving.then(async () => {
      const x = MAP.stations[id].x + (id === 'burrow' ? 4 : id === 'molt' ? -4 : 0);
      const d = Math.abs(x - myX); if (d < 0.3) return;
      const img = me.querySelector('img'); img.src = x > myX ? SPRITE.r : SPRITE.l;
      me.classList.add('walk'); const t = d / 11; me.style.transitionDuration = t + 's';
      requestAnimationFrame(() => { me.style.left = x + '%'; }); myX = x; follow(x);
      await sleep(t * 1000 + 60); me.classList.remove('walk'); img.src = SPRITE.front;
    }).catch(() => {});
    return moving;
  }
  let bubT = 0;
  function say(text, ms = 3200, think = false) {
    $$('.bub', me).forEach(b => b.remove()); clearTimeout(bubT);
    const b = document.createElement('div'); b.className = 'bub' + (think ? ' think' : ''); b.textContent = text; me.appendChild(b);
    if (ms) bubT = setTimeout(() => b.remove(), ms);
  }
  function status(t, live = true) { $('#cStatus').textContent = t; $('#cDot').style.background = live ? 'var(--green)' : 'var(--dim)'; }

  // ---------------- data ----------------
  const temper = () => TEMPERS[(S.crab && S.crab.temper) || 'balanced'];
  const molt = () => E.moltFor(S.fills);
  const price = () => (S.pair && S.pair.price) || (S.candles.length ? S.candles[S.candles.length - 1][4] : null);
  function gridCfg() {
    const P = price(), t = temper(), cap = molt().lines;
    if (!P) return null;
    const n = Math.max(3, Math.min(cap, Math.round(cap * t.frac)));
    return { lo: P * (1 - t.range), hi: P * (1 + t.range), n, mode: t.mode, amount: S.amt };
  }
  function recompute() {
    const cfg = gridCfg(); if (!cfg) return;
    S.plan = E.plan({ ...cfg, price: price() });
    S.bt = S.candles.length ? E.backtest(S.candles, { ...cfg, lo: E.suggest(S.candles).lo, hi: E.suggest(S.candles).hi }) : null;
    // the wall shows the last two days with the crab's current lines
    const c = S.candles.slice(-48);
    wallChart.set({ candles: c, lo: cfg.lo, hi: cfg.hi, levels: S.plan.levels, skip: S.plan.skip, price: price(), fills: [] });
    const p = S.pair; $('#scrLbl').innerHTML = p ? `<b>${esc(p.symbol)}</b> $${pfmt(price())} <span class="${(p.change24h || 0) >= 0 ? 'up' : 'dn'}">${pct(p.change24h)}</span>` : '';
    if (S.room) render(S.room);
  }
  async function loadPair(p) {
    S.pair = p; if (S.crab) { S.crab.pair = p.mint; saveCrab(); }
    wallChart.set({ candles: [], msg: 'Reading the tide…' });
    const j = await api(`candles?mint=${p.mint}&tf=1h${p.under ? '&under=' + p.under : ''}`);
    if (S.pair !== p) return;
    S.candles = j.ok ? j.candles : [];
    if (!j.ok) wallChart.set({ msg: 'No tide data right now.' });
    recompute();
  }
  async function fetchAll(status) {
    const out = [];
    for (let page = 1; page <= 5; page++) {
      const j = await api(`trigger?user=${WL.W.address}&status=${status}&page=${page}`);
      if (!j.ok) { if (page === 1) throw new Error(j.msg); break; }
      out.push(...(j.orders || [])); if (!(j.hasMoreData || (j.totalPages && page < j.totalPages))) break;
    }
    return out;
  }
  async function loadOrders() {
    if (!WL.W.address) { S.active = []; S.history = []; S.fills = 0; card(); return; }
    try { const [a, h] = await Promise.all([fetchAll('active'), fetchAll('history')]); S.active = a; S.history = h; S.fills = h.filter(o => /complet/i.test(o.status)).length; } catch {}
    const before = store.get('molt:' + WL.W.address, 0), m = molt();
    if (m.index > before && S.crab) { toast(`${S.crab.name} molted into a ${m.name}! It now works ${m.lines} lines.`, 5000); say(`I molted! ${m.name} now.`, 4000); }
    store.set('molt:' + WL.W.address, m.index);
    card(); recompute();
  }
  async function loadStash() {
    if (!WL.W.address) { S.pf = null; return null; }
    const j = await api('portfolio?address=' + WL.W.address);
    if (j.ok) S.pf = { ...j, addr: WL.W.address };
    return S.pf;
  }
  function stashSummary() {
    const pf = S.pf; if (!pf || pf.addr !== WL.W.address) return null;
    const by = { stock: 0, crypto: 0, stable: 0, meme: 0 };
    for (const h of pf.holdings) if (h.usd) by[h.kind in by ? h.kind : 'meme'] += h.usd;
    const t = pf.total || 0, share = v => t ? v / t * 100 : 0;
    const top = pf.holdings.filter(h => h.usd > 0.5);
    const gridable = top.filter(h => S.pairs.some(q => q.mint === h.mint) && h.usd >= 20);
    const ch = t ? pf.holdings.reduce((a, h) => a + (h.usd && h.change24h != null ? h.usd * h.change24h : 0), 0) / t : null;
    return { total: t, by, share, top, gridable, change24h: ch, big: top[0] || null, idle: by.stable };
  }
  function card() {
    const m = molt();
    $('#cName').textContent = S.crab ? S.crab.name : 'Your crab';
    $('#cStage').textContent = S.crab ? `${m.name.toUpperCase()} · ${temper().name.toUpperCase()}` : 'NOT HATCHED';
    $('#cXp').style.width = (m.progress * 100).toFixed(0) + '%';
    me.querySelector('.tag').textContent = S.crab ? S.crab.name : '';
    const b = $('#walletBtn');
    if (WL.W.address) { b.innerHTML = `<span class="dot"></span>${esc(fmt.short(WL.W.address))}`; b.classList.remove('white'); }
    else { b.textContent = 'Connect wallet'; b.classList.add('white'); }
  }

  // ---------------- drawer rooms ----------------
  const drawer = $('#drawer');
  function open(id) { S.room = id; drawer.classList.add('on'); drawer.setAttribute('aria-hidden', 'false'); render(id); }
  function close() { S.room = null; drawer.classList.remove('on'); drawer.setAttribute('aria-hidden', 'true'); }
  $('#dClose').onclick = close;
  async function visit(id) {
    if (!S.crab && id !== 'burrow') { open('burrow'); return toast('Hatch your crab first.'); }
    open(id);
    if (S.crab) { await walkTo(id); }
  }
  $$('.dock [data-go]').forEach(b => b.onclick = () => visit(b.dataset.go));
  const statRow = cells => `<div class="stats">${cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  const featured = () => ['SOL', 'JUP', 'BONK', 'WIF', 'BTC', 'ETH', 'NVDAx', 'AAPLx', 'GOOGLx', 'MSFTx'].map(s => S.pairs.find(p => p.symbol === s)).filter(Boolean);
  function render(id) {
    const r = ROOMS[id]; $('#dTitle').textContent = r.t; $('#dSub').textContent = r.s;
    const body = $('#dBody'), m = molt(), p = S.pair;
    if (id === 'burrow') {
      if (!S.crab) {
        body.innerHTML = `<div class="intro">You're inside the bag. In January <b>Backpack</b> put grid bots on its exchange. GRID puts one in <b>your</b> bag: a robot hermit crab that lives in your wallet (Backpack, Phantom or Solflare). It trades tokenized stocks like <b>NVDA</b> and <b>AAPL</b> and crypto like <b>SOL</b>, strings lines across the price, pinches a little every time the tide crosses one, and counts your whole portfolio in the Stash. Every pocket in here is a room.</div>
          <label class="field"><span>Name your crab</span><input class="in" id="hName" maxlength="18" placeholder="e.g. Pinchy"></label>
          <div class="field"><span>Temperament</span><div class="temper" id="hTemper">${Object.entries(TEMPERS).map(([k, t]) => `<button type="button" data-k="${k}" class="${k === 'balanced' ? 'on' : ''}"><b>${t.name}</b><span>${t.line}</span></button>`).join('')}</div></div>
          <button class="btn lg red" id="hatch" type="button">Hatch</button>
          <p class="fine">Your crab is saved in this browser. It grows from real filled orders on the wallet you connect.</p>`;
        let tk = 'balanced';
        $('#hTemper').onclick = e => { const b = e.target.closest('button'); if (!b) return; tk = b.dataset.k; $$('#hTemper button').forEach(x => x.classList.toggle('on', x === b)); };
        $('#hatch').onclick = () => hatch(($('#hName').value || '').trim() || 'Crab #' + (100 + Math.floor(Math.random() * 900)), tk);
        return;
      }
      body.innerHTML = `
        <div class="field"><span>Name</span><input class="in" id="bName" maxlength="18" value="${esc(S.crab.name)}"></div>
        <div class="field"><span>Temperament</span><div class="temper" id="bTemper">${Object.entries(TEMPERS).map(([k, t]) => `<button type="button" data-k="${k}" class="${k === S.crab.temper ? 'on' : ''}"><b>${t.name}</b><span>${t.line}</span></button>`).join('')}</div></div>
        ${statRow([['Stage', m.name], ['Bag', m.bag], ['Filled orders', WL.W.address ? S.fills : '—'], ['Lines it can work', m.lines]])}
        <div class="field"><span>Crab log</span>${S.log ? `<div class="log">${esc(S.log.text)}<small>${S.log.source === 'ai' ? 'Written by your crab' : 'Numbers-only log'} · ${fmt.ago(S.log.at)} · ${esc(S.log.symbol || '')}</small></div>` : '<div class="log">No log yet. Press <b>Run my scan</b> and your crab will walk the rooms and write one.</div>'}</div>
        ${WL.W.address ? `<div class="okmsg">Wallet ${esc(fmt.short(WL.W.address))} connected. Your crab reads its orders from Jupiter.</div>` : '<button class="btn white" id="bConnect" type="button">Connect a wallet so it can grow</button>'}
        <button class="btn ghost sm" id="bRelease" type="button">Release this crab</button>`;
      $('#bName').onchange = e => { S.crab.name = e.target.value.trim().slice(0, 18) || S.crab.name; saveCrab(); card(); say(`${S.crab.name}. I like it.`); };
      $('#bTemper').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.crab.temper = b.dataset.k; saveCrab(); $$('#bTemper button').forEach(x => x.classList.toggle('on', x === b)); card(); recompute(); say(`${TEMPERS[b.dataset.k].name} it is.`); };
      const bc = $('#bConnect'); if (bc) bc.onclick = () => WL.picker();
      $('#bRelease').onclick = () => { if (!confirmRelease()) return; };
      return;
    }
    if (id === 'radio') {
      body.innerHTML = `<div class="chat" id="chat">${S.chat.length ? S.chat.map(x => `<div class="msg2 ${x.role === 'me' ? 'mine' : 'its'}">${esc(x.text)}</div>`).join('') : `<div class="msg2 its">Hey, it's ${esc(S.crab.name)}. Ask me about ${esc(p ? p.symbol : 'the market')}, my lines, or when to widen the range.</div>`}</div>
        <div class="ask"><input class="in" id="q" placeholder="Ask your crab…" maxlength="300"><button class="btn red" id="send" type="button">Send</button></div>
        <div class="chips2">${['How is the tide?', 'How is my portfolio?', 'Can you trade stocks?', 'Would you beat holding?', 'How do I molt?'].map(s => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
      const go = async text => {
        text = (text || $('#q').value).trim(); if (!text) return; $('#q').value = '';
        S.chat.push({ role: 'me', text }); render('radio'); say('…', 0, true);
        const j = await api('crab', { mode: 'chat', name: S.crab.name, stage: m.name, facts: facts(), messages: S.chat });
        const reply = j.ok ? j.note : fallbackChat(text);
        S.chat.push({ role: 'it', text: reply }); render('radio'); say(reply.length > 90 ? reply.slice(0, 88) + '…' : reply, 5200);
        const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight;
      };
      $('#send').onclick = () => go(); $('#q').onkeydown = e => { if (e.key === 'Enter') go(); };
      $('.chips2', body).onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.q); };
      const c = $('#chat'); c.scrollTop = c.scrollHeight; return;
    }
    if (id === 'tide') {
      const cfg = gridCfg(), P = price();
      const posPct = cfg ? Math.max(0, Math.min(100, (P - cfg.lo) / (cfg.hi - cfg.lo) * 100)) : 50;
      body.innerHTML = `<div class="chips2" id="tPairs">${featured().map(q => `<button type="button" data-m="${q.mint}" class="${p && q.mint === p.mint ? 'on' : ''}">${icon(q)}${esc(q.symbol)}</button>`).join('')}</div>
        ${statRow([['Price', p ? '$' + pfmt(P) : '—'], ['24h', p ? `<span class="${(p.change24h || 0) >= 0 ? 'up' : 'dn'}">${pct(p.change24h)}</span>` : '—'], ['Range', cfg ? `$${pfmt(cfg.lo)} – $${pfmt(cfg.hi)}` : '—'], ['Kind', p ? (p.kind === 'stock' ? 'Tokenized stock' : 'Crypto') : '—']])}
        <div class="field"><span>Where the tide sits in your range</span><div class="pos"><i style="left:${posPct}%"></i></div><div class="posl"><span>buys</span><span>${posPct.toFixed(0)}%</span><span>sells</span></div></div>
        <p class="fine">Tokenized stocks like NVDA, AAPL, GOOGL and MSFT trade here too, the same markets Backpack Learn covers. Prices: Jupiter. History: ${p && p.kind === 'stock' ? 'Yahoo Finance (the share behind the token)' : 'Coinbase or GeckoTerminal'}.</p>
        <a class="btn white" href="/desk?m=${p ? p.mint : ''}">Open the full chart on the desk →</a>`;
      $('#tPairs').onclick = e => { const b = e.target.closest('button'); if (!b) return; const q = S.pairs.find(x => x.mint === b.dataset.m); if (q) { loadPair(q); say(`Watching ${q.symbol} now.`); } };
      return;
    }
    if (id === 'rack') {
      const cfg = gridCfg(), pl = S.plan, bt = S.bt;
      if (!cfg || !pl) { body.innerHTML = '<div class="log">Reading the tide first…</div>'; return; }
      body.innerHTML = `<div class="intro">${esc(S.crab.name)} is a <b>${esc(m.name)}</b> with a <b>${esc(temper().name.toLowerCase())}</b> temper: ±${Math.round(temper().range * 100)}% around ${esc(p.symbol)}, ${cfg.n} lines${cfg.mode === 'geo' ? ', spaced by %' : ''}.</div>
        <label class="field"><span>Amount (USD)</span><input class="in mono" id="rAmt" inputmode="decimal" value="${S.amt}"></label>
        ${statRow([['Range', `$${pfmt(cfg.lo)} – $${pfmt(cfg.hi)}`], ['Per round trip', pl.perGrid ? pct(pl.perGrid.min * 100) : '—'], ['Buys', `${pl.buys.length} · ${usd(pl.usdNeeded)}`], ['Sells', `${pl.sells.length} · ${fmt.amt(pl.tokenNeeded)} ${esc(p.symbol)}`], ['Each order', `${fmt.amt(pl.q)} ${esc(p.symbol)}`], ['Smallest order', `<span class="${pl.minOrderUsd < E.MIN_ORDER ? 'dn' : ''}">${usd(pl.minOrderUsd)}</span>`]])}
        ${pl.warnings.map(w => `<div class="warn">${esc(w.msg)}</div>`).join('')}
        ${bt ? `<div class="field"><span>Backtest · last ${bt.days.toFixed(0)} days of real prices</span>${statRow([['Round trips', bt.roundTrips], ['Grid total', `<span class="${bt.pnlPct >= 0 ? 'up' : 'dn'}">${pct(bt.pnlPct)}</span>`], ['Just holding', `<span class="${bt.hodlPct >= 0 ? 'up' : 'dn'}">${pct(bt.hodlPct)}</span>`], ['In range', bt.inRangePct.toFixed(0) + '%']])}</div>` : ''}
        <a class="btn lg red" href="/desk?m=${p.mint}&lo=${cfg.lo.toPrecision(6)}&hi=${cfg.hi.toPrecision(6)}&n=${cfg.n}&a=${S.amt}&mode=${cfg.mode}">Sign it on the desk →</a>
        <p class="fine">Orders are Jupiter limit orders from your own wallet: $5 minimum each, 0.1% per fill. The backtest uses the band the price spent most of its time in, so it can differ from today's range.</p>`;
      $('#rAmt').onchange = e => { const v = parseFloat(String(e.target.value).replace(/[^0-9.]/g, '')); if (v > 0) { S.amt = v; store.set('amt', v); recompute(); } };
      return;
    }
    if (id === 'reef') {
      if (!WL.W.address) { body.innerHTML = '<div class="log">Connect a wallet and your crab pins every order it owns here.</div><button class="btn white" id="rc" type="button">Connect wallet</button>'; $('#rc').onclick = () => WL.picker(); return; }
      const row = o => { const buy = o.inputMint === USDC; const mk = parseFloat(o.makingAmount), tk = parseFloat(o.takingAmount); const tok = buy ? tk : mk, usdv = buy ? mk : tk; const sym = (S.pairs.find(x => x.mint === (buy ? o.outputMint : o.inputMint)) || { symbol: fmt.short(buy ? o.outputMint : o.inputMint) }).symbol; return `<div class="orow"><span class="sd ${buy ? 'buy' : 'sell'}">${buy ? 'buy' : 'sell'}</span><div>${fmt.amt(tok)} ${esc(sym)} at $${pfmt(tok ? usdv / tok : null)}<small>${usd(usdv)} · ${esc(o.status || '')}</small></div></div>`; };
      body.innerHTML = `${statRow([['Open orders', S.active.length], ['Filled', S.fills]])}
        <div class="field"><span>Open</span><div class="olist">${S.active.length ? S.active.slice(0, 12).map(row).join('') : '<div class="log">No open orders yet.</div>'}</div></div>
        <div class="field"><span>Filled &amp; closed</span><div class="olist">${S.history.length ? S.history.slice(0, 8).map(row).join('') : '<div class="log">Nothing pinned yet.</div>'}</div></div>
        <a class="btn white" href="/desk">Cancel or re-arm on the desk →</a>`;
      return;
    }
    if (id === 'stash') {
      if (!WL.W.address) { body.innerHTML = `<div class="intro">The Stash is the big pocket where your crab counts everything you hold: stocks, crypto, cash and the odd meme. Connect a wallet and it reads every token, prices it, and tells you which ones it can put to work.</div><button class="btn white" id="sc" type="button">Connect wallet</button><p class="fine">Read-only. Looking at your portfolio never needs a signature.</p>`; $('#sc').onclick = () => WL.picker(); return; }
      const sm = stashSummary();
      if (!sm) { body.innerHTML = '<div class="log">Counting your stash…</div>'; loadStash().then(() => S.room === 'stash' && render('stash')); return; }
      const K = [['stock', 'Stocks', '#ff4b53'], ['crypto', 'Crypto', '#f2f3f6'], ['stable', 'Cash', '#3ddc84'], ['meme', 'Other', '#8d929d']];
      const tips = [];
      if (sm.big && sm.share(sm.big.usd) > 50) tips.push(`${esc(sm.big.symbol)} is ${sm.share(sm.big.usd).toFixed(0)}% of your bag. A grid on it sells a little into every pop, which trims a heavy position slowly instead of all at once.`);
      if (sm.idle >= 20) tips.push(`${usd(sm.idle)} is sitting in cash. That's enough for ${Math.min(molt().lines, Math.floor(sm.idle / 5))} buy lines at the $5 minimum.`);
      if (sm.by.stock === 0) tips.push('No stocks in the bag yet. Tokenized shares like NVDAx and AAPLx trade here around the clock, and your crab can grid them like any token.');
      if (sm.gridable.length) tips.push(`Your crab can work ${sm.gridable.slice(0, 4).map(h => esc(h.symbol)).join(', ')} straight from what you hold.`);
      if (!tips.length) tips.push('Nothing stands out. Your crab will say something when it does.');
      body.innerHTML = `${statRow([['Portfolio', usd(sm.total)], ['24h', sm.change24h == null ? '—' : `<span class="${sm.change24h >= 0 ? 'up' : 'dn'}">${pct(sm.change24h)}</span>`], ['Stocks', sm.share(sm.by.stock).toFixed(0) + '%'], ['Cash', sm.share(sm.by.stable).toFixed(0) + '%']])}
        <div class="field"><span>What's in the bag</span><div class="split">${K.map(([k, , c]) => sm.by[k] ? `<i style="flex:${sm.by[k]};background:${c}"></i>` : '').join('')}</div><div class="splitl">${K.map(([k, n, c]) => `<span><em style="background:${c}"></em>${n} ${sm.share(sm.by[k]).toFixed(0)}%</span>`).join('')}</div></div>
        <div class="field"><span>${esc(S.crab.name)} says</span>${tips.map(t => `<div class="log">${t}</div>`).join('')}</div>
        <div class="field"><span>Holdings</span><div class="olist">${sm.top.slice(0, 12).map(h => { const q = S.pairs.find(x => x.mint === h.mint); return `<div class="hrow">${icon(h)}<div><b>${esc(h.symbol)}</b>${h.kind === 'stock' ? '<span class="kt">STOCK</span>' : ''}<small>${fmt.amt(h.amount)} · ${sm.share(h.usd).toFixed(1)}%</small></div><div class="r">${usd(h.usd)}${q ? `<button type="button" data-m="${h.mint}">Grid it</button>` : ''}</div></div>`; }).join('') || '<div class="log">Nothing priced in this wallet yet.</div>'}</div></div>
        <p class="fine">Read-only, from your wallet's on-chain balances, priced by Jupiter. ${S.pf.unpriced ? S.pf.unpriced + ' token' + (S.pf.unpriced > 1 ? 's' : '') + ' without a price are left out. ' : ''}Your crab suggests; you decide and sign.</p>`;
      $$('.hrow button', body).forEach(b => b.onclick = async () => { const q = S.pairs.find(x => x.mint === b.dataset.m); if (!q) return; await loadPair(q); say(`Stringing lines on ${q.symbol}.`, 3000); visit('rack'); });
      return;
    }
    if (id === 'molt') {
      body.innerHTML = `<p class="mute" style="margin:0">A hermit crab outgrows its shell and moves into a bigger one. Yours outgrows its bag. It grows from filled limit orders on your wallet, read from Jupiter.</p>
        <div class="lad">${E.MOLTS.map((x, i) => `<div class="lrung ${i < m.index ? 'done' : i === m.index ? 'here' : ''}"><img src="/assets/img/crab-front.png" alt="" style="transform:scale(${0.6 + i * 0.1})"><div><b>${esc(x.name)}</b><span>${esc(x.bag)} · ${x.lines} lines</span></div><em>${i === m.index ? 'YOU' : x.fills ? x.fills + ' fills' : 'start'}</em></div>`).join('')}</div>
        ${m.next ? `<div class="okmsg">${S.fills} of ${m.next.fills} fills to become a ${esc(m.next.name)}.</div>` : '<div class="okmsg">King Crab. Top of the pit.</div>'}`;
    }
  }
  function confirmRelease() {
    const box = document.createElement('div'); box.className = 'modal';
    box.innerHTML = `<div class="sheet"><h3>Release ${esc(S.crab.name)}?</h3><p class="mute" style="margin:0 0 6px">This forgets the crab in this browser. Orders on your wallet stay exactly as they are.</p><button class="btn red" data-a="y" type="button">Release</button><button class="btn" data-a="n" type="button">Keep it</button></div>`;
    document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on'));
    box.onclick = e => { const a = e.target.closest('[data-a]'); if (e.target === box || a) { if (a && a.dataset.a === 'y') { store.del('crab'); store.del('log'); location.reload(); } box.classList.remove('on'); setTimeout(() => box.remove(), 200); } };
    return false;
  }

  // ---------------- hatch ----------------
  async function hatch(name, tk) {
    S.crab = { name: name.slice(0, 18), temper: tk, hatchedAt: Date.now(), pair: S.pair ? S.pair.mint : SOL }; saveCrab(); card(); status('Hatching in the burrow');
    close();
    me.style.display = ''; me.style.transitionDuration = '0s'; myX = MAP.stations.burrow.x; me.style.left = myX + '%';
    me.animate([{ transform: 'translateX(-50%) scale(.2)', opacity: 0 }, { transform: 'translateX(-50%) scale(1.1)', opacity: 1 }, { transform: 'translateX(-50%) scale(1)' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
    follow(myX); await sleep(750); say(`I'm ${S.crab.name}! This bag is home now.`, 3000); await sleep(1600);
    await walkTo('tide'); say(`${S.pair ? S.pair.symbol : 'The tide'} looks ${S.bt && S.bt.inRangePct > 60 ? 'choppy. My kind of water.' : 'lively. Let\'s see.'}`, 3600);
    status('Watching the tide wall');
  }

  // ---------------- the scan ----------------
  function facts() {
    const cfg = gridCfg(), p = S.pair, P = price(), bt = S.bt, m = molt();
    return {
      token: p && p.symbol, kind: p && p.kind, price: P, change24h: p && p.change24h,
      range: cfg && { lo: +cfg.lo.toPrecision(6), hi: +cfg.hi.toPrecision(6), lines: cfg.n, spacing: cfg.mode === 'geo' ? 'percent' : 'dollar' },
      priceInRangePct: cfg ? Math.round((P - cfg.lo) / (cfg.hi - cfg.lo) * 100) : null, temperament: temper().name,
      backtest: bt && { days: +bt.days.toFixed(1), roundTrips: bt.roundTrips, gridTotalPct: +bt.pnlPct.toFixed(2), justHoldingPct: +bt.hodlPct.toFixed(2), timeInRangePct: Math.round(bt.inRangePct) },
      orders: WL.W.address ? { open: S.active.length, filled: S.fills } : 'no wallet connected',
      molt: { stage: m.name, fills: S.fills, next: m.next ? `${m.next.name} at ${m.next.fills} fills` : null },
      portfolio: (() => { const sm = stashSummary(); if (!sm) return WL.W.address ? 'not counted yet' : 'no wallet connected'; return { totalUsd: Math.round(sm.total), stocksPct: Math.round(sm.share(sm.by.stock)), cryptoPct: Math.round(sm.share(sm.by.crypto)), cashPct: Math.round(sm.share(sm.by.stable)), otherPct: Math.round(sm.share(sm.by.meme)), top: sm.top.slice(0, 4).map(h => ({ symbol: h.symbol, kind: h.kind, pct: Math.round(sm.share(h.usd)) })) }; })(),
    };
  }
  function fallbackLog(f) {
    const L = [];
    L.push(`${f.token} is at $${pfmt(f.price)}, ${f.priceInRangePct}% of the way up my ${f.temperament.toLowerCase()} range ($${pfmt(f.range.lo)} to $${pfmt(f.range.hi)}, ${f.range.lines} lines).`);
    if (f.backtest) L.push(`On the last ${f.backtest.days} days of real prices my grid did ${f.backtest.roundTrips} round trips for ${pct(f.backtest.gridTotalPct)}, against ${pct(f.backtest.justHoldingPct)} for just holding.${f.backtest.gridTotalPct < f.backtest.justHoldingPct ? ' The tide trended, and I like it choppy.' : ' Choppy water. Crab season.'}`);
    if (f.portfolio && typeof f.portfolio === 'object') L.push(`Your stash is ${usd(f.portfolio.totalUsd)}: ${f.portfolio.stocksPct}% stocks, ${f.portfolio.cryptoPct}% crypto, ${f.portfolio.cashPct}% cash${f.portfolio.top[0] ? `, biggest is ${f.portfolio.top[0].symbol} at ${f.portfolio.top[0].pct}%` : ''}.`);
    L.push(typeof f.orders === 'string' ? 'No wallet connected, so I have no real orders yet.' : `${f.orders.open} open order${f.orders.open === 1 ? '' : 's'} on Jupiter, ${f.orders.filled} filled so far.`);
    L.push(`Next: ${typeof f.orders === 'string' ? 'connect a wallet and sign the grid on the desk.' : f.orders.open ? 'let the lines work, and re-arm any fills on the desk.' : 'sign the grid on the desk.'}`);
    return L.join(' ');
  }
  function fallbackChat(q) {
    const f = facts();
    if (/portfolio|stash|bag|hold/i.test(q) && !/beat/i.test(q)) return typeof f.portfolio === 'object' ? `Your stash is ${usd(f.portfolio.totalUsd)}: ${f.portfolio.stocksPct}% stocks, ${f.portfolio.cryptoPct}% crypto, ${f.portfolio.cashPct}% cash. The Stash pocket has the full count.` : 'Connect a wallet and I\'ll count your whole stash: stocks, crypto and cash.';
    if (/stock|nvda|aapl|tsla|goog|msft/i.test(q)) return 'I trade tokenized stocks like NVDAx, AAPLx, GOOGLx and MSFTx. They follow the real share price and trade on Solana around the clock. Pick one on the Tide Wall.';
    if (/molt|grow/i.test(q)) return `I'm a ${f.molt.stage}. ${f.molt.next ? 'I become a ' + f.molt.next + '.' : 'Top of the pit already.'} Only real filled orders count.`;
    if (/widen|range/i.test(q)) return `We're ${f.priceInRangePct}% up the range. If the price keeps leaving it, a wider temper like Scrappy keeps me working. Tighter ranges pinch more often but get left behind by trends.`;
    if (/hold|beat/i.test(q) && f.backtest) return `Over ${f.backtest.days} days: grid ${pct(f.backtest.gridTotalPct)}, holding ${pct(f.backtest.justHoldingPct)}. Grids win in chop and lose in strong trends.`;
    return `${f.token} is $${pfmt(f.price)}, ${pct(f.change24h)} today, ${f.priceInRangePct}% up my range. My radio to the AI is off right now, so that's the numbers-only version.`;
  }
  $('#scanBtn').onclick = async () => {
    if (!S.crab) return visit('burrow');
    if (S.busy) return; S.busy = true; close(); const btn = $('#scanBtn'); btn.disabled = true;
    try {
      const f0 = facts();
      status('Reading the tide wall'); await walkTo('tide'); say(`${f0.token} at $${pfmt(f0.price)}, ${pct(f0.change24h)} today.`, 3000); await sleep(2600);
      status('Checking the line rack'); await walkTo('rack'); say(f0.backtest ? `Backtest: ${f0.backtest.roundTrips} round trips, ${pct(f0.backtest.gridTotalPct)} vs holding ${pct(f0.backtest.justHoldingPct)}.` : 'Checking my lines…', 3400); await sleep(3000);
      status('Reading the reef board'); await walkTo('reef'); if (WL.W.address) await loadOrders();
      const f = facts();
      say(typeof f.orders === 'string' ? 'No wallet, so no orders pinned yet.' : `${f.orders.open} open, ${f.orders.filled} filled.`, 3000); await sleep(2600);
      status('Counting the stash'); await walkTo('burrow');
      if (WL.W.address) { await loadStash(); const sm = stashSummary(); if (sm) { say(`Stash: ${usd(sm.total)}, ${sm.share(sm.by.stock).toFixed(0)}% stocks.`, 2800); await sleep(2400); } }
      status('Writing the log'); say('Writing my log…', 0, true);
      const j = await api('crab', { mode: 'log', name: S.crab.name, stage: molt().name, facts: f });
      S.log = { text: j.ok ? j.note : fallbackLog(f), source: j.ok ? 'ai' : 'rules', at: Date.now(), symbol: f.token }; store.set('log', S.log);
      say('Log written. It\'s in the burrow.', 2600); status('Resting in the burrow'); open('burrow');
    } catch (e) { toast('The scan stopped halfway. Try again.'); }
    S.busy = false; btn.disabled = false;
  };

  // ---------------- wallet ----------------
  $('#walletBtn').onclick = () => {
    if (!WL.W.address) return WL.picker();
    const box = document.createElement('div'); box.className = 'modal';
    box.innerHTML = `<div class="sheet"><button class="x" aria-label="Close">×</button><h3>${esc(fmt.short(WL.W.address))}</h3><button class="wbtn" data-a="copy">Copy address</button><button class="wbtn" data-a="out">Disconnect</button></div>`;
    document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on'));
    const shut = () => { box.classList.remove('on'); setTimeout(() => box.remove(), 200); };
    box.onclick = async e => { if (e.target === box || e.target.closest('.x')) return shut(); const a = e.target.closest('[data-a]'); if (!a) return; if (a.dataset.a === 'copy') copy(WL.W.address, 'Address copied'); if (a.dataset.a === 'out') await WL.disconnect(); shut(); };
  };
  WL.on(() => { card(); loadOrders(); S.pf = null; if (WL.W.address) loadStash().then(() => S.room === 'stash' && render('stash')); if (S.room) render(S.room); if (WL.W.address && S.crab) say('Wallet connected. Reading my orders.', 2600); });

  // ---------------- boot ----------------
  (async () => {
    card();
    const j = await api('pairs');
    if (!j.ok) { toast('Live prices are unavailable right now.'); return; }
    S.pairs = j.pairs.filter(p => p.price != null);
    const ch = tickerChips(S.pairs); $('#run').innerHTML = ch + ch;
    const want = (S.crab && S.crab.pair) || SOL;
    await loadPair(S.pairs.find(p => p.mint === want) || S.pairs[0]);
    if (S.crab) { me.style.display = ''; myX = MAP.stations.tide.x; me.style.transitionDuration = '0s'; me.style.left = myX + '%'; follow(myX, false); status('Watching the tide wall'); setTimeout(() => say(`Back in the bag. ${S.pair.symbol} at $${pfmt(price())}.`, 3000), 600); }
    else { status('Waiting to hatch', false); open('burrow'); }
    WL.reconnect();
    setInterval(async () => { const r = await api('pairs'); if (r.ok && S.pair) { const q = r.pairs.find(x => x.mint === S.pair.mint); if (q && q.price) { S.pair.price = q.price; S.pair.change24h = q.change24h; recompute(); } } }, 30000);
  })();
})();
