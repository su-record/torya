// Page-world injected script. Runs in the page's JS context so it can see
// real window errors and unhandled rejections. Posts to the content script
// via window.postMessage with a tagged envelope.
(() => {
  const post = (payload) => {
    try {
      window.postMessage({ __torya: payload }, '*');
    } catch {}
  };

  window.addEventListener('error', (ev) => {
    post({
      kind: 'error',
      message: ev.message || String(ev.error || 'Error'),
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      stack: ev.error && ev.error.stack ? String(ev.error.stack) : undefined,
      ts: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    post({
      kind: 'rejection',
      message:
        reason && reason.message
          ? `Unhandled rejection: ${reason.message}`
          : `Unhandled rejection: ${String(reason)}`,
      stack: reason && reason.stack ? String(reason.stack) : undefined,
      ts: Date.now(),
    });
  });
})();
