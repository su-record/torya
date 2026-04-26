import { useEffect, useState } from 'react';
import type { StorageSchema } from '@/types';
import { load, patch } from '@/lib/storage';

export function Options() {
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

  if (!state) return <div className="p-6 text-sm">Loading…</div>;

  const ws = state.workspaces;
  const agents = state.agents;

  return (
    <div className="mx-auto max-w-2xl p-6 text-sm">
      <h1 className="mb-6 text-xl font-semibold">🐢 Torya — Settings</h1>

      <Section title="🌉 Bridge">
        <div className="text-xs text-torya-muted">
          {state.bridge.version
            ? `Connected · v${state.bridge.version} · ${state.bridge.os}/${state.bridge.arch}`
            : 'Not connected'}
        </div>
      </Section>

      <Section title="📁 Workspaces">
        {ws.length === 0 ? (
          <div className="text-xs text-torya-muted">No workspaces yet.</div>
        ) : (
          <ul className="space-y-2">
            {ws.map((w) => (
              <li
                key={w.id}
                className="rounded border border-torya-border bg-torya-surface p-3 text-xs"
              >
                <div className="font-semibold">{w.name}</div>
                <div className="text-torya-muted">origin: {w.originPattern}</div>
                <div className="text-torya-muted">path: {w.rootPath}</div>
                <div className="text-torya-muted">
                  agent: {w.defaultAgent} · terminal: {w.terminalPreference}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="🤖 Coding agents">
        <ul className="space-y-1 text-xs">
          {agents.map((a) => (
            <li key={a.name} className="flex items-center gap-2">
              <span>{a.available ? '✅' : '❌'}</span>
              <span className="font-mono">{a.name}</span>
              {a.path && <span className="text-torya-muted">{a.path}</span>}
              {a.version && <span className="text-torya-muted">v{a.version}</span>}
              {a.rpc && <span className="text-torya-muted">{a.rpc}</span>}
            </li>
          ))}
          {agents.length === 0 && (
            <li className="text-torya-muted">No agents detected.</li>
          )}
        </ul>
        <button
          className="mt-2 rounded border border-torya-border px-2 py-1 text-xs"
          onClick={() => void chrome.runtime.sendMessage({ type: 'agents/redetect' })}
        >
          Re-detect
        </button>
      </Section>

      <Section title="🔑 LLM API keys">
        <label className="block">
          <span className="text-xs text-torya-muted">Claude API key</span>
          <input
            type="password"
            className="mt-1 w-full rounded border border-torya-border bg-torya-bg px-2 py-1 text-sm"
            defaultValue={state.secrets.claudeApiKey ?? ''}
            onBlur={(e) =>
              void patch({ secrets: { ...state.secrets, claudeApiKey: e.target.value } })
            }
            placeholder="sk-ant-..."
          />
        </label>
      </Section>

      <Section title="⚙️ Capture rules">
        {(['console', 'rejection', 'network', 'dom'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={state.settings.captureRules[k]}
              onChange={(e) =>
                void patch({
                  settings: {
                    ...state.settings,
                    captureRules: { ...state.settings.captureRules, [k]: e.target.checked },
                  },
                })
              }
            />
            {k}
          </label>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
