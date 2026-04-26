import type { BridgeRequest, BridgeResponse } from '@/types';

const HOST_NAME = 'com.torya.bridge';

export type StreamHandler = (msg: BridgeResponse) => void;

export class NativeBridge {
  private port: chrome.runtime.Port | null = null;
  private pending = new Map<
    string,
    { resolve: (m: BridgeResponse) => void; reject: (e: Error) => void; stream?: StreamHandler }
  >();
  private reqSeq = 0;

  connect(): boolean {
    if (this.port) return true;
    try {
      this.port = chrome.runtime.connectNative(HOST_NAME);
      this.port.onMessage.addListener((m) => this.onMessage(m as BridgeResponse));
      this.port.onDisconnect.addListener(() => this.onDisconnect());
      return true;
    } catch {
      this.port = null;
      return false;
    }
  }

  isConnected(): boolean {
    return this.port !== null;
  }

  disconnect(): void {
    this.port?.disconnect();
    this.port = null;
  }

  /** Single response request/response. */
  async send<T = unknown>(cmd: string, args?: unknown, timeoutMs = 15_000): Promise<T> {
    if (!this.port && !this.connect()) {
      throw new Error('bridge_not_connected');
    }
    const id = this.nextId();
    const req: BridgeRequest = { v: 1, id, cmd, args };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout: ${cmd}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (m) => {
          clearTimeout(timer);
          if (m.kind === 'ok') resolve(m.data as T);
          else reject(new Error(m.error?.message ?? 'bridge_error'));
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.port!.postMessage(req);
    });
  }

  /** Streaming request — onMessage fires for each chunk; resolves on `exit`. */
  stream(
    cmd: string,
    args: unknown,
    onMsg: StreamHandler
  ): { id: string; done: Promise<BridgeResponse> } {
    if (!this.port && !this.connect()) {
      throw new Error('bridge_not_connected');
    }
    const id = this.nextId();
    const req: BridgeRequest = { v: 1, id, cmd, args };
    const done = new Promise<BridgeResponse>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (m) => resolve(m),
        reject,
        stream: onMsg,
      });
      this.port!.postMessage(req);
    });
    return { id, done };
  }

  private onMessage(m: BridgeResponse): void {
    const entry = this.pending.get(m.id);
    if (!entry) return;
    if (entry.stream) {
      entry.stream(m);
      if (m.kind === 'exit' || m.kind === 'err') {
        this.pending.delete(m.id);
        entry.resolve(m);
      }
      return;
    }
    if (m.kind === 'ok' || m.kind === 'err') {
      this.pending.delete(m.id);
      entry.resolve(m);
    }
  }

  private onDisconnect(): void {
    const err = chrome.runtime.lastError;
    this.port = null;
    for (const [, entry] of this.pending) {
      entry.reject(new Error(err?.message ?? 'bridge_disconnected'));
    }
    this.pending.clear();
  }

  private nextId(): string {
    this.reqSeq += 1;
    return `r${Date.now().toString(36)}-${this.reqSeq}`;
  }
}

export const bridge = new NativeBridge();
