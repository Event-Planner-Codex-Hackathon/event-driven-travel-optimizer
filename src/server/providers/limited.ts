/** Bounded process-local cache, in-flight sharing and outbound attempt caps. */
export type Lookup<T> = { value: T; spentProviderCall: boolean; fromCache: boolean } | { blocked: true };
type Entry = { expires: number; value: unknown };
type State = { cache: Map<string, Entry>; pending: Map<string, Promise<unknown>>; usage: Map<string, { times: number[]; total: number }> };
const g = globalThis as typeof globalThis & { __eventhopperLimited?: State };
const state: State = (g.__eventhopperLimited ??= { cache: new Map(), pending: new Map(), usage: new Map() });
const cap = (name: string, fallback: number) => {
  const value = process.env[name];
  const n = value === undefined ? fallback : Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, fallback) : 0;
};

export async function limited<T>(
  provider: "OPENAI" | "GEOAPIFY", key: string, ttlMs: number,
  defaults: { hourly: number; total: number }, run: () => Promise<T>, cacheable: (value: T) => boolean,
): Promise<Lookup<T>> {
  const now = Date.now();
  const scope = `${provider}|${key}`;
  const hit = state.cache.get(scope);
  if (hit && hit.expires > now) return { value: hit.value as T, spentProviderCall: false, fromCache: true };
  const pending = state.pending.get(scope);
  if (pending) return { value: await pending as T, spentProviderCall: false, fromCache: true };
  const usage = state.usage.get(provider) ?? { times: [], total: 0 };
  usage.times = usage.times.filter((t) => now - t < 3_600_000);
  state.usage.set(provider, usage);
  if (usage.times.length >= cap(`${provider}_MAX_CALLS_PER_HOUR`, defaults.hourly) || usage.total >= cap(`${provider}_MAX_CALLS_TOTAL`, defaults.total)) return { blocked: true };
  usage.times.push(now);
  usage.total++;
  const job = Promise.resolve().then(run).then((value) => {
    if (cacheable(value)) {
      for (const [k, entry] of state.cache) if (entry.expires <= now) state.cache.delete(k);
      if (state.cache.size >= 200) state.cache.delete(state.cache.keys().next().value!);
      state.cache.set(scope, { expires: Date.now() + ttlMs, value });
    }
    return value;
  }).finally(() => state.pending.delete(scope));
  state.pending.set(scope, job);
  return { value: await job, spentProviderCall: true, fromCache: false };
}

export function resetLimitedState(): void {
  state.cache.clear(); state.pending.clear(); state.usage.clear();
}
