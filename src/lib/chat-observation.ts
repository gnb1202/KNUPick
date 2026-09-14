import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { CAPTURE_LIMIT_BYTES, OBSERVATION_VERSION, type Json, type ObservationIdentity, type ObservationPayload, type ObservationStatus, type ObservationWrite } from './chat-observation-types';
import { currentUsageMeter } from './usage-meter';

export const contentHash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function redactText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일]')
    .replace(/(?<!\d)(?:\+82[- .]?)?0?1[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, '[전화번호]')
    .replace(/(학번\s*[:：]?\s*)\d{8,10}(?!\d)/g, '$1[학번]')
    .replace(/(?<!\d)20\d{7}(?!\d)/g, '[학번]');
}
// Whitelisted call sites still pass through this final guard before persistence.
export function safeJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(safeJson);
  if (typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/^(reasoning|authorization|cookie|contextToken|api[_-]?key|access[_-]?token|refresh[_-]?token|query_embedding|embedding)$/i.test(key))
    .map(([key, item]) => [key, safeJson(item)]));
}

const scope = new AsyncLocalStorage<ChatObservation>();
export const currentObservation = () => scope.getStore();
export const withObservation = <T>(observation: ChatObservation, run: () => T): T => scope.run(observation, run);
export const observationSignal = () => currentObservation()?.signal;

export class ChatObservation {
  private payload: ObservationPayload = {
    schemaVersion: OBSERVATION_VERSION, redactionVersion: 'pii-patterns-v1', question: '', history: [],
    versions: {}, reference: null, search: null, posts: [], evidence: [], calls: [], answer: '', captureTruncated: false, usage: null,
  };
  private active = false;
  private terminal = false;
  private checkpointed = false;
  private revision = 0;
  private firstTextMs: number | null = null;
  private meter: ReturnType<typeof currentUsageMeter>;
  private writes: Promise<void> = Promise.resolve();
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private detach?: () => void;
  readonly signal = this.controller.signal;
  constructor(readonly requestId: string, private userId: string, private identity: ObservationIdentity,
    private write: (record: ObservationWrite) => Promise<void>, incoming?: AbortSignal, readonly started = Date.now()) {
    if (incoming) {
      const abort = () => this.cancel();
      incoming.addEventListener('abort', abort, { once: true });
      this.detach = () => incoming.removeEventListener('abort', abort);
      if (incoming.aborted) this.cancel();
    }
  }
  start(history: ObservationPayload['history'], versions: Record<string, string>, reference: unknown) {
    if (this.active || this.terminal) return;
    this.active = true;
    this.meter = currentUsageMeter();
    this.payload.history = history.map(m => ({ role: m.role, content: redactText(m.content) }));
    this.payload.question = redactText(history.at(-1)?.content ?? '');
    this.payload.versions = versions;
    this.payload.reference = safeJson(reference);
    this.save('in_progress');
    // Leave headroom below the 60-second function limit for final persistence.
    this.timer = setTimeout(() => this.cancel('timed_out'), Math.max(1, 55_000 - (Date.now() - this.started)));
    this.timer.unref?.();
    console.info(JSON.stringify({ event: 'chat.capture_start', requestId: this.requestId, version: OBSERVATION_VERSION }));
  }
  setSearch(value: unknown) { if (!this.terminal) this.payload.search = safeJson(value); }
  begin(name: string, input: unknown = {}) {
    if (!this.active || this.terminal) return () => {};
    const call: ObservationPayload['calls'][number] = { seq: this.payload.calls.length + 1, name,
      startedMs: Date.now() - this.started, status: 'running', input: safeJson(input) };
    this.payload.calls.push(call);
    return (output: unknown = {}, errorCode?: string) => {
      if (call.status !== 'running' || this.terminal) return;
      call.durationMs = Date.now() - this.started - call.startedMs;
      call.status = errorCode ? 'error' : 'success'; call.output = safeJson(output);
      if (errorCode) call.errorCode = errorCode;
    };
  }
  event(raw: unknown) {
    if (!this.active || this.terminal || !raw || typeof raw !== 'object') return;
    const e = raw as Record<string, unknown>;
    if (e.type === 'posts' && Array.isArray(e.posts)) this.payload.posts = e.posts.map(safeJson);
    if (e.type === 'evidence' && Array.isArray(e.evidence)) {
      this.payload.evidence = e.evidence.map(item => safeJson({ ...item, content_hash: contentHash(item.text_content ?? '') }));
      if (!this.checkpointed) { this.checkpointed = true; this.save('in_progress'); }
    }
    if (e.type === 'text' && typeof e.delta === 'string') {
      if (e.delta && this.firstTextMs === null) this.firstTextMs = Date.now() - this.started;
      // Redact the concatenated answer at snapshot time: PII may cross token boundaries.
      const next = this.payload.answer + e.delta;
      this.payload.answer = next.slice(0, 64_000);
      if (next.length > 64_000) this.payload.captureTruncated = true;
    }
    if (e.type === 'done') this.finish('completed');
    if (e.type === 'error') this.finish('error', typeof e.code === 'string' ? e.code : 'STREAM_FAILED');
  }
  cancel(status: 'cancelled' | 'timed_out' = 'cancelled') {
    this.finish(status, status === 'timed_out' ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED');
    this.controller.abort();
  }
  finish(status: Exclude<ObservationStatus, 'in_progress'>, errorCode?: string) {
    if (this.terminal) return;
    this.terminal = true; this.detach?.(); clearTimeout(this.timer);
    if (this.active) this.save(status, errorCode);
  }
  flush() { return this.writes; }
  private snapshot(): ObservationPayload {
    const payload = structuredClone(this.payload);
    payload.answer = redactText(payload.answer);
    payload.usage = this.meter?.report() ?? null;
    const oversized = () => Buffer.byteLength(JSON.stringify(payload), 'utf8') > CAPTURE_LIMIT_BYTES - 2048;
    while (oversized() && payload.history.length) { payload.history.shift(); payload.captureTruncated = true; }
    while (oversized() && payload.calls.length) { payload.calls.shift(); payload.captureTruncated = true; }
    while (oversized() && payload.posts.length) { payload.posts.pop(); payload.captureTruncated = true; }
    while (oversized() && payload.answer.length) { payload.answer = payload.answer.slice(0, Math.floor(payload.answer.length / 2)); payload.captureTruncated = true; }
    while (oversized() && payload.evidence.length) { payload.evidence.pop(); payload.captureTruncated = true; }
    if (oversized()) { payload.search = null; payload.reference = null; payload.captureTruncated = true; }
    return payload;
  }
  private save(status: ObservationStatus, errorCode?: string) {
    const ended = status !== 'in_progress';
    const record: ObservationWrite = {
      request_id: this.requestId, tester_user_id: this.userId, session_id: this.identity.sessionId,
      previous_request_id: this.identity.previousRequestId ?? null, consent_version: this.identity.consentVersion,
      started_at: new Date(this.started).toISOString(), revision: ++this.revision, status,
      ended_at: ended ? new Date().toISOString() : null, duration_ms: ended ? Date.now() - this.started : null,
      first_text_ms: this.firstTextMs, error_code: errorCode ?? null, payload: this.snapshot(),
    };
    this.writes = this.writes.then(async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([this.write(record), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('CAPTURE_TIMEOUT')), 1800);
        })]);
      } finally { clearTimeout(timer); }
    }).catch(() => {
      // Raw provider/database errors can contain user input or connection details.
      console.error(JSON.stringify({ event: 'chat.capture_failed', requestId: this.requestId, revision: record.revision, code: 'CAPTURE_WRITE_FAILED' }));
    });
  }
}

/** Instrument actual calls, not model reasoning. The caller chooses safe fields. */
export async function observeCall<T>(name: string, input: unknown, run: () => PromiseLike<T>, output: (value: T) => unknown = () => ({})): Promise<T> {
  const end = currentObservation()?.begin(name, input);
  try { const value = await run(); end?.(output(value)); return value; }
  catch (error) { end?.({}, 'CALL_FAILED'); throw error; }
}
