// Padrões (podem ser alterados na página de configurações da extensão).
// "~" é a pasta do usuário do Windows (ex.: C:\Users\<você>), detectada automaticamente.
const EF_DEFAULTS = {
  folders: [
    '~\\Downloads',
    '~\\Pictures\\Screenshots'
  ],
  maxItems: 20,
  useDownloadHistory: true
};

async function efLoadSettings() {
  try {
    const s = await chrome.storage.local.get(EF_DEFAULTS);
    return Object.assign({}, EF_DEFAULTS, s);
  } catch { return Object.assign({}, EF_DEFAULTS); }
}

function efXhrText(url) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.onload = () => (x.status === 0 || x.status === 200) ? res(x.responseText) : rej(new Error('HTTP ' + x.status));
    x.onerror = () => rej(new Error('xhr falhou: ' + url));
    x.send();
  });
}

// Descobre a pasta do usuário: 1) pelo histórico de downloads; 2) pela única pasta
// em C:\Users cujo Downloads o usuário atual consegue ler (as dos outros são bloqueadas pelo Windows).
async function efDetectHome() {
  const cached = (await chrome.storage.local.get('homeDir')).homeDir;
  if (cached) return cached;

  let home = null;
  try {
    const items = await chrome.downloads.search({ limit: 30, orderBy: ['-startTime'] });
    for (const d of items) {
      const m = (d.filename || '').match(/^([a-z]:\\Users\\[^\\]+)\\/i);
      if (m) { home = m[1]; break; }
    }
  } catch {}

  if (!home) {
    try {
      const skip = new Set(['public', 'default', 'default user', 'all users', 'defaultapppool']);
      const html = await efXhrText('file:///C:/Users/');
      const names = [...html.matchAll(/addRow\((.*)\);/g)]
        .map((m) => { try { return JSON.parse('[' + m[1] + ']'); } catch { return null; } })
        .filter((r) => r && r[2] && r[0] !== '..' && !skip.has(String(r[0]).toLowerCase()))
        .map((r) => r[0]);
      for (const n of names) {
        try { await efXhrText('file:///C:/Users/' + encodeURIComponent(n) + '/Downloads/'); home = 'C:\\Users\\' + n; break; } catch {}
      }
    } catch {}
  }

  if (home) await chrome.storage.local.set({ homeDir: home });
  return home;
}

async function efResolveFolders(folders) {
  const home = folders.some((f) => f.startsWith('~')) ? await efDetectHome() : null;
  return folders
    .map((f) => f.startsWith('~') ? (home ? home + f.slice(1) : null) : f)
    .filter(Boolean);
}
