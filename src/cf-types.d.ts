// Cloudflare Workers types for Sur & Swag backend
// Minimal declarations — full types require @cloudflare/workers-types

interface R2Bucket {
  createSignedUrl(key: string, options?: { method?: string; expirySeconds?: number }): Promise<string>;
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: unknown, options?: unknown): Promise<R2Object>;
  delete(key: string): Promise<void>;
}

interface R2Object {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  name?: string;
}

interface DurableObjectStub {
  fetch(request: Request | string): Promise<Response>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
  id: DurableObjectId;
  blockConcurrencyWhile<T>(cb: () => Promise<T>): Promise<T>;
}

interface ResponseInit {
  webSocket?: WebSocket;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { limit?: number; prefix?: string; start?: string; end?: string }): Promise<Map<string, T>>;
}

declare abstract class DurableObject<EnvType = unknown> {
  ctx: DurableObjectState;
  state: DurableObjectState;
  constructor(ctx: DurableObjectState, env: EnvType);
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare var WebSocketPair: {
  new(): WebSocketPair;
};

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
