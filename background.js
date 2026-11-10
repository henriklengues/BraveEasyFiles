// Fallback para ler imagem da área de transferência via documento offscreen.
let creating = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Ler a imagem copiada para oferecer como anexo'
    }).finally(() => { creating = null; });
  }
  await creating;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.ef === 'clipboard') {
    (async () => {
      try {
        await ensureOffscreen();
        const r = await chrome.runtime.sendMessage({ ef: 'offscreen-paste' });
        reply(r || {});
      } catch (e) { reply({ error: String(e) }); }
      finally { try { await chrome.offscreen.closeDocument(); } catch {} }
    })();
    return true;
  }
});
