const urlInput = document.getElementById('url');
const outInput = document.getElementById('outdir');
const startBtn = document.getElementById('start');
const cancelBtn = document.getElementById('cancel');
const log = document.getElementById('log');

function append(msg) {
  if (log) {
    log.value += msg + '\n';
    log.scrollTop = log.scrollHeight;
  }
}

startBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  const out = outInput.value.trim() || undefined;
  if (!url) { append('Please enter a URL'); return; }
  append('Starting extractor...');
  window.api.startExtract({ url, outdir: out });
});

cancelBtn.addEventListener('click', () => window.close());

window.api.onOutput((msg) => { append(msg); });
window.api.onDone((code) => { append('\nDone. Exit code: ' + code); });
