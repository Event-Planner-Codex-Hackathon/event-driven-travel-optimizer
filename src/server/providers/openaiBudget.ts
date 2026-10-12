import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// GPT-5.4 mini standard text rates: $0.75 input / $4.50 output per million.
// With <=48 KB request JSON and <=1800 output tokens, reserve $0.10 per attempt.
// Reservations are never refunded: timeouts and failed requests can still be billed.
const RESERVATION_CENTS = 10;
let queue: Promise<unknown> = Promise.resolve();
export function openAiBudgetLimitCents(): number {
  const usd = Number(process.env.OPENAI_BUDGET_USD ?? 0);
  return Number.isFinite(usd) && usd > 0 ? Math.min(500, Math.floor(usd * 100)) : 0;
}
export async function reserveOpenAiAttempt(body: Record<string, unknown>): Promise<boolean> {
  if (body.model !== "gpt-5.4-mini" || !(Number(body.max_output_tokens) <= 1800) || Buffer.byteLength(JSON.stringify(body)) > 48_000) return false;
  const path = resolve(process.env.OPENAI_BUDGET_FILE ?? "data/runtime/openai-budget.json");
  const cap = openAiBudgetLimitCents();
  if (cap < RESERVATION_CENTS) return false;
  const run = queue.catch(() => undefined).then(async () => {
    await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
    const lock = await open(`${path}.lock`, "wx", 0o600).catch(() => null);
    if (!lock) return false;
    try {
    let reserved = 0;
    try {
      const ledger = JSON.parse(await readFile(path, "utf8"));
      if (!Number.isSafeInteger(ledger.reservedCents) || ledger.reservedCents < 0) return false;
      reserved = ledger.reservedCents;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
    }
    if (reserved + RESERVATION_CENTS > cap) return false;
    try {
      await mkdir(dirname(path), { recursive: true });
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify({ reservedCents: reserved + RESERVATION_CENTS, capCents: cap, model: "gpt-5.4-mini" }), { mode: 0o600 });
      await rename(temp, path);
      return true;
    } catch { return false; }
    } finally { await lock.close().catch(() => undefined); await unlink(`${path}.lock`).catch(() => undefined); }
  });
  queue = run;
  return run;
}

export async function fundedOpenAiFetch(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_SPEND_AUTHORIZED !== "true" || !await reserveOpenAiAttempt(body)) return null;
  return fetcher("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000), cache: "no-store", body: JSON.stringify(body),
  });
}
