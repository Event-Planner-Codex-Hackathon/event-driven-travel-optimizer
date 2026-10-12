type Quota = { key: string; remaining: number; expires: number };
let quota: Quota | undefined;
let pending: Promise<Quota | null> | undefined;

/** Account API is free/non-metered. Never consume paid plans or extra credits. */
export async function takeFreeSerpSearch(key: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!quota || quota.key !== key || quota.expires <= Date.now()) {
    if (!pending) pending = (async () => {
      try {
        const url = new URL("https://serpapi.com/account.json"); url.searchParams.set("api_key", key);
        const res = await fetcher(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.account_status !== "Active" || data.plan_monthly_price !== 0 || !/free/i.test(String(data.plan_name)) || Number(data.extra_credits ?? 0) > 0 || !Number.isSafeInteger(data.plan_searches_left) || data.plan_searches_left <= 0) return null;
        return { key, remaining: data.plan_searches_left, expires: Date.now() + 60_000 };
      } catch { return null; }
    })().finally(() => { pending = undefined; });
    const value = await pending;
    if (!value || value.key !== key) return false;
    quota = value;
  }
  if (quota.remaining <= 0) return false;
  quota.remaining--;
  return true;
}
export function resetSerpQuota() { quota = undefined; pending = undefined; }
