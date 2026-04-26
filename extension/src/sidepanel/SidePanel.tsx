import { useEffect, useState } from 'react';
import type { DevError, StorageSchema } from '@/types';
import { load } from '@/lib/storage';
import { isLocalhost } from '@/lib/origin';
import { Onboarding } from './Onboarding';
import { Settings } from './Settings';

type View = 'live' | 'settings';

export function SidePanel() {
  const [state, setState] = useState<StorageSchema | null>(null);
  const [view, setView] = useState<View>('live');
  const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
  // Re-render once a second so any in-flight agent run shows live elapsed.
  // Hook stays at the top of the component to satisfy rules of hooks.
  const [, setNowTick] = useState(0);
  const hasRunning = !!state?.errors.some(
    (e) => e.status === 'running' || e.status === 'verifying',
  );
  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [hasRunning]);

  useEffect(() => {
    let mounted = true;
    void load().then((s) => mounted && setState(s));
    const onChanged = () => void load().then((s) => mounted && setState(s));
    chrome.storage.onChanged.addListener(onChanged);
    // Long-lived port lets the background SW know a side panel is open.
    // It uses that to decide whether silent runs are visible to the user.
    let port: chrome.runtime.Port | null = null;
    try {
      port = chrome.runtime.connect({ name: 'sidepanel' });
    } catch {
      /* runtime invalidated — ignore */
    }
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onChanged);
      try {
        port?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Track the active tab's origin so we only show errors from the page the
  // user is currently looking at.
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        // The side panel is anchored to a specific Chrome window. Use that
        // window's active tab — `lastFocusedWindow` was unreliable when the
        // user had a second Chrome window or detached DevTools, returning a
        // tab from a window the user wasn't actually viewing.
        const win = await chrome.windows.getCurrent();
        const [tab] = await chrome.tabs.query({
          active: true,
          windowId: win.id,
        });
        if (!mounted) return;
        if (tab?.url) {
          try {
            setActiveOrigin(new URL(tab.url).origin);
          } catch {
            setActiveOrigin(null);
          }
        } else {
          setActiveOrigin(null);
        }
      } catch {
        setActiveOrigin(null);
      }
    };
    void refresh();
    const onActivated = () => void refresh();
    const onUpdated = (
      _id: number,
      info: chrome.tabs.TabChangeInfo,
      _tab: chrome.tabs.Tab
    ) => {
      if (info.url || info.status === 'complete') void refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      mounted = false;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  // Proactively ask the bridge to map the active localhost origin so the
  // workspace lights up before any error is captured.
  useEffect(() => {
    if (!state || !isLocalhost(activeOrigin) || !activeOrigin) return;
    const already = state.workspaces.some((w) => w.originPattern === activeOrigin);
    if (already) return;
    void chrome.runtime.sendMessage({
      type: 'bridge/detect-project',
      origin: activeOrigin,
    });
  }, [state, activeOrigin]);

  if (!state) return <div className="p-4 text-sm text-torya-muted">Loading…</div>;
  if (!state.onboarding.completed) return <Onboarding state={state} />;
  if (view === 'settings') {
    return (
      <Settings
        state={state}
        activeOrigin={activeOrigin}
        onBack={() => setView('live')}
      />
    );
  }

  const isDev = isLocalhost(activeOrigin);
  const ws = activeOrigin
    ? state.workspaces.find((w) => w.originPattern === activeOrigin) ?? state.workspaces[0]
    : state.workspaces[0];
  const agentNames = state.agents.filter((a) => a.available).map((a) => a.name).join(' ');
  // Split into "active" (needs attention) and "done" (fixed/dismissed). The
  // panel focuses on active by default; done is collapsible at the bottom.
  const allForOrigin = isDev
    ? state.errors.filter((e) => e.origin === activeOrigin)
    : [];
  const isDone = (e: DevError) =>
    e.status === 'fixed' || e.status === 'dismissed';
  const active = allForOrigin.filter((e) => !isDone(e)).slice(0, 30);
  // Keep the most recent 10 resolved entries as visible history; older ones
  // fall off the bottom (storage already caps at 50 globally).
  const done = allForOrigin.filter(isDone).slice(0, 10);

  return (
    <div className="flex h-full flex-col">
      {isDev && (
        <header className="border-b border-torya-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs text-torya-muted">
            <span title={ws ? ws.rootPath : 'no workspace'}>
              📁 {ws ? ws.name : '—'}
            </span>
            <span title="default agent">🤖 {agentNames || '—'}</span>
            <span title="bridge status">
              🌉 {state.bridge.version ? '✅' : '❌'}
            </span>
            <span className="ml-auto flex items-center gap-1">
              {done.length > 0 && (
                <span
                  className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400"
                  title={`${done.length} resolved on this page`}
                >
                  ✓ {done.length}
                </span>
              )}
              {state.errors.length > 0 && (
                <button
                  className="rounded px-1.5 py-0.5 hover:bg-torya-surface hover:text-torya-text"
                  onClick={() =>
                    void chrome.runtime.sendMessage({ type: 'errors/clear' })
                  }
                  title={`Clear all ${state.errors.length} stored errors`}
                >
                  Clear
                </button>
              )}
              <button
                className="rounded p-1.5 text-lg leading-none hover:bg-torya-surface hover:text-torya-text"
                onClick={() => setView('settings')}
                title="Settings"
              >
                ⚙
              </button>
            </span>
          </div>
          {!ws && (
            <div className="mt-2 rounded border border-torya-warn/30 bg-torya-warn-bg/40 p-2 text-xs text-torya-warn">
              No workspace mapped.{' '}
              <button
                className="underline hover:text-torya-text"
                onClick={() => setView('settings')}
              >
                Add one →
              </button>
            </div>
          )}
        </header>
      )}

      <main
        className={`flex-1 overflow-auto px-3 py-2 ${
          active.length === 0 && done.length === 0 ? 'flex flex-col' : ''
        }`}
      >
        {!isDev ? (
          <div className="m-auto text-center text-xs text-torya-muted">
            Not a development tab.
            <div className="mt-1 text-torya-muted-2">
              Switch to a <code className="text-torya-text">localhost</code> page
              to see live errors.
            </div>
          </div>
        ) : active.length === 0 && done.length === 0 ? (
          <div className="m-auto text-center text-xs text-torya-muted">
            Watching <span className="font-mono text-torya-text">{activeOrigin}</span>
            <div className="mt-1 text-torya-muted-2">
              Trigger an error in the page and it will appear here.
            </div>
          </div>
        ) : (
          <ul className="w-full space-y-1.5">
            {active.map((e) => (
              <LogRow key={e.id} err={e} />
            ))}
            {done.map((e) => (
              <LogRow key={e.id} err={e} dim />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function LogRow({ err, dim = false }: { err: DevError; dim?: boolean }) {
  return (
    <li
      className={`rounded-md border border-torya-border bg-torya-surface text-xs ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <CapturedStep err={err} />
      {err.run && <RunStep err={err} />}
    </li>
  );
}

function CapturedStep({ err }: { err: DevError }) {
  const ts = new Date(err.capturedAt).toLocaleTimeString();
  const where = err.meta.file
    ? `${trim(err.meta.file)}${err.meta.line ? `:${err.meta.line}` : ''}`
    : '';
  const sevColor =
    err.severity === 'error' ? 'bg-torya-danger' : 'bg-torya-warn';
  const sourceLabel =
    err.source === 'network' ? 'Network'
    : err.source === 'dom' ? 'DOM'
    : 'Console';

  return (
    <div className="px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${sevColor}`} title={err.severity} />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-torya-muted-2">
          {sourceLabel}
        </span>
        <span className="shrink-0 font-mono text-torya-muted">{ts}</span>
      </div>
      <div className="mt-1 break-words text-torya-text">{err.message}</div>
      {where && (
        <div className="mt-0.5 truncate font-mono text-[11px] text-torya-muted">
          {where}
        </div>
      )}
    </div>
  );
}

function RunStep({ err }: { err: DevError }) {
  const run = err.run!;
  const isRunning = err.status === 'running';
  const isVerifying = err.status === 'verifying';
  const isFixed = err.status === 'fixed';
  const isFailed = err.status === 'failed';
  const isDispatched = err.status === 'dispatched';

  const elapsedMs = (run.endedAt ?? Date.now()) - run.startedAt;
  const elapsed = formatDuration(elapsedMs);

  const headerColor = isFixed
    ? 'text-emerald-400'
    : isFailed
      ? 'text-torya-warn'
      : isDispatched
        ? 'text-torya-muted'
        : 'text-torya-accent-strong';

  const headerIcon = isRunning ? (
    <Spinner />
  ) : isVerifying ? (
    <Spinner />
  ) : isFixed ? (
    <span className="text-emerald-400">✓</span>
  ) : isFailed ? (
    <span className="text-torya-warn">✗</span>
  ) : isDispatched ? (
    <span className="text-torya-muted">↗</span>
  ) : null;

  const headerText = isRunning
    ? `fixing in ${run.agent}`
    : isVerifying
      ? `verifying fix…`
      : isFixed
        ? `fix completed`
        : isFailed
          ? `fix didn't take`
          : isDispatched
            ? `opened in ${run.via}`
            : `done`;

  return (
    <div className="border-t border-torya-border bg-torya-bg/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="shrink-0">{headerIcon}</span>
        <span className={`shrink-0 text-[11px] font-semibold ${headerColor}`}>
          {headerText}
        </span>
        {!isDispatched && (
          <span className="shrink-0 rounded bg-torya-surface px-1.5 py-0.5 text-[10px] text-torya-muted">
            {run.via}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-torya-muted">
          {isDispatched ? '—' : elapsed}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-[11px] text-torya-muted">
        → {firstLine(run.prompt)}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block size-3 animate-spin rounded-full border-2 border-torya-muted border-t-torya-accent-strong"
      aria-label="working"
    />
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function firstLine(s: string, max = 120): string {
  const line = s.split('\n', 1)[0] ?? '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

function trim(s: string, max = 64): string {
  return s.length > max ? '…' + s.slice(-max + 1) : s;
}
