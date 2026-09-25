// GET /api/token?q=symbol|name|mint: find any Solana token to run a grid on (Jupiter token search).
const L = require('./_lib');
module.exports = L.wrap(async (req, res) => {
  const q = String(L.query(req).q || '').trim().slice(0, 64);
  if (q.length < 2) throw new L.Fail('short', 'Type at least two letters or paste a mint.');
  L.limit('tk:' + L.ip(req), 40, 60000);
  const arr = await L.jup('/tokens/v2/search?query=' + encodeURIComponent(q)).catch(() => []);
  const tokens = (Array.isArray(arr) ? arr : []).filter(t => t && t.id && t.id !== L.USDC && t.decimals != null).slice(0, 10).map(t => ({
    mint: t.id, symbol: t.symbol, name: t.name, icon: t.icon || null, decimals: t.decimals, price: t.usdPrice ?? null,
    change24h: t.stats24h && t.stats24h.priceChange != null ? t.stats24h.priceChange : null, verified: !!t.isVerified, liquidity: t.liquidity ?? null,
    kind: String(t.id).startsWith('Xs') ? 'stock' : 'crypto',
  }));
  L.send(res, 200, { ok: true, tokens }, 'public, max-age=0, s-maxage=30');
});
