import type { AgentName, DevError } from '@/types';

interface Props {
  err: DevError;
  onRun: (agent: AgentName) => void;
  onDismiss: () => void;
}

export function ErrorCard({ err, onRun, onDismiss }: Props) {
  const icon =
    err.source === 'console' ? '🔴' : err.source === 'network' ? '🟠' : '🟡';
  const where = err.meta.file
    ? `${err.meta.file}${err.meta.line ? `:${err.meta.line}` : ''}`
    : err.url;

  return (
    <div className="rounded-lg border border-torya-border bg-torya-surface p-3 text-sm">
      <div className="flex items-start gap-2">
        <span>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="break-words text-torya-text">{err.message}</div>
          <div className="mt-1 truncate text-xs text-torya-muted">{where}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded bg-torya-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          onClick={() => onRun('claude')}
          disabled={err.status === 'running'}
        >
          🌉 Fix with Claude
        </button>
        <button
          className="rounded border border-torya-border px-2 py-1 text-xs text-torya-text hover:bg-torya-border"
          onClick={onDismiss}
        >
          Dismiss
        </button>
        {err.status === 'running' && (
          <span className="text-xs text-torya-muted">running…</span>
        )}
        {err.status === 'fixed' && (
          <span className="text-xs text-emerald-400">✅ fixed</span>
        )}
        {err.status === 'failed' && (
          <span className="text-xs text-red-400">failed</span>
        )}
      </div>
    </div>
  );
}
