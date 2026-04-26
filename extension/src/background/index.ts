/// <reference types="chrome" />
import { bridge } from '@/lib/native';
import {
  load,
  patch,
  pushError,
  updateError,
  setAgents,
  findWorkspaceForOrigin,
  upsertWorkspace,
} from '@/lib/storage';
import { isLocalhost } from '@/lib/origin';
import { uuid } from '@/lib/uuid';
import {
  setCdpEnabled,
  setExceptionListener,
  wireCdpTabListeners,
} from './cdp';
import type {
  AgentInfo,
  AgentName,
  AgentRun,
  BridgeResponse,
  ConsoleErrorPayload,
  DetectedProject,
  DevError,
  DomErrorPayload,
  ExtMsg,
  NetworkErrorPayload,
  Workspace,
} from '@/types';

const log = (...a: unknown[]) => console.log('[torya:bg]', ...a);

chrome.runtime.onInstalled.addListener(async (details) => {
  log('installed', details.reason);
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
  // Reload-the-extension is the user's "give me a clean slate" gesture.
  // Drop captured errors so the side panel doesn't surface stale rows
  // (e.g. a "fix completed" card from a previous session).
  if (details.reason === 'install' || details.reason === 'update') {
    await patch({ errors: [] });
  }
});

// Track whether any side panel is currently open. Each SidePanel React tree
// opens a long-lived port; we count active ports here. When zero, the user
// is not looking at Torya, so silent runs would happen invisibly — in that
// case we transparently fall back to the system terminal so they at least
// see Terminal.app pop up.
let openSidePanels = 0;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sidepanel') return;
  openSidePanels += 1;
  port.onDisconnect.addListener(() => {
    openSidePanels = Math.max(0, openSidePanels - 1);
  });
});

// Fallback: explicit click handler in case openPanelOnActionClick is unset.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }
});

chrome.runtime.onStartup.addListener(() => {
  void tryConnectBridge();
});

void tryConnectBridge();

// CDP-based capture of service-worker exceptions. Off by default; the user
// opts in via Settings (settings.captureServiceWorkerErrors).
wireCdpTabListeners();
setExceptionListener((e) => {
  if (!isLocalhost(e.origin)) return;
  void ingestConsole({
    kind: 'error',
    message:
      e.source === 'service_worker'
        ? `[sw] ${e.message}`
        : e.source === 'worker'
          ? `[worker] ${e.message}`
          : e.message,
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
    stack: e.stack,
    origin: e.origin,
    url: e.url,
    ts: e.ts,
  });
});
void (async () => {
  const s = await load();
  await setCdpEnabled(!!s.settings.captureServiceWorkerErrors);
})();
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const next = changes.settings.newValue as
    | { captureServiceWorkerErrors?: boolean }
    | undefined;
  await setCdpEnabled(!!next?.captureServiceWorkerErrors);
});

// Prune any pre-filter entries that snuck in before the localhost-only
// guard. Runs once on startup.
void (async () => {
  const s = await load();
  const filtered = s.errors.filter((e) => isLocalhost(e.origin));
  if (filtered.length !== s.errors.length) {
    await patch({ errors: filtered });
    log('pruned', s.errors.length - filtered.length, 'non-localhost entries');
  }
})();

async function tryConnectBridge(): Promise<void> {
  if (bridge.connect()) {
    try {
      const ping = await bridge.send<{ version: string; os: string; arch: string }>('ping');
      await patch({ bridge: { ...ping, lastSeenAt: Date.now() } });
      const agents = await bridge.send<AgentInfo[]>('detect-agents');
      await setAgents(agents);
      log('bridge connected', ping);
      // Sync workspaces to bridge for safe-fs guards.
      const s = await load();
      await bridge.send('set-workspaces', { workspaces: s.workspaces }).catch(() => undefined);
    } catch (e) {
      log('bridge handshake failed', e);
    }
  } else {
    log('bridge not connected, will retry on demand');
  }
}

// ---------- Error capture entry points ----------

chrome.runtime.onMessage.addListener((msg: ExtMsg, _sender, sendResponse) => {
  void handleMessage(msg).then(sendResponse).catch((e) => {
    log('handler error', e);
    sendResponse({ ok: false, error: String(e) });
  });
  return true;
});

async function handleMessage(msg: ExtMsg): Promise<unknown> {
  switch (msg.type) {
    case 'capture/console':
      return await ingestConsole(msg.payload);
    case 'capture/network':
      return await ingestNetwork(msg.payload);
    case 'capture/dom':
      return await ingestDom(msg.payload);
    case 'error/dismiss':
      return await updateError(msg.id, { status: 'dismissed' });
    case 'error/run-agent':
      return await runAgentForError(msg.id, msg.agent);
    case 'error/quick-fix':
      return await quickFixError(msg.id);
    case 'bridge/status':
      if (!bridge.isConnected()) await tryConnectBridge();
      return { connected: bridge.isConnected() };
    case 'bridge/pick-folder':
      if (!bridge.isConnected()) await tryConnectBridge();
      return await bridge.send('pick-folder', { title: msg.title ?? 'Select project folder' });
    case 'bridge/detect-project': {
      if (!isLocalhost(msg.origin)) return { ok: false };
      const existing = findWorkspaceForOrigin((await load()).workspaces, msg.origin);
      if (existing) return { ok: true, workspace: existing };
      if (!bridge.isConnected()) await tryConnectBridge();
      const ws = await tryAutoMap(msg.origin);
      return { ok: !!ws, workspace: ws };
    }
    case 'workspace/upsert':
      // Forward updated workspace list to bridge.
      const s = await load();
      await bridge.send('set-workspaces', { workspaces: s.workspaces }).catch(() => undefined);
      return { ok: true };
    case 'agents/redetect':
      const agents = await bridge.send<AgentInfo[]>('detect-agents');
      await setAgents(agents);
      return agents;
    case 'errors/clear':
      await patch({ errors: [] });
      return { ok: true };
    default:
      return { ok: false };
  }
}

// In-memory dedup: signature → last seen ts. Skip if seen within window.
// Network errors get a slightly longer window because a single underlying
// bug usually produces a short burst of identical 5xx (e.g. parallel chunk
// uploads), and we don't want a card per chunk.
const DEDUP_WINDOW_MS = 5_000;
const NETWORK_DEDUP_WINDOW_MS = 10_000;
const recentSignatures = new Map<string, number>();

function shouldSkipDuplicate(sig: string, windowMs = DEDUP_WINDOW_MS): boolean {
  const now = Date.now();
  const prev = recentSignatures.get(sig);
  if (prev !== undefined && now - prev < windowMs) return true;
  recentSignatures.set(sig, now);
  if (recentSignatures.size > 200) {
    for (const [k, v] of recentSignatures) {
      if (now - v > Math.max(windowMs, DEDUP_WINDOW_MS)) {
        recentSignatures.delete(k);
      }
    }
  }
  return false;
}

// Per-workspace agent-run cooldown. Short window — the in-flight `running`
// check below is the real guard against parallel runs; this only debounces
// rapid-fire triggers right after one completes. Cleared whenever a run
// finishes so a follow-up error can immediately retrigger.
const AGENT_COOLDOWN_MS = 10_000;
const lastAgentRunAt = new Map<string, number>();

// Compute the dedup signature for an already-stored DevError. Used to
// reopen capture for an error after the agent claims to have fixed it,
// so we can confirm by silence (or demote on recurrence).
function signatureForError(e: DevError): string {
  if (e.source === 'network' && e.meta.request) {
    const r = e.meta.request;
    return `n:${r.method}:${r.url}:${r.status}`;
  }
  return `c:${e.message}|${e.meta.file ?? ''}:${e.meta.line ?? 0}`;
}

// Verification: when an agent run exits successfully, we don't immediately
// trust it. We reopen the dedup window for that error's signature and watch
// for recurrence. If the same error fires again before VERIFY_WINDOW_MS,
// the fix didn't take — demote to 'failed'. Otherwise mark 'fixed'.
const VERIFY_WINDOW_MS = 8_000;
const verifying = new Map<
  string,
  { errorId: string; signature: string; workspaceId?: string; timer: number }
>();

function clearVerification(errorId: string): void {
  const v = verifying.get(errorId);
  if (!v) return;
  clearTimeout(v.timer);
  verifying.delete(errorId);
}

// Called from each ingest path. If the new event matches an in-flight
// verification, the agent's fix didn't work — demote that error.
async function noteRecurrenceIfVerifying(sig: string): Promise<void> {
  for (const [errorId, v] of verifying) {
    if (v.signature !== sig) continue;
    clearVerification(errorId);
    const cur = (await load()).errors.find((e) => e.id === errorId);
    await updateError(errorId, {
      status: 'failed',
      run: cur?.run ? { ...cur.run, result: 'failed' } : undefined,
    });
    if (v.workspaceId) lastAgentRunAt.delete(v.workspaceId);
  }
}

async function shouldAutoRunAgent(workspaceId: string): Promise<boolean> {
  const now = Date.now();
  const last = lastAgentRunAt.get(workspaceId);
  if (last !== undefined && now - last < AGENT_COOLDOWN_MS) return false;
  // Also skip if any error is currently 'running' for this workspace —
  // avoids spawning a parallel terminal while the previous agent is working.
  const s = await load();
  const inflight = s.errors.some(
    (e) => e.workspaceId === workspaceId && e.status === 'running',
  );
  if (inflight) return false;
  lastAgentRunAt.set(workspaceId, now);
  return true;
}

async function ingestConsole(p: ConsoleErrorPayload): Promise<DevError | null> {
  if (!isLocalhost(p.origin)) return null;
  let s = await load();
  // Honor capture rules
  if (p.kind === 'rejection' && !s.settings.captureRules.rejection) return null;
  if (p.kind !== 'rejection' && !s.settings.captureRules.console) return null;

  const sig = `c:${p.message}|${p.filename ?? ''}:${p.lineno ?? 0}`;
  await noteRecurrenceIfVerifying(sig);
  if (shouldSkipDuplicate(sig)) return null;

  let ws = findWorkspaceForOrigin(s.workspaces, p.origin);
  if (!ws) ws = await tryAutoMap(p.origin);
  if (ws) s = await load(); // refresh to include the new workspace

  const e: DevError = {
    id: uuid(),
    capturedAt: p.ts,
    source: 'console',
    severity: 'error',
    origin: p.origin,
    url: p.url,
    message: p.message,
    stack: p.stack,
    meta: { file: p.filename, line: p.lineno, col: p.colno },
    workspaceId: ws?.id,
    status: 'new',
  };
  await pushError(e);
  if (ws && (await shouldAutoRunAgent(ws.id))) {
    void runAgentForError(e.id, s.settings.defaultAgent);
  }
  return e;
}

async function ingestNetwork(p: NetworkErrorPayload): Promise<DevError | null> {
  if (!isLocalhost(p.origin)) return null;
  let s = await load();
  if (!s.settings.captureRules.network) return null;

  const sig = `n:${p.method}:${p.url}:${p.status}`;
  await noteRecurrenceIfVerifying(sig);
  if (shouldSkipDuplicate(sig, NETWORK_DEDUP_WINDOW_MS)) return null;

  let ws = findWorkspaceForOrigin(s.workspaces, p.origin);
  if (!ws) ws = await tryAutoMap(p.origin);
  if (ws) s = await load();
  const e: DevError = {
    id: uuid(),
    capturedAt: p.ts,
    source: 'network',
    severity: p.status >= 500 ? 'error' : 'warn',
    origin: p.origin,
    url: p.pageUrl,
    message: `${p.method} ${p.url} → ${p.status}`,
    meta: { request: { method: p.method, url: p.url, status: p.status } },
    workspaceId: ws?.id,
    status: 'new',
  };
  await pushError(e);
  if (ws && p.status >= 500 && (await shouldAutoRunAgent(ws.id))) {
    void runAgentForError(e.id, s.settings.defaultAgent);
  }
  return e;
}

async function ingestDom(p: DomErrorPayload): Promise<DevError | null> {
  let s = await load();
  if (!s.settings.captureRules.dom) return null;

  const sig = `d:${p.message}`;
  await noteRecurrenceIfVerifying(sig);
  if (shouldSkipDuplicate(sig)) return null;

  let ws = findWorkspaceForOrigin(s.workspaces, p.origin);
  if (!ws) ws = await tryAutoMap(p.origin);
  if (ws) s = await load();
  const e: DevError = {
    id: uuid(),
    capturedAt: p.ts,
    source: 'dom',
    severity: 'warn',
    origin: p.origin,
    url: p.url,
    message: p.message,
    meta: { domSnippet: p.snippet },
    workspaceId: ws?.id,
    status: 'new',
  };
  await pushError(e);
  // DOM errors are usually low-severity (404 image etc.) — don't auto-trigger
  // an agent run. Surface them in the live log only.
  return e;
}

// Negative cache so we don't hammer lsof for origins that have no listener.
const recentDetectFailures = new Map<string, number>();
const DETECT_FAIL_TTL = 30_000;

async function tryAutoMap(origin: string): Promise<Workspace | undefined> {
  // Only auto-detect for localhost / loopback origins.
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[?::1]?)/i.test(origin)) return undefined;
  const lastFail = recentDetectFailures.get(origin);
  if (lastFail !== undefined && Date.now() - lastFail < DETECT_FAIL_TTL) return undefined;

  try {
    const det = await bridge.send<DetectedProject>('detect-project', { origin });
    if (!det?.cwd) {
      recentDetectFailures.set(origin, Date.now());
      return undefined;
    }
    const s = await load();
    const ws: Workspace = {
      id: uuid(),
      name: det.cwd.split('/').filter(Boolean).pop() || 'workspace',
      originPattern: origin,
      rootPath: det.cwd,
      defaultAgent: s.settings.defaultAgent,
      terminalPreference: s.settings.terminalPreference,
    };
    await upsertWorkspace(ws);
    // Push updated roots to the bridge so safefs allows ops in this folder.
    const updated = await load();
    await bridge
      .send('set-workspaces', { workspaces: updated.workspaces })
      .catch(() => undefined);
    log('auto-mapped', origin, '→', det.cwd);
    return ws;
  } catch (e) {
    log('auto-map failed', origin, e);
    recentDetectFailures.set(origin, Date.now());
    return undefined;
  }
}

async function runAgentForError(id: string, agent: AgentName): Promise<{ ok: boolean }> {
  const s = await load();
  const err = s.errors.find((e) => e.id === id);
  if (!err) return { ok: false };
  const ws = err.workspaceId ? s.workspaces.find((w) => w.id === err.workspaceId) : undefined;
  if (!ws) {
    log('no workspace mapping for', err.origin);
    return { ok: false };
  }
  const prompt = buildPrompt(err);
  let via = s.settings.terminalPreference as 'cmux' | 'system' | 'silent';
  // Silent runs leave no UI trace. If the user isn't looking at the side
  // panel, they'd have no way to know an agent is running — promote to the
  // system terminal so something visible happens.
  if (via === 'silent' && openSidePanels === 0) {
    via = 'system';
  }
  // Default tracked from the chosen mode; bridge will confirm with a
  // started-progress message including the real `tracked` flag.
  let tracked = via === 'silent';
  await updateError(id, {
    status: 'running',
    run: {
      agent,
      via,
      tracked,
      prompt,
      startedAt: Date.now(),
    },
  });
  const onMsg = (m: BridgeResponse) => {
    log('agent:', m.kind, m.data);
    if (m.kind !== 'progress') return;
    const d = m.data as
      | { stage?: string; tracked?: boolean; via?: string; channel?: string }
      | undefined;
    if (!d) return;
    // Bridge tells us its real channel — could differ from the user's
    // setting (e.g. cmux fell back to system because cmux isn't running).
    if (d.stage === 'spawn' && typeof d.via === 'string') {
      const actual = d.via as AgentRun['via'];
      void (async () => {
        const cur = (await load()).errors.find((e) => e.id === id);
        if (cur?.run && cur.run.via !== actual) {
          await updateError(id, { run: { ...cur.run, via: actual } });
        }
      })();
    }
    if (d.stage === 'started' && typeof d.tracked === 'boolean') {
      tracked = d.tracked;
    }
  };
  try {
    const { done } = bridge.stream(
      'run-agent',
      {
        agent,
        prompt,
        cwd: ws.rootPath,
        // Global setting wins over the per-workspace default so toggling
        // "silent" in Settings applies immediately without re-mapping.
        terminal: via,
      },
      onMsg
    );
    const final = await done;
    const cur = (await load()).errors.find((e) => e.id === id);
    if (final.kind !== 'exit') {
      await updateError(id, {
        status: 'failed',
        run: cur?.run ? { ...cur.run, endedAt: Date.now(), result: 'failed' } : undefined,
      });
      return { ok: false };
    }
    if (!tracked) {
      // Untracked: agent run was handed off to a user-visible terminal.
      // We don't know if it succeeded — surface "opened in <terminal>"
      // and let the user judge.
      await updateError(id, {
        status: 'dispatched',
        run: cur?.run
          ? { ...cur.run, tracked: false, endedAt: Date.now(), result: 'dispatched' }
          : undefined,
      });
      return { ok: true };
    }
    const code = (final.data as { code?: number } | undefined)?.code ?? 0;
    if (code !== 0) {
      await updateError(id, {
        status: 'failed',
        run: cur?.run
          ? { ...cur.run, tracked: true, endedAt: Date.now(), result: 'failed' }
          : undefined,
      });
      lastAgentRunAt.delete(ws.id);
      return { ok: false };
    }
    // Success: don't trust the exit code alone. Reopen capture for this
    // signature and watch — if the same error fires again within
    // VERIFY_WINDOW_MS the fix didn't take, otherwise mark fixed.
    const sig = signatureForError(err);
    recentSignatures.delete(sig);
    await updateError(id, {
      status: 'verifying',
      run: cur?.run
        ? { ...cur.run, tracked: true, endedAt: Date.now(), result: 'verifying' }
        : undefined,
    });
    // Reload matching tabs so the verification watch sees requests from
    // the freshly-loaded page (catches HMR-missed-the-update cases).
    if (s.settings.autoReloadOnFix !== false) {
      void reloadOriginTabs(err.origin);
    }
    const timer = setTimeout(() => {
      verifying.delete(id);
      void (async () => {
        const latest = (await load()).errors.find((e) => e.id === id);
        if (!latest || latest.status !== 'verifying') return;
        await updateError(id, {
          status: 'fixed',
          run: latest.run ? { ...latest.run, result: 'fixed' } : undefined,
        });
        lastAgentRunAt.delete(ws.id);
      })();
    }, VERIFY_WINDOW_MS) as unknown as number;
    verifying.set(id, { errorId: id, signature: sig, workspaceId: ws.id, timer });
    // Also clear cooldown immediately — verification is its own debounce.
    lastAgentRunAt.delete(ws.id);
    return { ok: true };
  } catch (e) {
    log('run-agent failed', e);
    const cur = (await load()).errors.find((e) => e.id === id);
    await updateError(id, {
      status: 'failed',
      run: cur?.run ? { ...cur.run, endedAt: Date.now(), result: 'failed' } : undefined,
    });
    lastAgentRunAt.delete(ws.id);
    return { ok: false };
  }
}

async function reloadOriginTabs(origin: string): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.id === undefined || !t.url) continue;
      try {
        if (new URL(t.url).origin === origin) {
          await chrome.tabs.reload(t.id, { bypassCache: false });
        }
      } catch {
        /* ignore non-http URLs */
      }
    }
  } catch (e) {
    log('reloadOriginTabs failed', e);
  }
}

async function quickFixError(_id: string): Promise<{ ok: boolean }> {
  // Direct mode placeholder — implemented in Phase 10.
  return { ok: false };
}

function buildPrompt(e: DevError): string {
  const where = e.meta.file ? ` at ${e.meta.file}${e.meta.line ? `:${e.meta.line}` : ''}` : '';
  if (e.source === 'network' && e.meta.request) {
    return `Fix this network error: ${e.message}. Find the relevant handler and address the failure.`;
  }
  return `Fix this browser error from local development:\n\n${e.message}${where}\n\n${e.stack ?? ''}`;
}

// ---------- Network capture ----------

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.statusCode < 400) return;
    if (details.tabId < 0) return;
    void chrome.tabs
      .get(details.tabId)
      .then((tab) => {
        if (!tab.url) return;
        const tabOrigin = new URL(tab.url).origin;
        const reqOrigin = new URL(details.url).origin;
        void ingestNetwork({
          method: details.method,
          url: details.url,
          status: details.statusCode,
          origin: tabOrigin,
          pageUrl: tab.url,
          ts: Date.now(),
        }).catch(() => undefined);
        void reqOrigin; // keep for future filtering
      })
      .catch(() => undefined);
  },
  { urls: ['<all_urls>'] }
);
