chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.ef !== 'offscreen-paste') return;
  const pad = document.getElementById('pad');
  let done = false;
  const finish = (v) => { if (!done) { done = true; reply(v); } };
  const onPaste = (e) => {
    e.preventDefault();
    const item = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item && item.getAsFile();
    if (!file) return finish({});
    const fr = new FileReader();
    fr.onload = () => finish({ dataUrl: fr.result });
    fr.onerror = () => finish({});
    fr.readAsDataURL(file);
  };
  document.addEventListener('paste', onPaste, { once: true });
  pad.focus();
  if (!document.execCommand('paste')) finish({});
  setTimeout(() => finish({}), 1500);
  return true;
});
