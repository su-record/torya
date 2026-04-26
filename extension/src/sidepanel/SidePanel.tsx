import { useEffect, useState } from 'react';
import type { DevError, StorageSchema, AgentName } from '@/types';
import { load } from '@/lib/storage';
import { ErrorCard } from './ErrorCard';
import { Onboarding } from './Onboarding';

export function SidePanel() {
  const [state, setState] = useState<StorageSchema | null>(null);

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

  if (!state) return <div className="p-4 text-sm text-torya-muted">Loading…</div>;

  if (!state.onboarding.completed) {
    return <Onboarding state={state} />;
  }

  const liveErrors = state.errors.filter((e) => e.status === 'new' || e.status === 'running');
  const ws = state.workspaces[0];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-torya-border px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <strong className="text-torya-text">🐢 Torya</strong>
          <button
            className="text-torya-muted hover:text-torya-text"
            onClick={() => chrome.runtime.openOptionsPage()}
            title="Settings"
          >
            ⚙
          </button>
        </div>
        <div className="mt-2 text-xs text-torya-muted">
          📁 {ws ? ws.name : 'No workspace'} ·{' '}
          🤖{' '}
          {state.agents.filter((a) => a.available).map((a) => a.name).join(' ') || 'no agents'}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3 space-y-2">
        {liveErrors.length === 0 ? (
          <div className="rounded-lg border border-torya-border p-6 text-center text-sm text-torya-muted">
            No live errors. Open a localhost dev server and Torya will catch them automatically.
          </div>
        ) : (
          liveErrors.map((e) => (
            <ErrorCard
              key={e.id}
              err={e}
              onRun={(agent) => runAgent(e, agent)}
              onDismiss={() => dismiss(e.id)}
            />
          ))
        )}
      </main>
    </div>
  );
}

function runAgent(e: DevError, agent: AgentName) {
  void chrome.runtime.sendMessage({ type: 'error/run-agent', id: e.id, agent });
}

function dismiss(id: string) {
  void chrome.runtime.sendMessage({ type: 'error/dismiss', id });
}
