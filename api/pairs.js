// GET /api/pairs: every token GRID can run against USDC, with live prices. Crypto from a fixed list, tokenized stocks (xStocks) resolved live.
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  const stocks = await L.stockList();
  const crypto = L.PAIRS.map(p => ({ ...p, kind: 'crypto', hist: p.cb ? 'coinbase' : 'gecko' }));
  const st = stocks.map(s => ({ mint: s.mint, symbol: s.symbol, name: s.name, decimals: s.decimals, icon: s.icon, kind: 'stock', hist: 'yahoo', under: s.symbol.replace(/x$/, '') }));
  const all = [...crypto, ...st];
  const mints = all.map(p => p.mint);
  const [px, meta] = await Promise.all([L.prices([...mints, L.USDC]), L.tokenMeta(crypto.map(p => p.mint))]);
  const pairs = all.map(p => ({ ...p, icon: p.icon || (meta[p.mint] || {}).icon || null, decimals: p.decimals ?? (meta[p.mint] || {}).decimals, price: px[p.mint] ? px[p.mint].usd : null, change24h: px[p.mint] ? px[p.mint].change24h : null }));
  const C = L.CFG;
  L.send(res, 200, { ok: true, cfg: { name: C.name, ticker: C.ticker, ca: C.ca, x: C.x }, usdc: { mint: L.USDC, decimals: 6, price: px[L.USDC] ? px[L.USDC].usd : 1 }, pairs, at: L.now() }, 'public, max-age=0, s-maxage=20, stale-while-revalidate=60');
});
