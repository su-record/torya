/// <reference types="chrome" />
import type {
  ConsoleErrorPayload,
  DomErrorPayload,
  ExtMsg,
  NetworkErrorPayload,
} from '@/types';

const TAG = '[torya:cs]';
console.log(TAG, 'content script loaded', { rid: chrome.runtime?.id });

// `chrome.runtime` is gone after the extension is reloaded but pages still
// hold the old content script. Touching it then throws synchronously, which
// would otherwise surface as "Uncaught Error: Extension context invalidated"
// in the page console.
function safeSend(msg: ExtMsg): void {
  if (!chrome.runtime?.id) {
    console.warn(TAG, 'drop: extension context invalidated — reload the page');
    return;
  }
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch((e: unknown) =>
        console.warn(TAG, 'sendMessage failed', e),
      );
    }
  } catch (e) {
    console.warn(TAG, 'sendMessage threw', e);
  }
}

// Inject page-world script for accurate window error capture.
try {
  const inject = document.createElement('script');
  inject.src = chrome.runtime.getURL('src/content/inject.js');
  inject.async = false;
  (document.head || document.documentElement).appendChild(inject);
  inject.onload = () => inject.remove();
} catch {
  /* extension context invalidated at injection time */
}

// Bridge between page world (via window message) and extension service worker.
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const data = ev.data as { __torya?: { kind: string } & Record<string, unknown> };
  if (!data || !data.__torya) return;
  const t = data.__torya;
  const origin = location.origin;
  const url = location.href;

  let msg: ExtMsg;
  if (t.kind === 'dom') {
    const payload: DomErrorPayload = {
      message: String(t.message ?? 'DOM error'),
      snippet: t.snippet as string | undefined,
      origin,
      url,
      ts: Number(t.ts ?? Date.now()),
    };
    msg = { type: 'capture/dom', payload };
  } else if (t.kind === 'fetch') {
    const payload: NetworkErrorPayload = {
      method: String(t.method ?? 'GET'),
      url: String(t.url ?? ''),
      status: Number(t.status ?? 0),
      origin,
      pageUrl: url,
      ts: Number(t.ts ?? Date.now()),
    };
    msg = { type: 'capture/network', payload };
  } else {
    const payload: ConsoleErrorPayload = {
      kind: (t.kind as 'error' | 'rejection') ?? 'error',
      message: String(t.message ?? 'Error'),
      filename: t.filename as string | undefined,
      lineno: t.lineno as number | undefined,
      colno: t.colno as number | undefined,
      stack: t.stack as string | undefined,
      origin,
      url,
      ts: Number(t.ts ?? Date.now()),
    };
    msg = { type: 'capture/console', payload };
  }
  safeSend(msg);
});
