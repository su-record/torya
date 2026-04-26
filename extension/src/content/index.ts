/// <reference types="chrome" />
import type { ConsoleErrorPayload, DomErrorPayload, ExtMsg } from '@/types';

// Inject page-world script for accurate window error capture.
const inject = document.createElement('script');
inject.src = chrome.runtime.getURL('src/content/inject.js');
inject.async = false;
(document.head || document.documentElement).appendChild(inject);
inject.onload = () => inject.remove();

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
  chrome.runtime.sendMessage(msg).catch(() => undefined);
});
