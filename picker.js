(() => {
  const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'jfif', 'svg']);
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    opus: 'audio/ogg', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  const SKIP = /\.(crdownload|part|tmp|ini|lnk)$/i;
  const MAX_THUMB_BYTES = 40 * 1024 * 1024;

  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const selected = new Map();           // key -> {getFile}
  let port = null, opts = { accept: '', multiple: false };

  const ext = (name) => (name.match(/\.([^.\\/]+)$/) || [, ''])[1].toLowerCase();
  const mimeOf = (name) => MIME[ext(name)] || 'application/octet-stream';
  const baseName = (p) => p.split(/[\\/]/).pop();

  function accepts(name, mime) {
    const list = (opts.accept || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!list.length) return true;
    return list.some((a) => a.startsWith('.') ? name.toLowerCase().endsWith(a)
      : a.endsWith('/*') ? mime.startsWith(a.slice(0, -1)) : mime === a);
  }

  function fileUrl(path) {
    const parts = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
    return 'file:///' + parts.map((p, i) => (i === 0 && /^[a-z]:$/i.test(p)) ? p : encodeURIComponent(p)).join('/');
  }

  function xhr(url, type) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = type || 'text';
      x.onload = () => (x.status === 200 || x.status === 0) && x.response != null ? res(x.response) : rej(new Error('HTTP ' + x.status));
      x.onerror = () => rej(new Error('xhr falhou: ' + url));
      x.send();
    });
  }

  // Lê a listagem de pasta que o Chromium gera para file:///pasta/
  async function listFolder(folder) {
    const html = await xhr(fileUrl(folder) + '/');
    const out = [];
    const re = /addRow\((.*)\);/g;
    let m;
    while ((m = re.exec(html))) {
      let row;
      try { row = JSON.parse('[' + m[1] + ']'); } catch { continue; }
      const [name, , isDir, size, , date] = row;
      if (isDir || name === '..' || SKIP.test(name)) continue;
      const t = Number(date) || 0;
      out.push({ path: folder.replace(/[\\/]+$/, '') + '\\' + name, name, size: Number(size) || 0, time: t > 1e12 ? t : t * 1000 });
    }
    return out;
  }

  async function fromHistory() {
    if (!chrome.downloads) return [];
    const items = await chrome.downloads.search({ state: 'complete', exists: true, orderBy: ['-startTime'], limit: 60 });
    return items.filter((d) => d.filename && !SKIP.test(d.filename)).map((d) => ({
      path: d.filename, name: baseName(d.filename), size: d.fileSize || 0,
      time: Date.parse(d.endTime || d.startTime) || 0, mime: d.mime
    }));
  }

  async function recentFiles(settings) {
    const all = new Map();
    const folders = await efResolveFolders(settings.folders.filter(Boolean));
    const jobs = folders.map((f) => listFolder(f).catch(() => []));
    if (settings.useDownloadHistory) jobs.push(fromHistory().catch(() => []));
    for (const list of await Promise.all(jobs)) {
      for (const f of list) {
        const k = f.path.toLowerCase();
        if (!all.has(k) || all.get(k).time < f.time) all.set(k, f);
      }
    }
    return [...all.values()]
      .map((f) => Object.assign(f, { mime: (f.mime && f.mime !== 'application/octet-stream') ? f.mime : mimeOf(f.name) }))
      .filter((f) => accepts(f.name, f.mime))
      .sort((a, b) => b.time - a.time)
      .slice(0, settings.maxItems);
  }

  // ---------- área de transferência ----------
  async function waitFocus(ms) {
    const end = Date.now() + ms;
    while (!document.hasFocus() && Date.now() < end) { window.focus(); await new Promise((r) => setTimeout(r, 30)); }
  }

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

  // 1º: documento offscreen da extensão (não depende do site); 2º: Clipboard API direta.
  async function clipboardViaOffscreen() {
    const r = await chrome.runtime.sendMessage({ ef: 'clipboard' });
    return r && r.dataUrl ? (await fetch(r.dataUrl)).blob() : null;
  }
  async function clipboardViaApi() {
    await waitFocus(400);
    for (const it of await navigator.clipboard.read()) {
      const t = it.types.find((t) => t.startsWith('image/'));
      if (t) return it.getType(t);
    }
    return null;
  }
  async function clipboardImage() {
    try { const b = await withTimeout(clipboardViaOffscreen(), 2500); if (b) return b; } catch {}
    try { return await withTimeout(clipboardViaApi(), 1500); } catch { return null; }
  }

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');

  // ---------- UI ----------
  function section(title) {
    const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = title;
    const g = document.createElement('div'); g.className = 'grid';
    grid.append(lab, g);
    return g;
  }

  function tile(parent, name, key, getFile) {
    const b = document.createElement('button');
    b.className = 'tile'; b.title = name;
    b.innerHTML = '<div class="thumb"></div><div class="name"></div>';
    b.querySelector('.name').textContent = name;
    b.addEventListener('click', async (e) => {
      if (opts.multiple && (e.ctrlKey || e.metaKey || selected.size)) {
        if (selected.has(key)) { selected.delete(key); b.classList.remove('sel'); }
        else { selected.set(key, getFile); b.classList.add('sel'); }
        updateMulti();
        return;
      }
      b.disabled = true;
      try { send([await getFile()]); } catch (err) { b.disabled = false; alertTile(b, err); }
    });
    parent.appendChild(b);
    return b.querySelector('.thumb');
  }

  function alertTile(b, err) {
    b.querySelector('.name').textContent = 'Erro ao ler';
    console.error(err);
  }

  function updateMulti() {
    $('#multi').hidden = selected.size === 0;
    $('#count').textContent = selected.size + (selected.size === 1 ? ' selecionado' : ' selecionados');
    reportHeight();
  }

  function extBadge(el, name) {
    const s = document.createElement('span'); s.className = 'ext'; s.textContent = ext(name) || 'arquivo';
    el.replaceChildren(s);
  }

  async function drawThumb(el, blob) {
    try {
      const bmp = await createImageBitmap(blob, { resizeWidth: 220, resizeQuality: 'medium' });
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      el.replaceChildren(c);
    } catch {
      // SVG e formatos que createImageBitmap não decodifica: usa <img>
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
      el.replaceChildren(img);
    }
    return true;
  }

  function send(files) {
    if (port) port.postMessage({ type: 'files', files });
  }

  function reportHeight() {
    if (!port) return;
    const app = $('#app');
    const h = $('header').offsetHeight + grid.scrollHeight + ($('#multi').hidden ? 0 : $('#multi').offsetHeight) + 6;
    port.postMessage({ type: 'height', h: Math.ceil(h) });
    void app;
  }

  async function runPool(tasks, n) {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) await tasks[i++](); }));
  }

  async function render() {
    const settings = await efLoadSettings();
    const clipP = accepts('clipboard.png', 'image/png') ? clipboardImage() : Promise.resolve(null);
    const filesP = recentFiles(settings);

    const clip = await clipP;
    if (clip) {
      const g = section('Área de transferência');
      const name = 'clipboard_' + stamp() + '.' + (clip.type.split('/')[1] || 'png');
      const th = tile(g, 'Imagem copiada', 'clip', async () => new File([clip], name, { type: clip.type || 'image/png', lastModified: Date.now() }));
      await drawThumb(th, clip);
    }

    const files = await filesP;
    if (files.length) {
      const g = section('Recentes');
      const tasks = [];
      for (const f of files) {
        const getFile = async () => {
          const blob = await xhr(fileUrl(f.path), 'blob');
          return new File([blob], f.name, { type: f.mime, lastModified: f.time || Date.now() });
        };
        const th = tile(g, f.name, f.path, getFile);
        extBadge(th, f.name);
        if (IMG.has(ext(f.name)) && f.size < MAX_THUMB_BYTES) {
          tasks.push(async () => { try { await drawThumb(th, await xhr(fileUrl(f.path), 'blob')); } catch {} });
        }
      }
      reportHeight();
      runPool(tasks, 4);
    } else if (!clip) {
      const p = document.createElement('div'); p.className = 'empty';
      chrome.extension.isAllowedFileSchemeAccess((ok) => {
        p.innerHTML = ok
          ? 'Nada recente por aqui. Use <b>Exibir todos os arquivos</b>.'
          : 'Para ver os arquivos recentes, abra <code>brave://extensions</code>, clique em <b>Detalhes</b> no Easy Files e ative <b>Permitir acesso a URLs de arquivo</b>.';
        reportHeight();
      });
      grid.appendChild(p);
    }
    reportHeight();
  }

  // ---------- botões ----------
  $('#all').addEventListener('click', () => port && port.postMessage({ type: 'native' }));
  $('#close').addEventListener('click', () => port && port.postMessage({ type: 'close' }));
  $('#opts').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#attach').addEventListener('click', async () => {
    const files = [];
    for (const get of selected.values()) { try { files.push(await get()); } catch {} }
    if (files.length) send(files);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && port) port.postMessage({ type: 'close' }); });
  addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])];
    if (f.length) { e.preventDefault(); send(opts.multiple ? f : [f[0]]); }
  });

  // ---------- handshake com o content script ----------
  const nonce = location.hash.slice(1);
  addEventListener('message', function onInit(e) {
    const d = e.data;
    if (!d || d.ef !== 'init' || d.nonce !== nonce || !e.ports[0]) return;
    removeEventListener('message', onInit);
    port = e.ports[0];
    opts = { accept: d.accept || '', multiple: !!d.multiple };
    render().catch((err) => {
      console.error(err);
      const p = document.createElement('div'); p.className = 'empty';
      p.textContent = 'Erro: ' + (err && err.message || err);
      grid.appendChild(p); reportHeight();
    });
  });
})();
