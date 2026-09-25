// GRID engine: grid levels, order plans, fee maths, a candle-by-candle backtest, and the molt ladder.
// Pure functions, no DOM. Used by the home page and the desk.
(function (root) {
  const FEE = 0.001;          // Jupiter limit order fee on non-stable pairs (0.1% per fill)
  const MIN_ORDER = 5;        // Jupiter's minimum order value, in USD

  // The molt ladder: a hermit crab moves into a bigger bag as it grows. Growth = filled limit orders on your wallet.
  const MOLTS = [
    { id: 'hatchling', name: 'Hatchling', fills: 0, lines: 6, bag: 'Coin purse', line: 'Fresh out of the egg. Six lines, one small bag.' },
    { id: 'scuttler', name: 'Scuttler', fills: 2, lines: 12, bag: 'Day pack', line: 'Found its legs. Twelve lines to work.' },
    { id: 'pincher', name: 'Pincher', fills: 6, lines: 20, bag: 'Trail pack', line: 'Claws sharp. Twenty lines at once.' },
    { id: 'shellback', name: 'Shellback', fills: 16, lines: 32, bag: 'Expedition pack', line: 'Hardened by chop. Thirty-two lines.' },
    { id: 'king', name: 'King Crab', fills: 40, lines: 50, bag: 'The big red bag', line: 'Rules the pit. Fifty lines, every pair.' },
  ];
  function moltFor(fills) {
    let i = 0; for (let k = 0; k < MOLTS.length; k++) if (fills >= MOLTS[k].fills) i = k;
    const cur = MOLTS[i], next = MOLTS[i + 1] || null;
    const progress = next ? Math.min(1, (fills - cur.fills) / (next.fills - cur.fills)) : 1;
    return { ...cur, index: i, next, progress, fills };
  }

  function levels(lo, hi, n, mode) {
    n = Math.max(2, Math.floor(n)); const out = [];
    if (!(lo > 0) || !(hi > lo)) return out;
    if (mode === 'geo') { const r = Math.pow(hi / lo, 1 / n); for (let i = 0; i <= n; i++) out.push(lo * Math.pow(r, i)); }
    else { const s = (hi - lo) / n; for (let i = 0; i <= n; i++) out.push(lo + s * i); }
    return out;
  }

  // Split an amount (USD) across the grid. Every order moves the same quantity of the token (q).
  // Lines below the price are buys (paid in USDC), lines above are sells (paid in the token).
  // The line nearest the price is skipped so no order fills the moment it is placed.
  function plan({ lo, hi, n, mode = 'arith', amount, price, fee = FEE }) {
    const L = levels(lo, hi, n, mode);
    const res = { levels: L, buys: [], sells: [], q: 0, usdNeeded: 0, tokenNeeded: 0, warnings: [], skip: -1 };
    if (!L.length || !(price > 0) || !(amount > 0)) return res;
    let skip = 0, best = Infinity;
    L.forEach((p, i) => { const d = Math.abs(p - price); if (d < best) { best = d; skip = i; } });
    res.skip = skip;
    const buyL = [], sellL = [];
    L.forEach((p, i) => { if (i === skip) return; if (p < price) buyL.push(i); else sellL.push(i); });
    const sumBuy = buyL.reduce((s, i) => s + L[i], 0);
    const q = amount / (sumBuy + sellL.length * price);
    res.q = q;
    res.buys = buyL.map(i => ({ i, side: 'buy', price: L[i], token: q, usd: q * L[i] })).reverse();
    res.sells = sellL.map(i => ({ i, side: 'sell', price: L[i], token: q, usd: q * L[i] }));
    res.usdNeeded = res.buys.reduce((s, o) => s + o.usd, 0);
    res.tokenNeeded = q * sellL.length;
    // profit per grid: buy at L[i], sell at L[i+1], both legs pay the fee
    const per = []; for (let i = 0; i < L.length - 1; i++) per.push((L[i + 1] * (1 - fee)) / (L[i] * (1 + fee)) - 1);
    res.perGrid = { min: Math.min(...per), max: Math.max(...per) };
    res.perGridUsd = { min: q * Math.min(...L.slice(0, -1).map((p, i) => L[i + 1] * (1 - fee) - p * (1 + fee))), max: q * Math.max(...L.slice(0, -1).map((p, i) => L[i + 1] * (1 - fee) - p * (1 + fee))) };
    res.minOrderUsd = q * L[0];
    if (res.minOrderUsd < MIN_ORDER) res.warnings.push({ k: 'min', msg: `Your smallest order is $${res.minOrderUsd.toFixed(2)}. Jupiter needs at least $${MIN_ORDER} per order. Add more money or use fewer lines.` });
    if (res.perGrid.min <= 0) res.warnings.push({ k: 'fee', msg: 'Your lines are so close that fees eat the profit. Widen the range or use fewer lines.' });
    if (price < lo || price > hi) res.warnings.push({ k: 'out', msg: 'The price is outside your range, so only one side of the grid would trade.' });
    return res;
  }

  // Backtest on real candles. The candle's path is assumed open → nearer extreme → other extreme → close.
  function backtest(candles, cfg) {
    const out = { fills: [], buys: 0, sells: 0, roundTrips: 0, gridProfit: 0, fees: 0, start: null, end: null };
    if (!candles || candles.length < 5) return out;
    const fee = cfg.fee ?? FEE, P0 = candles[0][1];
    const pl = plan({ ...cfg, price: P0 });
    if (!pl.q) return out;
    const L = pl.levels, q = pl.q;
    // order book: at each level either a resting buy, a resting sell, or nothing
    const book = L.map((p, i) => i === pl.skip ? null : (p < P0 ? 'buy' : 'sell'));
    let usd = pl.usdNeeded, tok = pl.tokenNeeded;
    const cost = new Array(L.length).fill(null); // what the token held for a sell at level i cost
    for (let i = 0; i < L.length; i++) if (book[i] === 'sell') cost[i] = P0;
    const cross = (a, b, t) => {
      if (a === b) return;
      if (b < a) { // falling: buys fill from the top down
        for (let i = L.length - 1; i >= 0; i--) if (book[i] === 'buy' && L[i] <= a && L[i] >= b) {
          if (usd + 1e-9 < q * L[i] * (1 + fee)) continue;
          usd -= q * L[i] * (1 + fee); tok += q; out.fees += q * L[i] * fee; out.buys++;
          book[i] = null; out.fills.push({ t, price: L[i], side: 'buy', i });
          if (i + 1 < L.length && book[i + 1] === null) { book[i + 1] = 'sell'; cost[i + 1] = L[i]; }
        }
      } else { // rising: sells fill from the bottom up
        for (let i = 0; i < L.length; i++) if (book[i] === 'sell' && L[i] >= a && L[i] <= b) {
          if (tok + 1e-12 < q) continue;
          tok -= q; usd += q * L[i] * (1 - fee); out.fees += q * L[i] * fee; out.sells++;
          const paid = cost[i] ?? L[i - 1] ?? L[i];
          if (cost[i] != null && i > 0 && Math.abs(cost[i] - L[i - 1]) < 1e-12) { out.roundTrips++; out.gridProfit += q * (L[i] * (1 - fee) - paid * (1 + fee)); }
          book[i] = null; cost[i] = null; out.fills.push({ t, price: L[i], side: 'sell', i });
          if (i - 1 >= 0 && book[i - 1] === null) book[i - 1] = 'buy';
        }
      }
    };
    let inRange = 0;
    for (const [t, o, h, l, c] of candles) {
      const upFirst = (h - o) < (o - l);
      const path = upFirst ? [o, h, l, c] : [o, l, h, c];
      for (let k = 1; k < path.length; k++) cross(path[k - 1], path[k], t);
      if (c >= cfg.lo && c <= cfg.hi) inRange++;
    }
    const last = candles[candles.length - 1][4];
    const startValue = cfg.amount, endValue = usd + tok * last;
    out.start = { t: candles[0][0], price: P0 }; out.end = { t: candles[candles.length - 1][0], price: last };
    out.endValue = endValue; out.pnl = endValue - startValue; out.pnlPct = out.pnl / startValue * 100;
    out.gridPct = out.gridProfit / startValue * 100;
    out.hodlPct = (last / P0 - 1) * 100;
    out.inRangePct = inRange / candles.length * 100;
    out.usd = usd; out.token = tok; out.plan = pl;
    const days = (candles[candles.length - 1][0] - candles[0][0]) / 86400000;
    out.days = days;
    return out;
  }

  // Suggest a range from the chart: the band where most of the recent closes sat.
  function suggest(candles) {
    const c = candles.map(x => x[4]).sort((a, b) => a - b);
    if (c.length < 5) return null;
    const q = f => c[Math.min(c.length - 1, Math.max(0, Math.round(f * (c.length - 1))))];
    return { lo: q(0.08), hi: q(0.92) };
  }

  const API = { FEE, MIN_ORDER, MOLTS, moltFor, levels, plan, backtest, suggest };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
