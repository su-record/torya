import { useEffect, useState } from 'react';
import type { StorageSchema } from '@/types';
import { patch } from '@/lib/storage';

const INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/su-record/torya/main/installer/install.sh | sh';

interface Props {
  state: StorageSchema;
}

/**
 * Onboarding is now a single screen: install the bridge.
 * As soon as the bridge handshake succeeds we mark onboarding complete
 * and the side panel jumps to the main error list.
 * Workspaces, agents, and API keys live in the Options page.
 */
export function Onboarding({ state }: Props) {
  const [copied, setCopied] = useState(false);
  const connected = !!state.bridge.version;

  useEffect(() => {
    if (connected && !state.onboarding.completed) {
      void patch({ onboarding: { completed: true, step: 1 } });
    }
  }, [connected, state.onboarding.completed]);

  // Probe bridge every 2s while we're waiting.
  useEffect(() => {
    const id = setInterval(() => {
      void chrome.runtime.sendMessage({ type: 'bridge/status' });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-torya-border px-4 py-3">
        <div className="text-sm font-semibold">🐶 Torya — setup</div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <div className="space-y-3 text-sm">
          <h2 className="text-base font-semibold">Install Torya Bridge</h2>
          <p className="text-torya-muted">
            Torya needs a small native helper to talk to your terminal and project files.
          </p>
          <div className="rounded border border-torya-border bg-torya-bg p-2 font-mono text-xs">
            {INSTALL_CMD}
          </div>
          <button
            className="rounded bg-torya-accent px-3 py-1.5 text-xs text-white"
            onClick={() => {
              navigator.clipboard.writeText(INSTALL_CMD);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'Copied!' : 'Copy command'}
          </button>
          <div className="text-xs text-torya-muted">
            Status:{' '}
            {connected ? (
              <span className="text-emerald-400">✅ bridge v{state.bridge.version}</span>
            ) : (
              <span>⏳ waiting for bridge…</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
