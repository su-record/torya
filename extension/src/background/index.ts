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
import { uuid } from '@/lib/uuid';
import type {
  AgentInfo,
  AgentName,
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

chrome.runtime.onInstalled.addListener(async () => {
  log('installed');
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
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
    case 'workspace/upsert':
      // Forward updated workspace list to bridge.
      const s = await load();
      await bridge.send('set-workspaces', { workspaces: s.workspaces }).catch(() => undefined);
      return { ok: true };
    case 'agents/redetect':
      const agents = await bridge.send<AgentInfo[]>('detect-agents');
      await setAgents(agents);
      return agents;
    default:
      return { ok: false };
  }
}

// In-memory dedup: signature → last seen ts. Skip if seen within DEDUP_WINDOW.
const DEDUP_WINDOW_MS = 5_000;
const recentSignatures = new Map<string, number>();

function shouldSkipDuplicate(sig: string): boolean {
  const now = Date.now();
  const prev = recentSignatures.get(sig);
  if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) return true;
  recentSignatures.set(sig, now);
  // Best-effort cleanup.
  if (recentSignatures.size > 200) {
    for (const [k, v] of recentSignatures) {
      if (now - v > DEDUP_WINDOW_MS) recentSignatures.delete(k);
    }
  }
  return false;
}

async function ingestConsole(p: ConsoleErrorPayload): Promise<DevError | null> {
  let s = await load();
  // Honor capture rules
  if (p.kind === 'rejection' && !s.settings.captureRules.rejection) return null;
  if (p.kind !== 'rejection' && !s.settings.captureRules.console) return null;

  const sig = `c:${p.message}|${p.filename ?? ''}:${p.lineno ?? 0}`;
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
  if (ws) void runAgentForError(e.id, s.settings.defaultAgent);
  return e;
}

async function ingestNetwork(p: NetworkErrorPayload): Promise<DevError | null> {
  let s = await load();
  if (!s.settings.captureRules.network) return null;

  const sig = `n:${p.method}:${p.url}:${p.status}`;
  if (shouldSkipDuplicate(sig)) return null;

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
  if (ws && p.status >= 500) void runAgentForError(e.id, s.settings.defaultAgent);
  return e;
}

async function ingestDom(p: DomErrorPayload): Promise<DevError | null> {
  let s = await load();
  if (!s.settings.captureRules.dom) return null;

  const sig = `d:${p.message}`;
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
  await updateError(id, { status: 'running' });
  const prompt = buildPrompt(err);
  const onMsg = (m: BridgeResponse) => log('agent:', m.kind, m.data);
  try {
    const { done } = bridge.stream(
      'run-agent',
      { agent, prompt, cwd: ws.rootPath, terminal: ws.terminalPreference },
      onMsg
    );
    const final = await done;
    await updateError(id, { status: final.kind === 'exit' ? 'fixed' : 'failed' });
    return { ok: final.kind === 'exit' };
  } catch (e) {
    log('run-agent failed', e);
    await updateError(id, { status: 'failed' });
    return { ok: false };
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
