// GET /api/candles?mint=&tf=15m|1h|6h|1d: real price history for a pair, oldest first, as [ms, open, high, low, close].
// Sources: Coinbase Exchange for majors, Yahoo for the share behind an xStock, GeckoTerminal (the token's biggest Solana pool) for anything else.
const L = require('./_lib');
const TF = {
  '15m': { cb: 900, yi: '15m', yr: '5d', gk: ['minute', 15], agg: 1, ms: 900e3 },
  '1h': { cb: 3600, yi: '60m', yr: '1mo', gk: ['hour', 1], agg: 1, ms: 3600e3 },
  '6h': { cb: 21600, yi: '60m', yr: '3mo', gk: ['hour', 1], agg: 6, ms: 21600e3 },
  '1d': { cb: 86400, yi: '1d', yr: '1y', gk: ['day', 1], agg: 1, ms: 86400e3 },
};
const cache = new Map();
const H = { 'user-agent': 'Mozilla/5.0 (GRID price reader)', accept: 'application/json' };
function aggregate(rows, n, ms) {
  if (n <= 1) return rows;
  const out = []; let cur = null;
  for (const r of rows) {
    const b = Math.floor(r[0] / ms) * ms;
    if (!cur || cur[0] !== b) { if (cur) out.push(cur); cur = [b, r[1], r[2], r[3], r[4]]; }
    else { cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.min(cur[3], r[3]); cur[4] = r[4]; }
  }
  if (cur) out.push(cur); return out;
}
async function coinbase(product, t) {
  const j = await L.getJson(`https://api.exchange.coinbase.com/products/${product}/candles?granularity=${t.cb}`, { headers: H }, 9000);
  // [time, low, high, open, close, volume], newest first
  return (j || []).map(r => [r[0] * 1000, r[3], r[2], r[1], r[4]]).sort((a, b) => a[0] - b[0]);
}
async function yahoo(sym, t) {
  const j = await L.getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${t.yi}&range=${t.yr}`, { headers: H }, 9000);
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r) return [];
  const q = r.indicators.quote[0], ts = r.timestamp || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) if (q.open[i] != null && q.close[i] != null) rows.push([ts[i] * 1000, q.open[i], q.high[i], q.low[i], q.close[i]]);
  return aggregate(rows, t.agg, t.ms).slice(-300);
}
async function gecko(mint, t) {
  const pools = await L.getJson(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`, { headers: H }, 9000);
  const pool = pools && pools.data && pools.data[0];
  if (!pool) return [];
  const addr = pool.attributes.address;
  const base = pool.relationships && pool.relationships.base_token && pool.relationships.base_token.data && pool.relationships.base_token.data.id;
  const which = base && base.endsWith(mint) ? 'base' : 'quote';
  const j = await L.getJson(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${addr}/ohlcv/${t.gk[0]}?aggregate=${t.gk[1]}&limit=300&currency=usd&token=${which}`, { headers: H }, 9000);
  const list = (j && j.data && j.data.attributes && j.data.attributes.ohlcv_list) || [];
  return aggregate(list.map(r => [r[0] * 1000, +r[1], +r[2], +r[3], +r[4]]).sort((a, b) => a[0] - b[0]), t.agg, t.ms);
}
module.exports = L.wrap(async (req, res) => {
  const q = L.query(req);
  const mint = String(q.mint || '').trim(), tf = TF[q.tf] ? q.tf : '1h', t = TF[tf];
  const under = String(q.under || '').replace(/[^A-Z.]/g, '').slice(0, 8);
  if (!L.isAddr(mint)) throw new L.Fail('bad_mint', 'That isn\'t a token address.');
  L.limit('c:' + L.ip(req), 90, 60000);
  const key = mint + tf + under, c = cache.get(key);
  if (c && L.now() - c.at < 60e3) return L.send(res, 200, c.v, 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  const pair = L.PAIRS.find(p => p.mint === mint);
  const tries = [];
  if (pair && pair.cb) tries.push(['coinbase', () => coinbase(pair.cb, t)]);
  if (under) tries.push(['yahoo', () => yahoo(under, t)]);
  tries.push(['geckoterminal', () => gecko(mint, t)]);
  let rows = [], src = null, errs = [];
  for (const [name, fn] of tries) {
    try { rows = await fn(); if (rows.length >= 20) { src = name; break; } } catch (e) { errs.push(name + ': ' + (e.status || e.message)); }
  }
  if (!src) throw new L.Fail('no_history', 'No price history for this token right now. Try another timeframe.', 502);
  const v = { ok: true, mint, tf, src, candles: rows.slice(-300).map(r => r.map((x, i) => i ? +(+x).toPrecision(10) : x)), at: L.now() };
  cache.set(key, { v, at: L.now() }); if (cache.size > 400) cache.clear();
  L.send(res, 200, v, 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
});
