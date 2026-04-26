export type AgentName = 'claude' | 'codex' | 'gemini' | 'cmux';

export type ErrorSource = 'console' | 'network' | 'dom';
export type ErrorSeverity = 'error' | 'warn';
export type ErrorStatus = 'new' | 'running' | 'fixed' | 'failed' | 'dismissed';

export interface DevError {
  id: string;
  capturedAt: number;
  source: ErrorSource;
  severity: ErrorSeverity;
  origin: string;
  url: string;
  message: string;
  stack?: string;
  meta: {
    file?: string;
    line?: number;
    col?: number;
    request?: { method: string; url: string; status: number; body?: string };
    domSnippet?: string;
  };
  workspaceId?: string;
  status: ErrorStatus;
}

export interface Workspace {
  id: string;
  name: string;
  originPattern: string;
  rootPath: string;
  defaultAgent: AgentName;
  terminalPreference: 'cmux' | 'system';
}

export interface AgentInfo {
  name: AgentName;
  available: boolean;
  path?: string;
  version?: string;
  rpc?: string;
}

export interface CaptureRules {
  console: boolean;
  rejection: boolean;
  network: boolean;
  dom: boolean;
}

export interface Settings {
  defaultAgent: AgentName;
  terminalPreference: 'cmux' | 'system';
  autoDirectMode: boolean;
  captureRules: CaptureRules;
  ignoreOrigins: string[];
}

export interface OnboardingState {
  completed: boolean;
  step: 1 | 2 | 3 | 4;
}

export interface BridgeState {
  lastSeenAt?: number;
  version?: string;
  os?: string;
  arch?: string;
}

export type LlmVendor = 'claude' | 'openai' | 'gemini';

export interface DirectModeState {
  active: LlmVendor | null;
  keys: Partial<Record<LlmVendor, string>>;
}

export interface StorageSchema {
  schemaVersion: 1;
  onboarding: OnboardingState;
  bridge: BridgeState;
  workspaces: Workspace[];
  agents: AgentInfo[];
  settings: Settings;
  directMode: DirectModeState;
  errors: DevError[];
}

// ----- Native Messaging protocol (mirrored in bridge) -----

export interface BridgeRequest<A = unknown> {
  v: 1;
  id: string;
  cmd: string;
  args?: A;
}

export interface BridgeResponse<D = unknown> {
  v: 1;
  id: string;
  kind: 'ok' | 'err' | 'stdout' | 'stderr' | 'progress' | 'exit';
  data?: D;
  error?: { code: string; message: string };
}

// ----- Internal extension messages -----

export type ExtMsg =
  | { type: 'capture/console'; payload: ConsoleErrorPayload }
  | { type: 'capture/network'; payload: NetworkErrorPayload }
  | { type: 'capture/dom'; payload: DomErrorPayload }
  | { type: 'error/dismiss'; id: string }
  | { type: 'error/run-agent'; id: string; agent: AgentName }
  | { type: 'error/quick-fix'; id: string }
  | { type: 'bridge/status' }
  | { type: 'bridge/pick-folder'; title?: string }
  | { type: 'bridge/detect-project'; origin: string }
  | { type: 'workspace/upsert'; workspace: Workspace }
  | { type: 'agents/redetect' }
  | { type: 'errors/clear' };

export interface DetectedProject {
  port: number;
  pid: number;
  cwd: string;
  command?: string;
}

export interface ConsoleErrorPayload {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  origin: string;
  url: string;
  ts: number;
  kind: 'error' | 'rejection';
}

export interface NetworkErrorPayload {
  method: string;
  url: string;
  status: number;
  origin: string;
  pageUrl: string;
  ts: number;
}

export interface DomErrorPayload {
  message: string;
  snippet?: string;
  origin: string;
  url: string;
  ts: number;
}
