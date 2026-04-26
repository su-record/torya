import { useEffect, useState } from 'react';
import type {
  AgentName,
  LlmVendor,
  StorageSchema,
  Workspace,
} from '@/types';
import { patch, upsertWorkspace } from '@/lib/storage';
import { uuid } from '@/lib/uuid';

interface Props {
  state: StorageSchema;
  onBack: () => void;
}

export function Settings({ state, onBack }: Props) {
  return (
    <div className="flex h-full flex-col bg-torya-bg text-torya-text">
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
        <Section title="Bridge">
          <div className="text-torya-muted">
            {state.bridge.version
              ? `connected · v${state.bridge.version} · ${state.bridge.os}/${state.bridge.arch}`
              : 'not connected'}
          </div>
        </Section>

        <Section title="Workspaces">
          <WorkspacesPanel state={state} />
        </Section>

        <Section title="Default agent">
          <AgentPicker state={state} />
        </Section>

        <Section title="Direct mode">
          <DirectModePanel state={state} />
        </Section>

        <Section title="Capture rules">
          <CapturePanel state={state} />
        </Section>

        <Section title="Auto reload on fix">
          <AutoReloadPanel state={state} />
        </Section>

        <Section title="Service worker errors (experimental)">
          <SwCapturePanel state={state} />
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-torya-muted-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Workspaces

function WorkspacesPanel({ state }: { state: StorageSchema }) {
  const [showManual, setShowManual] = useState(state.workspaces.length === 0);
  const ws = state.workspaces;

  return (
    <div>
      {ws.length === 0 ? (
        <p className="mb-3 text-torya-muted">
          Workspaces are auto-detected from your dev server's port. Errors from{' '}
          <code className="text-torya-text">localhost</code> will trigger detection
          on the fly.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {ws.map((w) => (
            <li
              key={w.id}
              className="rounded border border-torya-border bg-torya-surface px-2.5 py-2"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{w.name}</span>
                <button
                  className="text-torya-muted hover:text-torya-danger"
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

      <button
        className="text-torya-muted hover:text-torya-text"
        onClick={() => setShowManual((v) => !v)}
      >
        {showManual ? '− Hide manual setup' : '+ Add manually'}
      </button>

      {showManual && (
        <div className="mt-2">
          <AddWorkspaceForm defaultAgent={state.settings.defaultAgent} />
        </div>
      )}
    </div>
  );
}

function AddWorkspaceForm({ defaultAgent }: { defaultAgent: AgentName }) {
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
          /* ignore non-http URLs */
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
    <div className="rounded border border-dashed border-torya-border bg-torya-surface/50 p-2.5">
      <div className="space-y-2">
        <button
          className="w-full rounded border border-torya-border bg-torya-surface px-3 py-2 hover:border-torya-accent disabled:opacity-50"
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
          className="w-full rounded bg-torya-accent px-3 py-1.5 font-medium text-white hover:bg-torya-accent-strong disabled:opacity-40"
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

// ---------------------------------------------------------------- Agents

function AgentPicker({ state }: { state: StorageSchema }) {
  const agents = state.agents;
  const current = state.settings.defaultAgent;
  const currentInfo = agents.find((x) => x.name === current);
  const currentAvailable = !!currentInfo?.available;

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-torya-muted">CLI:</span>
        <select
          className="flex-1 rounded border border-torya-border bg-torya-surface px-2 py-1 font-mono text-torya-text"
          value={current}
          onChange={(e) =>
            void patch({
              settings: {
                ...state.settings,
                defaultAgent: e.target.value as AgentName,
              },
            })
          }
        >
          {(['claude', 'codex', 'gemini'] as const).map((name) => {
            const info = agents.find((x) => x.name === name);
            const has = !!info?.available;
            return (
              <option key={name} value={name}>
                {name}
                {has ? '' : ' — not installed'}
              </option>
            );
          })}
        </select>
        <button
          className="rounded border border-torya-border px-2 py-1 text-torya-muted hover:border-torya-accent hover:text-torya-text"
          onClick={() => void chrome.runtime.sendMessage({ type: 'agents/redetect' })}
        >
          Re-detect
        </button>
      </div>

      {!currentAvailable && (
        <div className="rounded border border-torya-warn/40 bg-torya-warn-bg/30 px-3 py-2">
          <div className="text-torya-warn">⚠ {current} is not installed.</div>
          <a
            className="text-[11px] text-torya-accent-strong hover:underline"
            href={installLink(current)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install instructions →
          </a>
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <span className="text-torya-muted">Terminal:</span>
        {(['cmux', 'system', 'silent'] as const).map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name="terminalPref"
              className="accent-torya-accent"
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
      </div>
      <div className="mt-1 text-[11px] text-torya-muted-2">
        <code className="text-torya-text">silent</code>은 Terminal.app을 띄우지
        않고 백그라운드로 에이전트를 실행합니다.
      </div>
    </>
  );
}

function installLink(agent: AgentName): string {
  switch (agent) {
    case 'claude':
      return 'https://docs.claude.com/en/docs/claude-code';
    case 'codex':
      return 'https://github.com/openai/codex';
    case 'gemini':
      return 'https://github.com/google-gemini/gemini-cli';
    default:
      return '';
  }
}

// ---------------------------------------------------------------- Direct mode

const VENDORS: Array<{ id: LlmVendor; label: string; sub: string; placeholder: string }> = [
  { id: 'claude', label: 'Claude', sub: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI', sub: 'gpt-* / o1-*', placeholder: 'sk-proj-...' },
  { id: 'gemini', label: 'Gemini', sub: 'Google',    placeholder: 'AIza...' },
];

function DirectModePanel({ state }: { state: StorageSchema }) {
  const dm = state.directMode;
  // Always show all vendors. The "visible" vendor in the select is
  // dm.active if set, otherwise default to Claude. The visible vendor is
  // also the "active for direct mode" iff it has a valid key.
  const visibleId: LlmVendor = dm.active ?? 'claude';
  const visible = VENDORS.find((v) => v.id === visibleId)!;
  const visibleKey = dm.keys[visibleId];
  const visibleHasKey = !!visibleKey;

  const setVisible = (id: LlmVendor) => {
    if (dm.active === id) return;
    void patch({ directMode: { ...dm, active: id } });
  };

  return (
    <>
      <p className="mb-2 text-torya-muted">
        Optional. Pick an LLM to apply in-place patches when running.
      </p>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-torya-muted">LLM:</span>
        <select
          className="flex-1 rounded border border-torya-border bg-torya-surface px-2 py-1 text-torya-text"
          value={visibleId}
          onChange={(e) => setVisible(e.target.value as LlmVendor)}
        >
          {VENDORS.map((v) => {
            const has = !!dm.keys[v.id];
            return (
              <option key={v.id} value={v.id}>
                {v.label} {has ? '· key set' : '· no key'}
              </option>
            );
          })}
        </select>
      </div>

      <VendorPanel
        vendor={visible}
        value={visibleKey}
        hasKey={visibleHasKey}
        state={state}
      />
    </>
  );
}

function VendorPanel({
  vendor,
  value,
  hasKey,
  state,
}: {
  vendor: (typeof VENDORS)[number];
  value: string | undefined;
  hasKey: boolean;
  state: StorageSchema;
}) {
  // When the vendor has no key, the editor opens automatically so the
  // user is prompted to set one inline. They can still cancel.
  const [editing, setEditing] = useState(!hasKey);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setEditing(!hasKey);
    setDraft('');
  }, [vendor.id, hasKey]);

  const save = async () => {
    if (!draft) return;
    await patch({
      directMode: {
        ...state.directMode,
        keys: { ...state.directMode.keys, [vendor.id]: draft },
        active: state.directMode.active ?? vendor.id,
      },
    });
    setEditing(false);
    setDraft('');
  };

  const remove = async () => {
    const keys = { ...state.directMode.keys };
    delete keys[vendor.id];
    const active = state.directMode.active === vendor.id ? null : state.directMode.active;
    await patch({ directMode: { ...state.directMode, keys, active } });
  };

  return (
    <div
      className={`rounded border px-3 py-2.5 ${
        hasKey
          ? 'border-torya-border bg-torya-surface'
          : 'border-torya-warn/40 bg-torya-warn-bg/30'
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-medium">{vendor.label}</span>
        <span className="text-torya-muted">{vendor.sub}</span>
      </div>

      {!hasKey && !editing && (
        <div className="mb-2 text-torya-warn">
          ⚠ No API key configured for {vendor.label}. Direct mode is off.
        </div>
      )}

      {editing ? (
        <div>
          {!hasKey && (
            <div className="mb-1.5 text-torya-muted">
              Paste your {vendor.label} API key:
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="password"
              autoFocus
              className="flex-1 rounded border border-torya-border bg-torya-bg px-2 py-1 font-mono text-[11px]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={vendor.placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape' && hasKey) {
                  setEditing(false);
                  setDraft('');
                }
              }}
            />
            <button
              className="rounded bg-torya-accent px-2 py-1 text-white hover:bg-torya-accent-strong disabled:opacity-40"
              onClick={save}
              disabled={!draft}
            >
              Save
            </button>
            {hasKey && (
              <button
                className="rounded border border-torya-border px-2 py-1 text-torya-muted hover:text-torya-text"
                onClick={() => {
                  setEditing(false);
                  setDraft('');
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-mono text-torya-muted">{maskKey(value!)}</span>
          <button
            className="ml-auto text-torya-muted hover:text-torya-text"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className="text-torya-muted hover:text-torya-danger"
            onClick={remove}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function maskKey(k: string): string {
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '••••' + k.slice(-4);
}

// ---------------------------------------------------------------- Capture rules

const CAPTURE_LABELS: Record<keyof StorageSchema['settings']['captureRules'], string> = {
  console: 'JS errors (window.error)',
  rejection: 'Unhandled promise rejections',
  network: 'Network 4xx/5xx',
  dom: 'DOM resource load failures (img/script/link)',
};

function AutoReloadPanel({ state }: { state: StorageSchema }) {
  const on = state.settings.autoReloadOnFix !== false;
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded border border-transparent px-2 py-1.5 hover:border-torya-border">
      <input
        type="checkbox"
        className="mt-0.5 accent-torya-accent"
        checked={on}
        onChange={(e) =>
          void patch({
            settings: {
              ...state.settings,
              autoReloadOnFix: e.target.checked,
            },
          })
        }
      />
      <span className="flex-1">
        <span className="block text-torya-text">
          Reload localhost tabs after a successful fix
        </span>
        <span className="mt-0.5 block text-torya-muted-2">
          Catches the common "HMR didn't pick up the edit" case. Turn off if
          your page holds in-memory state you don't want to lose.
        </span>
      </span>
    </label>
  );
}

function SwCapturePanel({ state }: { state: StorageSchema }) {
  const on = !!state.settings.captureServiceWorkerErrors;
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2 rounded border border-transparent px-2 py-1.5 hover:border-torya-border">
        <input
          type="checkbox"
          className="mt-0.5 accent-torya-accent"
          checked={on}
          onChange={(e) =>
            void patch({
              settings: {
                ...state.settings,
                captureServiceWorkerErrors: e.target.checked,
              },
            })
          }
        />
        <span className="flex-1">
          <span className="block text-torya-text">
            Attach Chrome debugger to localhost tabs
          </span>
          <span className="mt-0.5 block text-torya-muted-2">
            Required to catch errors thrown inside service workers (e.g. MSW).
            Shows a yellow{' '}
            <span className="text-torya-text">"Torya is debugging"</span> banner
            on each attached tab and prevents DevTools from attaching at the
            same time.
          </span>
        </span>
      </label>
    </div>
  );
}

function CapturePanel({ state }: { state: StorageSchema }) {
  const rules = state.settings.captureRules;
  return (
    <ul className="space-y-1">
      {(Object.keys(CAPTURE_LABELS) as Array<keyof typeof CAPTURE_LABELS>).map((k) => (
        <li key={k}>
          <label className="flex cursor-pointer items-center gap-2 rounded border border-transparent px-2 py-1 hover:border-torya-border">
            <input
              type="checkbox"
              className="accent-torya-accent"
              checked={rules[k]}
              onChange={(e) =>
                void patch({
                  settings: {
                    ...state.settings,
                    captureRules: { ...rules, [k]: e.target.checked },
                  },
                })
              }
            />
            <span className="text-torya-text">{CAPTURE_LABELS[k]}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

