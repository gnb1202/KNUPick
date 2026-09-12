import { AsyncLocalStorage } from 'node:async_hooks';

export type UsageCall = { id: number; kind: 'chat' | 'embedding'; model: string;
  inputTokens: number | null; outputTokens: number | null; complete: boolean };
export type UsageReport = { version: 'chat-embedding-v1'; complete: boolean; calls: UsageCall[] };
const scope = new AsyncLocalStorage<UsageMeter>();
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
export class UsageMeter {
  private calls: UsageCall[] = [];
  private supported = true;
  unsupported() { this.supported = false; }
  begin(kind: UsageCall['kind'], model: string) {
    const call: UsageCall = { id: this.calls.length + 1, kind, model, inputTokens: null, outputTokens: null, complete: false };
    this.calls.push(call);
    let observed = false, invalid = false;
    const observe = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') { invalid = true; return; }
      const u = raw as Record<string, unknown>, input = u.prompt_tokens, output = kind === 'embedding' ? 0 : u.completion_tokens;
      if (!integer(input) || !integer(output) || !integer(u.total_tokens) || u.total_tokens !== input + output) { invalid = true; return; }
      if (observed && (call.inputTokens !== input || call.outputTokens !== output)) invalid = true;
      call.inputTokens = input; call.outputTokens = output; observed = true;
    };
    return { observe, finish: () => { call.complete = observed && !invalid; } };
  }
  report(): UsageReport { return { version: 'chat-embedding-v1', complete: this.supported && this.calls.every(c => c.complete), calls: this.calls.map(c => ({ ...c })) }; }
}
export const currentUsageMeter = () => scope.getStore();
export const withUsageMeter = <T>(run: () => T): T => scope.run(new UsageMeter(), run);
export const beginUsage = (kind: UsageCall['kind'], model: string) => currentUsageMeter()?.begin(kind, model);
// Exact attempt accounting is enabled only inside the isolated evaluation scope.
export const meteredRequestOptions = () => currentUsageMeter() ? { maxRetries: 0 } : {};
