(async () => {
  const s = await efLoadSettings();
  const $ = (id) => document.getElementById(id);
  $('folders').value = s.folders.join('\n');
  $('max').value = s.maxItems;
  $('hist').checked = s.useDownloadHistory;
  chrome.extension.isAllowedFileSchemeAccess(async (ok) => {
    if (!ok) {
      $('perm').innerHTML = '⚠ Acesso a arquivos desativado: em <b>brave://extensions</b> → Easy Files → Detalhes, ative <b>Permitir acesso a URLs de arquivo</b>.';
      return;
    }
    const home = await efDetectHome();
    $('perm').textContent = 'Acesso a arquivos: ativado. ~ = ' + (home || '(não detectado — use caminhos completos)');
  });
  $('save').addEventListener('click', async () => {
    await chrome.storage.local.set({
      folders: $('folders').value.split('\n').map((l) => l.trim()).filter(Boolean),
      maxItems: Math.max(4, Math.min(100, parseInt($('max').value, 10) || 20)),
      useDownloadHistory: $('hist').checked
    });
    $('ok').textContent = 'Salvo!';
    setTimeout(() => { $('ok').textContent = ''; }, 1500);
  });
})();
