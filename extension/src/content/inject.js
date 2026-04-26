// Page-world injected script. Runs in the page's JS context so it can see
// real window errors and unhandled rejections. Posts to the content script
// via window.postMessage with a tagged envelope.
(() => {
  const post = (payload) => {
    try {
      window.postMessage({ __torya: payload }, '*');
    } catch {}
  };

  // Capture phase listener — needed to see resource load errors (img, script,
  // link, etc.) which don't bubble. Distinguish JS errors (target === window)
  // from resource errors (target is a DOM element).
  window.addEventListener(
    'error',
    (ev) => {
      const t = ev.target;
      if (t && t !== window && t.tagName) {
        const tag = t.tagName.toLowerCase();
        const url = t.src || t.href || '';
        post({
          kind: 'dom',
          message: `Failed to load <${tag}>${url ? ': ' + url : ''}`,
          snippet: t.outerHTML ? String(t.outerHTML).slice(0, 240) : undefined,
          ts: Date.now(),
        });
        return;
      }
      post({
        kind: 'error',
        message: ev.message || String(ev.error || 'Error'),
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: ev.error && ev.error.stack ? String(ev.error.stack) : undefined,
        ts: Date.now(),
      });
    },
    true
  );

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
