// Wallets: Phantom, Backpack, Solflare. GRID only asks them to sign; it never sees a key.
(function () {
  const { api, toast, store } = window.I;
  const PROVIDERS = () => [
    { id: 'phantom', name: 'Phantom', get: () => (window.phantom && window.phantom.solana) || (window.solana && window.solana.isPhantom && window.solana) },
    { id: 'backpack', name: 'Backpack', get: () => window.backpack && (window.backpack.solana || window.backpack) },
    { id: 'solflare', name: 'Solflare', get: () => window.solflare && window.solflare.isSolflare && window.solflare },
  ].map(p => ({ ...p, p: p.get() })).filter(p => p.p);
  const W = { provider: null, address: null, id: null, listeners: [] };
  const emit = () => W.listeners.forEach(f => { try { f(W); } catch {} });
  async function loadWeb3() {
    if (window.solanaWeb3) return window.solanaWeb3;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/assets/vendor/web3.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.solanaWeb3;
  }
  const b64ToBytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const bytesToB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  async function connect(id) {
    const pr = PROVIDERS().find(p => p.id === id); if (!pr) { toast('That wallet isn\'t installed in this browser.'); return false; }
    try {
      const r = await pr.p.connect();
      W.provider = pr.p; W.address = ((r && r.publicKey) || pr.p.publicKey).toString(); W.id = id;
      store.set('wallet', id); emit(); return true;
    } catch { toast('The wallet didn\'t connect.'); return false; }
  }
  async function reconnect() {
    const id = store.get('wallet'); if (!id) return;
    const pr = PROVIDERS().find(p => p.id === id); if (!pr) return;
    try { const r = await pr.p.connect({ onlyIfTrusted: true }); const pk = ((r && r.publicKey) || pr.p.publicKey || '').toString(); if (pk) { W.provider = pr.p; W.address = pk; W.id = id; emit(); } } catch {}
  }
  async function disconnect() { try { await W.provider && W.provider.disconnect && W.provider.disconnect(); } catch {} W.provider = null; W.address = null; W.id = null; store.del('wallet'); emit(); }
  // sign a batch of base64 transactions in ONE wallet prompt when the wallet supports it
  async function signAll(b64s) {
    if (!W.provider) throw new Error('Connect a wallet first.');
    const W3 = await loadWeb3();
    const txs = b64s.map(b => W3.VersionedTransaction.deserialize(b64ToBytes(b)));
    let signed;
    if (W.provider.signAllTransactions) signed = await W.provider.signAllTransactions(txs);
    else { signed = []; for (const t of txs) signed.push(await W.provider.signTransaction(t)); }
    return signed.map(t => bytesToB64(t.serialize()));
  }
  async function signAndSend(b64) {
    const W3 = await loadWeb3();
    const tx = W3.VersionedTransaction.deserialize(b64ToBytes(b64));
    let sig;
    if (W.provider.signAndSendTransaction) { const r = await W.provider.signAndSendTransaction(tx); sig = typeof r === 'string' ? r : (r.signature || r.txid); }
    if (!sig) { const s = await W.provider.signTransaction(tx); const r = await api('tx', { raw: bytesToB64(s.serialize()) }); if (!r.ok) throw new Error(r.msg); sig = r.sig; }
    return sig;
  }
  async function confirm(sig, tries = 40) {
    for (let k = 0; k < tries; k++) { await new Promise(r => setTimeout(r, 1500)); const r = await api('tx?sig=' + encodeURIComponent(sig)); if (r.ok && r.status !== 'pending') return r.status; }
    return 'pending';
  }
  function picker(onDone) {
    const list = PROVIDERS();
    const box = document.createElement('div'); box.className = 'modal'; box.setAttribute('role', 'dialog');
    box.innerHTML = `<div class="sheet"><button class="x" aria-label="Close">×</button><h3>Connect a wallet</h3>
      ${list.length ? list.map(p => `<button class="wbtn" data-id="${p.id}"><span class="wlogo ${p.id}"></span>${p.name}</button>`).join('') : '<p class="mute">No Solana wallet found in this browser. Install Phantom, Backpack or Solflare, then reload.</p>'}
      <p class="fine">GRID asks your wallet to sign orders. It never sees your keys and can't move anything on its own.</p></div>`;
    document.body.appendChild(box); requestAnimationFrame(() => box.classList.add('on'));
    const close = () => { box.classList.remove('on'); setTimeout(() => box.remove(), 200); };
    box.addEventListener('click', async e => {
      if (e.target === box || e.target.closest('.x')) return close();
      const b = e.target.closest('.wbtn'); if (!b) return;
      const ok = await connect(b.dataset.id); close(); if (ok && onDone) onDone();
    });
  }
  window.Wallet = { W, PROVIDERS, connect, reconnect, disconnect, signAll, signAndSend, confirm, picker, on: f => W.listeners.push(f), loadWeb3 };
})();
