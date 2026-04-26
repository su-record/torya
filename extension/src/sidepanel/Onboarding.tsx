import { useEffect, useState } from 'react';
import type { StorageSchema } from '@/types';
import { patch, upsertWorkspace } from '@/lib/storage';
import { uuid } from '@/lib/uuid';

const INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/su-record/torya/main/installer/install.sh | sh';

export function Onboarding({ state }: { state: StorageSchema }) {
  const step = state.onboarding.step;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-torya-border px-4 py-3">
        <div className="text-sm font-semibold">🐢 Torya — setup ({step}/4)</div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        {step === 1 && <Step1 state={state} />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 state={state} />}
        {step === 4 && <Step4 />}
      </main>
    </div>
  );
}

function Step1({ state }: { state: StorageSchema }) {
  const [copied, setCopied] = useState(false);
  const connected = !!state.bridge.version;

  useEffect(() => {
    if (connected) {
      void patch({ onboarding: { ...state.onboarding, step: 2 } });
    }
  }, [connected]);

  // Trigger periodic bridge probe.
  useEffect(() => {
    const id = setInterval(() => {
      void chrome.runtime.sendMessage({ type: 'bridge/status' });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
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
  );
}

function Step2() {
  const [origin, setOrigin] = useState('https://localhost:5173');
  const [path, setPath] = useState('');

  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">Map your project</h2>
      <p className="text-torya-muted">
        Tell Torya which local folder corresponds to the browser origin.
      </p>
      <label className="block">
        <span className="text-xs text-torya-muted">Browser origin</span>
        <input
          className="mt-1 w-full rounded border border-torya-border bg-torya-bg px-2 py-1 text-sm"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs text-torya-muted">Project folder (absolute path)</span>
        <div className="mt-1 flex gap-2">
          <input
            className="flex-1 rounded border border-torya-border bg-torya-bg px-2 py-1 text-sm"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/you/workspace/myapp"
          />
          <button
            className="rounded border border-torya-border px-2 py-1 text-xs"
            onClick={async () => {
              const res = await chrome.runtime
                .sendMessage({ type: 'bridge/pick-folder' })
                .catch(() => undefined);
              if (res && (res as any).path) setPath((res as any).path);
            }}
          >
            Browse
          </button>
        </div>
      </label>
      <button
        className="rounded bg-torya-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
        disabled={!origin || !path}
        onClick={async () => {
          await upsertWorkspace({
            id: uuid(),
            name: path.split('/').pop() || 'workspace',
            originPattern: origin,
            rootPath: path,
            defaultAgent: 'claude',
            terminalPreference: 'cmux',
          });
          await patch({ onboarding: { completed: false, step: 3 } });
        }}
      >
        Save & continue
      </button>
    </div>
  );
}

function Step3({ state }: { state: StorageSchema }) {
  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">Detect coding agents</h2>
      <ul className="space-y-1">
        {state.agents.map((a) => (
          <li key={a.name} className="flex items-center gap-2 text-xs">
            <span>{a.available ? '✅' : '❌'}</span>
            <span className="font-mono">{a.name}</span>
            {a.path && <span className="truncate text-torya-muted">{a.path}</span>}
          </li>
        ))}
        {state.agents.length === 0 && (
          <li className="text-xs text-torya-muted">No agents detected yet.</li>
        )}
      </ul>
      <div className="flex gap-2">
        <button
          className="rounded border border-torya-border px-2 py-1 text-xs"
          onClick={() => void chrome.runtime.sendMessage({ type: 'agents/redetect' })}
        >
          Re-scan
        </button>
        <button
          className="rounded bg-torya-accent px-3 py-1.5 text-xs text-white"
          onClick={() => void patch({ onboarding: { completed: false, step: 4 } })}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function Step4() {
  const [key, setKey] = useState('');
  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">Direct mode (optional)</h2>
      <p className="text-torya-muted">
        Direct mode applies small fixes without opening a terminal — uses your API key.
      </p>
      <label className="block">
        <span className="text-xs text-torya-muted">Claude API key</span>
        <input
          type="password"
          className="mt-1 w-full rounded border border-torya-border bg-torya-bg px-2 py-1 text-sm"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
        />
      </label>
      <div className="flex gap-2">
        <button
          className="rounded border border-torya-border px-2 py-1 text-xs"
          onClick={() => void patch({ onboarding: { completed: true, step: 4 } })}
        >
          Skip
        </button>
        <button
          className="rounded bg-torya-accent px-3 py-1.5 text-xs text-white"
          onClick={async () => {
            if (key) await patch({ secrets: { claudeApiKey: key } });
            await patch({ onboarding: { completed: true, step: 4 } });
          }}
        >
          Finish
        </button>
      </div>
    </div>
  );
}
