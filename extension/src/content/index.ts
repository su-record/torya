/// <reference types="chrome" />
import type { ConsoleErrorPayload, ExtMsg } from '@/types';

// Inject page-world script for accurate window error capture.
const inject = document.createElement('script');
inject.src = chrome.runtime.getURL('src/content/inject.js');
inject.async = false;
(document.head || document.documentElement).appendChild(inject);
inject.onload = () => inject.remove();

// Bridge between page world (via window message) and extension service worker.
window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const data = ev.data as { __torya?: ConsoleErrorPayload };
  if (!data || !data.__torya) return;
  const payload: ConsoleErrorPayload = {
    ...data.__torya,
    origin: location.origin,
    url: location.href,
  };
  const msg: ExtMsg = { type: 'capture/console', payload };
  chrome.runtime.sendMessage(msg).catch(() => undefined);
});
