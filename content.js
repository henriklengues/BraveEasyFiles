// Mundo isolado: desenha o painel (iframe da extensão) e faz a ponte com main.js.
(() => {
  if (window.__easyFilesContent) return;
  window.__easyFilesContent = true;

  const TAG = '__easyfiles_';
  const PICKER_URL = chrome.runtime.getURL('picker.html');
  const ORIGIN = 'chrome-extension://' + chrome.runtime.id;  // origem real do iframe (a URL dinâmica redireciona p/ ela)

  let host = null, frame = null, port = null, curId = null, anchor = null;
  let W = 620, H = 400;

  const post = (type, extra) =>
    window.postMessage(Object.assign({ [TAG]: type, id: curId }, extra || {}), '*');

  function close(cancel) {
    if (!host) return;
    if (cancel && curId != null) post('cancel');
    host.remove();
    try { port && port.close(); } catch {}
    host = frame = port = null; curId = null; anchor = null;
    removeEventListener('pointerdown', onOutside, true);
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
  }

  function onOutside(e) { if (host && !e.composedPath().includes(host)) close(true); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }

  function place() {
    if (!host) return;
    const vw = innerWidth, vh = innerHeight, m = 8;
    const w = Math.min(W, vw - 2 * m), h = Math.min(H, vh - 2 * m);
    let x, y;
    if (anchor) {
      x = anchor.x + anchor.w - w;                    // alinha à direita do botão
      if (x < m) x = anchor.x;
      y = anchor.y - h - m;                           // prefere acima, como no Opera
      if (y < m) y = anchor.y + anchor.h + m;
    } else { x = (vw - w) / 2; y = (vh - h) / 2; }
    x = Math.max(m, Math.min(x, vw - w - m));
    y = Math.max(m, Math.min(y, vh - h - m));
    Object.assign(host.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function open(d) {
    close(true);
    curId = d.id;
    anchor = d.rect || (d.pt ? { x: d.pt.x, y: d.pt.y, w: 0, h: 0 } : null);
    H = 400;

    host = document.createElement('easy-files-host');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;';
    const root = host.attachShadow({ mode: 'closed' });
    frame = document.createElement('iframe');
    frame.allow = 'clipboard-read';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;border-radius:12px;' +
      'box-shadow:0 14px 44px rgba(0,0,0,.5);background:transparent;color-scheme:dark;';
    const nonce = crypto.randomUUID();
    frame.src = PICKER_URL + '#' + nonce;
    frame.addEventListener('load', () => {
      const ch = new MessageChannel();
      port = ch.port1;
      port.onmessage = onPicker;
      frame.contentWindow.postMessage({ ef: 'init', nonce, accept: d.accept, multiple: d.multiple }, ORIGIN, [ch.port2]);
      frame.focus();
    }, { once: true });
    root.appendChild(frame);
    (document.documentElement || document.body).appendChild(host);
    place();

    setTimeout(() => {
      addEventListener('pointerdown', onOutside, true);
      addEventListener('keydown', onKey, true);
      addEventListener('resize', place);
    }, 0);
  }

  function onPicker(e) {
    const m = e.data || {};
    if (m.type === 'files') { post('files', { files: m.files }); close(false); }
    else if (m.type === 'native') { post('native'); close(false); }
    else if (m.type === 'close') close(true);
    else if (m.type === 'height') { H = Math.max(140, Math.min(560, m.h | 0)); place(); }
  }

  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source === window && d && typeof d === 'object' && d[TAG] === 'open') open(d);
  });
})();
