import { useEffect, useState } from 'react';
import type { StorageSchema } from '@/types';
import { load } from '@/lib/storage';

export function Popup() {
  const [state, setState] = useState<StorageSchema | null>(null);
  useEffect(() => {
    void load().then(setState);
  }, []);
  if (!state) return <div className="p-3 text-xs">Loading…</div>;

  const live = state.errors.filter((e) => e.status === 'new').length;
  const ws = state.workspaces[0];

  return (
    <div className="p-3 text-xs">
      <div className="mb-1 font-semibold text-sm">🐢 Torya</div>
      <div className="text-torya-muted">📁 {ws ? ws.name : 'No workspace'}</div>
      <div className="text-torya-muted">
        Bridge: {state.bridge.version ? '✅' : '❌'}
      </div>
      <div className="text-torya-muted">Live errors: {live}</div>
      <div className="mt-3 flex flex-col gap-2">
        <button
          className="rounded bg-torya-accent px-2 py-1 text-white"
          onClick={async () => {
            const tab = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab[0]?.windowId !== undefined) {
              await chrome.sidePanel.open({ windowId: tab[0].windowId });
            }
          }}
        >
          Open side panel
        </button>
        <button
          className="rounded border border-torya-border px-2 py-1"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
