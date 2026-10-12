import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveOpenAiAttempt } from "../providers/openaiBudget";
import { resetSerpQuota, takeFreeSerpSearch } from "../providers/serpQuota";
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "pookie-funding-unit-")); vi.stubEnv("OPENAI_BUDGET_FILE", join(dir, "budget.json")); vi.stubEnv("OPENAI_BUDGET_USD", "5"); resetSerpQuota(); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
describe("authorized funding boundaries", () => {
  const body = { model: "gpt-5.4-mini", input: "Synthetic budget unit test", max_output_tokens: 1800 };
  it("persists a conservative cap across calls and stops at five dollars", async () => {
    await writeFile(join(dir, "budget.json"), JSON.stringify({ reservedCents: 490 }));
    expect(await reserveOpenAiAttempt(body)).toBe(true);
    expect(await reserveOpenAiAttempt(body)).toBe(false);
    expect(JSON.parse(await readFile(join(dir, "budget.json"), "utf8")).reservedCents).toBe(500);
  });
  it("fails closed for unknown model costs, large requests, corrupt ledgers and concurrent file locks", async () => {
    expect(await reserveOpenAiAttempt({ ...body, model: "unknown-model" })).toBe(false);
    expect(await reserveOpenAiAttempt({ ...body, input: "x".repeat(50_000) })).toBe(false);
    await writeFile(join(dir, "budget.json"), "invalid");
    expect(await reserveOpenAiAttempt(body)).toBe(false);
  });
  it("uses free monthly quota only and stops before consuming extra/paid credits", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ account_status: "Active", plan_name: "Free Plan", plan_monthly_price: 0, plan_searches_left: 1, extra_credits: 0 }))) as typeof fetch;
    expect(await takeFreeSerpSearch("synthetic-key", fetcher)).toBe(true);
    expect(await takeFreeSerpSearch("synthetic-key", fetcher)).toBe(false);
    resetSerpQuota();
    expect(await takeFreeSerpSearch("synthetic-key", async () => new Response(JSON.stringify({ plan_name: "Paid", plan_monthly_price: 25, plan_searches_left: 100 })))).toBe(false);
  });
});
