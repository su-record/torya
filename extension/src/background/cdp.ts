/// <reference types="chrome" />
//
// chrome.debugger-based capture of exceptions that fire inside service-worker
// contexts (MSW, custom SWs). The page-world inject script can't see these
// because they live in an isolated SW global; CDP is the only browser API
// that surfaces them to extensions.
//
// Trade-offs the user opts into when they enable this:
//   - "Torya started debugging this browser" yellow banner on attached tabs.
//   - DevTools and Torya can't attach simultaneously; opening DevTools
//     prompts the user to detach Torya.
//   - 'debugger' permission ⇒ stronger install warning.
//
// We only attach to localhost tabs, and only while the user keeps the
// setting on. Detach is honored on tab close, navigation away from
// localhost, and explicit user-cancellation.

import { isLocalhost } from '@/lib/origin';

const PROTOCOL = '1.3';

type ExceptionListener = (e: {
  tabId: number;
  origin: string;
  url: string;
  source: 'page' | 'service_worker' | 'worker';
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  ts: number;
}) => void;

const attached = new Set<number>(); // tabIds we currently hold
const userDetached = new Set<number>(); // tabIds where user pressed "Cancel"
const tabUrls = new Map<number, string>(); // last known URL per tab
let enabled = false;
let listener: ExceptionListener | null = null;

export function setExceptionListener(fn: ExceptionListener): void {
  listener = fn;
}

export async function setCdpEnabled(value: boolean): Promise<void> {
  if (enabled === value) return;
  enabled = value;
  if (enabled) {
    // Sweep currently-open localhost tabs and attach.
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.id !== undefined && t.url) {
        tabUrls.set(t.id, t.url);
        if (isLocalhostUrl(t.url)) await attach(t.id);
      }
    }
  } else {
    for (const tabId of [...attached]) {
      await detach(tabId);
    }
    userDetached.clear();
  }
}

export function wireCdpTabListeners(): void {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url) tabUrls.set(tabId, info.url);
    if (!enabled) return;
    const url = info.url ?? tab.url;
    if (!url) return;
    if (isLocalhostUrl(url)) {
      void attach(tabId);
    } else if (attached.has(tabId)) {
      void detach(tabId);
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabUrls.delete(tabId);
    attached.delete(tabId);
    userDetached.delete(tabId);
  });

  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === undefined) return;
    attached.delete(source.tabId);
    if (reason === 'canceled_by_user') {
      userDetached.add(source.tabId);
    }
  });

  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === undefined) return;
    if (method === 'Target.attachedToTarget') {
      const p = params as {
        sessionId: string;
        targetInfo: { type: string };
      };
      if (
        p.targetInfo.type === 'service_worker' ||
        p.targetInfo.type === 'worker'
      ) {
        // Enable Runtime in the child target's session so we get its
        // exceptionThrown events.
        chrome.debugger.sendCommand(
          { tabId: source.tabId, sessionId: p.sessionId } as chrome.debugger.Debuggee,
          'Runtime.enable',
        );
      }
      return;
    }
    if (method !== 'Runtime.exceptionThrown') return;
    handleException(source, params as RuntimeExceptionThrown);
  });
}

interface RuntimeExceptionThrown {
  exceptionDetails: {
    text?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
    exception?: { description?: string; className?: string };
    stackTrace?: { callFrames?: Array<{ url: string; lineNumber: number }> };
  };
}

interface DebuggerSource {
  tabId?: number;
  extensionId?: string;
  targetId?: string;
  sessionId?: string;
}

function handleException(
  source: DebuggerSource,
  params: RuntimeExceptionThrown,
): void {
  if (!listener || source.tabId === undefined) return;
  const ed = params.exceptionDetails ?? {};
  const message =
    ed.exception?.description?.split('\n')[0] ??
    ed.text ??
    ed.exception?.className ??
    'Unhandled exception';
  // Determine source kind from sessionId presence — top-level session is the
  // page; child sessions are workers. We don't have full target info here, so
  // heuristically tag as service_worker when sessionId is present and the
  // URL looks like one.
  const sourceUrl =
    ed.url ?? ed.stackTrace?.callFrames?.[0]?.url ?? '';
  const looksLikeSw = /service.?worker|mockServiceWorker/i.test(sourceUrl);
  const kind: 'page' | 'service_worker' | 'worker' = source.sessionId
    ? looksLikeSw
      ? 'service_worker'
      : 'worker'
    : 'page';
  const origin = tabUrls.get(source.tabId) ?? '';
  let originStr = '';
  let urlStr = origin;
  try {
    originStr = new URL(origin).origin;
  } catch {
    /* ignore */
  }
  listener({
    tabId: source.tabId,
    origin: originStr,
    url: urlStr,
    source: kind,
    message,
    filename: sourceUrl || undefined,
    lineno: ed.lineNumber !== undefined ? ed.lineNumber + 1 : undefined,
    colno: ed.columnNumber !== undefined ? ed.columnNumber + 1 : undefined,
    stack: ed.exception?.description,
    ts: Date.now(),
  });
}

async function attach(tabId: number): Promise<void> {
  if (!enabled || attached.has(tabId) || userDetached.has(tabId)) return;
  await new Promise<void>((resolve) => {
    chrome.debugger.attach({ tabId }, PROTOCOL, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Common: another debugger already attached. Skip silently.
        resolve();
        return;
      }
      attached.add(tabId);
      Promise.all([
        sendCommand(tabId, 'Runtime.enable'),
        sendCommand(tabId, 'Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
        }),
      ]).finally(() => resolve());
    });
  });
}

async function detach(tabId: number): Promise<void> {
  if (!attached.has(tabId)) {
    return;
  }
  await new Promise<void>((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      // Ignore lastError — tab may already be gone.
      attached.delete(tabId);
      resolve();
    });
  });
}

function sendCommand(
  tabId: number,
  method: string,
  params?: object,
): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (result) => {
      resolve(result);
    });
  });
}

function isLocalhostUrl(url: string): boolean {
  try {
    return isLocalhost(new URL(url).origin);
  } catch {
    return false;
  }
}
