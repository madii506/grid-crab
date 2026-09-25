// Jupiter limit orders (Trigger API v1), built for the user's own wallet to sign. GRID never holds keys or funds.
// GET  /api/trigger?user=&status=active|history&page=   the wallet's orders
// POST /api/trigger {op:'create', inputMint, outputMint, maker, makingAmount, takingAmount, expiredAt?} -> {order, transaction, requestId}
// POST /api/trigger {op:'execute', signedTransaction, requestId}                                  -> {signature, status}
// POST /api/trigger {op:'cancel', maker, order} | {op:'cancelAll', maker, orders:[]}             -> unsigned cancel transaction(s)
const L = require('./_lib');
const raw = s => /^[1-9][0-9]{0,30}$/.test(String(s || ''));
const jfail = (e, fallback) => { const b = e && e.body; const m = b && (b.error || b.message || b.cause); throw new L.Fail('jupiter', m ? String(m).slice(0, 220) : fallback, 502); };
module.exports = L.wrap(async (req, res) => {
  if (req.method === 'GET') {
    const q = L.query(req);
    if (!L.isAddr(q.user)) throw new L.Fail('bad_user', 'Connect a wallet first.');
    const status = q.status === 'history' ? 'history' : 'active';
    const page = Math.max(1, Math.min(50, parseInt(q.page, 10) || 1));
    L.limit('to:' + L.ip(req), 60, 60000);
    const j = await L.jup(`/trigger/v1/getTriggerOrders?user=${q.user}&orderStatus=${status}&page=${page}`).catch(e => jfail(e, 'Couldn\'t read your orders from Jupiter.'));
    return L.send(res, 200, { ok: true, status, ...j });
  }
  if (req.method !== 'POST') throw new L.Fail('method', 'GET or POST.', 405);
  L.limit('tp:' + L.ip(req), 120, 60000);
  const b = await L.body(req);
  const post = (path, payload) => L.jup(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (b.op === 'create') {
    if (!L.isAddr(b.inputMint) || !L.isAddr(b.outputMint) || b.inputMint === b.outputMint) throw new L.Fail('bad_pair', 'Pick two different tokens.');
    if (!L.isAddr(b.maker)) throw new L.Fail('bad_user', 'Connect a wallet first.');
    if (!raw(b.makingAmount) || !raw(b.takingAmount)) throw new L.Fail('bad_amount', 'Order amounts must be whole base units.');
    const params = { makingAmount: String(b.makingAmount), takingAmount: String(b.takingAmount) };
    if (b.expiredAt && /^[0-9]{10}$/.test(String(b.expiredAt))) params.expiredAt = String(b.expiredAt);
    const j = await post('/trigger/v1/createOrder', { inputMint: b.inputMint, outputMint: b.outputMint, maker: b.maker, payer: b.maker, params, computeUnitPrice: 'auto', wrapAndUnwrapSol: true })
      .catch(e => jfail(e, 'Jupiter wouldn\'t build this order.'));
    if (!j || !j.transaction) throw new L.Fail('jupiter', (j && j.error) || 'Jupiter wouldn\'t build this order.', 502);
    return L.send(res, 200, { ok: true, order: j.order, transaction: j.transaction, requestId: j.requestId });
  }
  if (b.op === 'execute') {
    if (!/^[A-Za-z0-9+/=]{100,4000}$/.test(String(b.signedTransaction || ''))) throw new L.Fail('bad_tx', 'That isn\'t a signed transaction.');
    const j = await post('/trigger/v1/execute', { signedTransaction: b.signedTransaction, requestId: String(b.requestId || '') }).catch(e => jfail(e, 'Jupiter didn\'t accept the signed order.'));
    return L.send(res, 200, { ok: j && j.status !== 'Failed', ...j });
  }
  if (b.op === 'cancel') {
    if (!L.isAddr(b.maker) || !L.isAddr(b.order)) throw new L.Fail('bad_order', 'Unknown order.');
    const j = await post('/trigger/v1/cancelOrder', { maker: b.maker, order: b.order, computeUnitPrice: 'auto' }).catch(e => jfail(e, 'Jupiter couldn\'t build the cancel.'));
    return L.send(res, 200, { ok: true, transaction: j.transaction, requestId: j.requestId });
  }
  if (b.op === 'cancelAll') {
    if (!L.isAddr(b.maker)) throw new L.Fail('bad_user', 'Connect a wallet first.');
    const orders = Array.isArray(b.orders) ? b.orders.filter(L.isAddr).slice(0, 100) : [];
    const payload = { maker: b.maker, computeUnitPrice: 'auto' }; if (orders.length) payload.orders = orders;
    const j = await post('/trigger/v1/cancelOrders', payload).catch(e => jfail(e, 'Jupiter couldn\'t build the cancels.'));
    return L.send(res, 200, { ok: true, transactions: j.transactions || [], requestId: j.requestId });
  }
  throw new L.Fail('bad_op', 'Unknown order action.');
});
