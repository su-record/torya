import { useEffect, useState } from 'react';
import type { DevError, StorageSchema } from '@/types';
import { load } from '@/lib/storage';
import { Onboarding } from './Onboarding';
import { Settings } from './Settings';

type View = 'live' | 'settings';

export function SidePanel() {
  const [state, setState] = useState<StorageSchema | null>(null);
  const [view, setView] = useState<View>('live');

  useEffect(() => {
    let mounted = true;
    void load().then((s) => mounted && setState(s));
    const onChanged = () => void load().then((s) => mounted && setState(s));
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  // Auto-jump to settings when no workspace is configured.
  useEffect(() => {
    if (state?.onboarding.completed && state.workspaces.length === 0 && view === 'live') {
      setView('settings');
    }
  }, [state?.onboarding.completed, state?.workspaces.length]);

  if (!state) return <div className="p-4 text-sm text-torya-muted">Loading…</div>;
  if (!state.onboarding.completed) return <Onboarding state={state} />;
  if (view === 'settings') {
    return <Settings state={state} onBack={() => setView('live')} />;
  }

  const ws = state.workspaces[0];
  const agentNames = state.agents.filter((a) => a.available).map((a) => a.name).join(' ');
  const recent = state.errors.slice(0, 30);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-torya-border px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <strong>🐶 Torya</strong>
          <button
            className="text-torya-muted hover:text-torya-text"
            onClick={() => setView('settings')}
            title="Settings"
          >
            ⚙
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-torya-muted">
          <span>📁 {ws ? ws.name : '—'}</span>
          <span>🤖 {agentNames || '—'}</span>
          <span>🌉 {state.bridge.version ? '✅' : '❌'}</span>
        </div>
        {!ws && (
          <div className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-200">
            No workspace mapped.{' '}
            <button
              className="underline hover:text-amber-100"
              onClick={() => setView('settings')}
            >
              Add one in settings →
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-auto px-3 py-2">
        {recent.length === 0 ? (
          <div className="mt-8 text-center text-xs text-torya-muted">
            Watching for errors. Open a localhost dev page and trigger one.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((e) => (
              <LogRow key={e.id} err={e} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function LogRow({ err }: { err: DevError }) {
  const ts = new Date(err.capturedAt).toLocaleTimeString();
  const where = err.meta.file
    ? `${trim(err.meta.file)}${err.meta.line ? `:${err.meta.line}` : ''}`
    : '';
  const statusIcon =
    err.status === 'running' ? '⚙️'
    : err.status === 'fixed' ? '✅'
    : err.status === 'failed' ? '⚠️'
    : err.status === 'dismissed' ? '·'
    : '🔴';
  return (
    <li className="rounded border border-torya-border bg-torya-surface px-2 py-1.5 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-torya-muted">{ts}</span>
        <span>{statusIcon}</span>
        <span className="min-w-0 flex-1 truncate text-torya-text">{err.message}</span>
      </div>
      {where && (
        <div className="ml-12 mt-0.5 truncate text-[11px] text-torya-muted">{where}</div>
      )}
    </li>
  );
}

function trim(s: string, max = 64): string {
  return s.length > max ? '…' + s.slice(-max + 1) : s;
}
