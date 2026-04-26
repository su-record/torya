import { useEffect, useState } from 'react';
import type { StorageSchema, Workspace } from '@/types';
import { patch, upsertWorkspace } from '@/lib/storage';
import { uuid } from '@/lib/uuid';

interface Props {
  state: StorageSchema;
  onBack: () => void;
}

export function Settings({ state, onBack }: Props) {
  const ws = state.workspaces;
  const agents = state.agents;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-torya-border px-3 py-3 text-sm">
        <button
          className="text-torya-muted hover:text-torya-text"
          onClick={onBack}
          title="Back"
        >
          ←
        </button>
        <strong>Settings</strong>
      </header>

      <main className="flex-1 overflow-auto px-3 py-3 text-xs">
        <Section title="🌉 Bridge">
          <div className="text-torya-muted">
            {state.bridge.version
              ? `✅ v${state.bridge.version} · ${state.bridge.os}/${state.bridge.arch}`
              : '❌ not connected'}
          </div>
        </Section>

        <Section title="📁 Workspaces">
          {ws.length === 0 ? (
            <div className="mb-3 rounded bg-amber-500/10 p-2 text-amber-200">
              No workspaces yet. Add one below.
            </div>
          ) : (
            <ul className="mb-3 space-y-2">
              {ws.map((w) => (
                <li
                  key={w.id}
                  className="rounded border border-torya-border bg-torya-surface p-2"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{w.name}</span>
                    <button
                      className="text-torya-muted hover:text-red-400"
                      onClick={() => void removeWorkspace(state.workspaces, w.id)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <div className="truncate text-torya-muted" title={w.originPattern}>
                    {w.originPattern}
                  </div>
                  <div className="truncate font-mono text-torya-muted" title={w.rootPath}>
                    {w.rootPath}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AddWorkspaceForm defaultAgent={state.settings.defaultAgent} />
        </Section>

        <Section title="🤖 Default agent">
          <ul className="space-y-1">
            {(['claude', 'codex', 'gemini'] as const).map((name) => {
              const info = agents.find((x) => x.name === name);
              const available = !!info?.available;
              const selected = state.settings.defaultAgent === name;
              return (
                <li key={name}>
                  <label
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                      selected
                        ? 'border-torya-accent bg-torya-accent/10'
                        : 'border-torya-border'
                    } ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                  >
                    <input
                      type="radio"
                      name="defaultAgent"
                      checked={selected}
                      disabled={!available}
                      onChange={() =>
                        void patch({
                          settings: { ...state.settings, defaultAgent: name },
                        })
                      }
                    />
                    <span className="font-mono">{name}</span>
                    <span className="ml-auto truncate text-torya-muted">
                      {available
                        ? info?.version ?? 'available'
                        : 'not installed'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-torya-muted">Terminal:</span>
            {(['cmux', 'system'] as const).map((t) => (
              <label key={t} className="cursor-pointer">
                <input
                  type="radio"
                  name="terminalPref"
                  className="mr-1"
                  checked={state.settings.terminalPreference === t}
                  onChange={() =>
                    void patch({
                      settings: { ...state.settings, terminalPreference: t },
                    })
                  }
                />
                {t}
              </label>
            ))}
            <button
              className="ml-auto rounded border border-torya-border px-2 py-1"
              onClick={() => void chrome.runtime.sendMessage({ type: 'agents/redetect' })}
            >
              Re-detect
            </button>
          </div>
        </Section>

        <Section title="🔑 Claude API key (Direct mode)">
          <input
            type="password"
            className="w-full rounded border border-torya-border bg-torya-bg px-2 py-1"
            defaultValue={state.secrets.claudeApiKey ?? ''}
            onBlur={(e) =>
              void patch({
                secrets: { ...state.secrets, claudeApiKey: e.target.value },
              })
            }
            placeholder="sk-ant-..."
          />
        </Section>

        <Section title="⚙️ Capture rules">
          {(['console', 'rejection', 'network', 'dom'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.settings.captureRules[k]}
                onChange={(e) =>
                  void patch({
                    settings: {
                      ...state.settings,
                      captureRules: {
                        ...state.settings.captureRules,
                        [k]: e.target.checked,
                      },
                    },
                  })
                }
              />
              {k}
            </label>
          ))}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-torya-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AddWorkspaceForm({ defaultAgent }: { defaultAgent: Workspace['defaultAgent'] }) {
  const [origin, setOrigin] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const url = tabs[0]?.url;
        if (!url) return;
        try {
          setOrigin(new URL(url).origin);
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
  }, []);

  const choose = async () => {
    try {
      setBusy(true);
      const res = (await chrome.runtime.sendMessage({
        type: 'bridge/pick-folder',
      })) as { path?: string } | undefined;
      if (res?.path) setPath(res.path);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!origin || !path) return;
    await upsertWorkspace({
      id: uuid(),
      name: path.split('/').pop() || 'workspace',
      originPattern: origin,
      rootPath: path,
      defaultAgent,
      terminalPreference: 'cmux',
    });
    await chrome.runtime.sendMessage({
      type: 'workspace/upsert',
      workspace: { id: '', originPattern: origin, rootPath: path } as Workspace,
    });
    setPath('');
  };

  return (
    <div className="rounded border border-dashed border-torya-border p-2">
      <div className="space-y-2">
        <button
          className="w-full rounded bg-torya-accent px-3 py-2 text-white disabled:opacity-50"
          onClick={choose}
          disabled={busy}
        >
          {busy
            ? 'Opening Finder…'
            : path
              ? '📁 Change folder'
              : '📁 Choose folder…'}
        </button>
        {path && (
          <div className="truncate font-mono text-[11px] text-torya-text" title={path}>
            {path}
          </div>
        )}

        <input
          className="w-full rounded border border-torya-border bg-torya-bg px-2 py-1 font-mono"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="http://localhost:5173"
        />

        <button
          className="w-full rounded bg-emerald-600 px-3 py-1.5 text-white disabled:opacity-40"
          onClick={save}
          disabled={!origin || !path}
        >
          Save workspace
        </button>
      </div>
    </div>
  );
}

async function removeWorkspace(workspaces: Workspace[], id: string) {
  await patch({ workspaces: workspaces.filter((w) => w.id !== id) });
  await chrome.runtime.sendMessage({
    type: 'workspace/upsert',
    workspace: {} as Workspace,
  });
}
