// Roda no "mundo" da página: intercepta a abertura do seletor de arquivos.
(() => {
  if (window.__easyFilesMain) return;
  window.__easyFilesMain = true;

  const TAG = '__easyfiles_';
  const pending = new Map();
  let seq = 0;
  let bypass = false;
  let shiftDown = false;
  let lastPt = null;

  const proto = HTMLInputElement.prototype;
  const origClick = proto.click;
  const origShowPicker = proto.showPicker;

  addEventListener('pointerdown', (e) => { lastPt = { x: e.clientX, y: e.clientY }; shiftDown = e.shiftKey; }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftDown = true; }, true);
  addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftDown = false; }, true);
  addEventListener('blur', () => { shiftDown = false; });

  const isFileInput = (el) =>
    el instanceof HTMLInputElement && el.type === 'file' && !el.disabled &&
    !el.hasAttribute('webkitdirectory') && !el.hasAttribute('directory');

  function visibleRect(input) {
    if (!input.isConnected) return null;
    const r = input.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  function request(input) {
    const id = ++seq;
    pending.set(id, input);
    window.postMessage({
      [TAG]: 'open', id,
      accept: input.accept || '',
      multiple: !!input.multiple,
      rect: visibleRect(input),
      pt: lastPt
    }, '*');
  }

  function openNative(input) {
    bypass = true;
    try { origClick.call(input); } finally { bypass = false; }
  }

  proto.click = function () {
    if (!bypass && !shiftDown && isFileInput(this)) { request(this); return; }
    return origClick.call(this);
  };

  if (origShowPicker) {
    proto.showPicker = function () {
      if (!bypass && !shiftDown && isFileInput(this)) { request(this); return; }
      return origShowPicker.call(this);
    };
  }

  // Cliques diretos no <input type=file> ou em <label> ligado a ele.
  addEventListener('click', (e) => {
    if (bypass || e.shiftKey || e.defaultPrevented) return;
    const t = e.composedPath()[0];
    if (isFileInput(t)) { e.preventDefault(); request(t); }
  }, true);

  addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || !d[TAG] || d[TAG] === 'open') return;
    const input = pending.get(d.id);
    if (!input) return;
    pending.delete(d.id);

    if (d[TAG] === 'files') {
      const dt = new DataTransfer();
      for (const f of d.files || []) if (f instanceof File) dt.items.add(f);
      if (!input.multiple && dt.files.length > 1) { const one = new DataTransfer(); one.items.add(dt.files[0]); input.files = one.files; }
      else input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (d[TAG] === 'native') {
      openNative(input);
    } else if (d[TAG] === 'cancel') {
      input.dispatchEvent(new Event('cancel', { bubbles: false }));
    }
  });
})();
