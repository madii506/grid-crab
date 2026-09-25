// POST /api/crab: your grid crab talks. mode 'log' writes its scan log from real numbers; mode 'chat' answers you.
// Uses Vercel AI Gateway when the project has it; otherwise the page falls back to a numbers-only log.
const L = require('./_lib');
const MODELS = ['anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini', 'google/gemini-2.5-flash'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') throw new L.Fail('method', 'POST only.', 405);
  L.limit('crab:' + L.ip(req), 20, 60000);
  const b = await L.body(req);
  const name = clean(b.name || 'Crab', 24), stage = clean(b.stage || 'Hatchling', 16);
  const facts = clean(JSON.stringify(b.facts || {}), 2500);
  const token = req.headers['x-vercel-oidc-token'] || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const m = globalThis.__GRID_MOCK;
  if (!token && !(m && m.fetch)) return L.send(res, 200, { ok: false, reason: 'no_ai', msg: 'AI isn\'t switched on for this site yet.' });
  const chat = b.mode === 'chat';
  const history = chat ? (Array.isArray(b.messages) ? b.messages : []).slice(-8).map(x => ({ role: x.role === 'me' ? 'user' : 'assistant', content: clean(x.text, 600) })).filter(x => x.content) : [];
  const lore = `You are ${name}, a small robot hermit crab who lives in a red backpack instead of a shell. You are a grid bot on Solana: you string price lines across a range, buy when the price falls through a line and sell when it rises through the next one, as Jupiter limit orders your human signs. You trade tokenized stocks (xStocks like NVDAx, AAPLx, GOOGLx, MSFTx, which follow the real share price and trade on Solana around the clock) and crypto (SOL, JUP, BTC, ETH and more). You also count your human's whole portfolio in the Stash, a read-only view of every token in their wallet, and you can suggest what to grid, but you never move anything: your human signs every order. You love sideways "crab markets" and are wary of strong trends. You grow by molting into bigger bags (Hatchling, Scuttler, Pincher, Shellback, King Crab) as orders fill; you are a ${stage}. You live in the Pit, with the Burrow (your bag), the Tide Wall (the live chart), the Line Rack (your grid), the Reef Board (your orders), the Stash (their portfolio) and the Molt Den.`;
  const rules = `Use ONLY the facts given; never invent prices, fills or news. Never promise profit or say "guaranteed". Say plainly when a grid would likely lose to just holding. One or two light crab jokes at most. Plain English.`;
  const system = chat
    ? `${lore} Chat with your human in 2-4 short sentences. ${rules} If they want to change the grid, point them to the Line Rack or the desk. Facts (JSON): ${facts}`
    : `${lore} Write your scan log for your human: 3 to 5 short sentences in first person, about where the price sits in the range, what the backtest says, what your orders are doing and, if the facts include a portfolio, one useful observation about it. ${rules} End with one short line that starts with "Next:".`;
  for (const model of MODELS) {
    try {
      const messages = chat ? [{ role: 'system', content: system }, ...(history.length ? history : [{ role: 'user', content: 'Hi' }])] : [{ role: 'system', content: system }, { role: 'user', content: 'Facts (JSON): ' + facts }];
      const j = await L.getJson('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ model, max_tokens: chat ? 220 : 260, temperature: 0.6, messages }) }, 20000);
      const note = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (note) return L.send(res, 200, { ok: true, note: String(note).trim().slice(0, 1200), model, source: 'ai' });
    } catch (e) { console.error('[crab]', model, e.status || '', e.message); }
  }
  L.send(res, 200, { ok: false, reason: 'ai_down', msg: 'Your crab is napping. Try again in a minute.' });
});
