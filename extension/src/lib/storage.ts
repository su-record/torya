import type { StorageSchema, Workspace, DevError, AgentInfo, Settings } from '@/types';

const DEFAULTS: StorageSchema = {
  schemaVersion: 1,
  onboarding: { completed: false, step: 1 },
  bridge: {},
  workspaces: [],
  agents: [],
  settings: {
    defaultAgent: 'claude',
    terminalPreference: 'cmux',
    autoDirectMode: false,
    captureRules: { console: true, rejection: true, network: true, dom: true },
    ignoreOrigins: [],
    captureServiceWorkerErrors: true,
    autoReloadOnFix: true,
  },
  directMode: { active: null, keys: {} },
  errors: [],
};

export async function load(): Promise<StorageSchema> {
  const got = (await chrome.storage.local.get(null)) as Partial<StorageSchema>;
  // Settings is the only nested object whose keys grow over time. Merge it
  // one level deep so newly-added defaults (e.g. a freshly-shipped toggle)
  // light up for existing users instead of silently sticking on the old
  // (false) value just because the parent object was already persisted.
  return {
    ...DEFAULTS,
    ...got,
    settings: { ...DEFAULTS.settings, ...(got.settings ?? {}) },
  };
}

export async function patch(p: Partial<StorageSchema>): Promise<void> {
  await chrome.storage.local.set(p);
}

export async function pushError(e: DevError): Promise<void> {
  const cur = await load();
  const next = [e, ...cur.errors].slice(0, 50);
  await patch({ errors: next });
}

export async function updateError(id: string, p: Partial<DevError>): Promise<void> {
  const cur = await load();
  const next = cur.errors.map((e) => (e.id === id ? { ...e, ...p } : e));
  await patch({ errors: next });
}

export async function upsertWorkspace(w: Workspace): Promise<void> {
  const cur = await load();
  const idx = cur.workspaces.findIndex((x) => x.id === w.id);
  const next = [...cur.workspaces];
  if (idx >= 0) next[idx] = w;
  else next.push(w);
  await patch({ workspaces: next });
}

export async function setAgents(agents: AgentInfo[]): Promise<void> {
  await patch({ agents });
}

export async function setSettings(settings: Settings): Promise<void> {
  await patch({ settings });
}

export function findWorkspaceForOrigin(
  workspaces: Workspace[],
  origin: string
): Workspace | undefined {
  return workspaces.find((w) => matchOrigin(w.originPattern, origin));
}

function matchOrigin(pattern: string, origin: string): boolean {
  if (pattern === origin) return true;
  // Very simple wildcard: "*://localhost:*"
  const re = new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  );
  return re.test(origin);
}
