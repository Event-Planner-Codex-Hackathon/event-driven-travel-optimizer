import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fundedOpenAiFetch, openAiRequestWithinBounds } from "../providers/openaiBudget";
import { resetSerpQuota, takeFreeSerpSearch } from "../providers/serpQuota";
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key"); vi.stubEnv("OPENAI_SPEND_AUTHORIZED", "true"); resetSerpQuota(); });
afterEach(() => { vi.unstubAllEnvs(); });
describe("authorized funding boundaries", () => {
  const body = { model: "gpt-6.1-sol", input: "Synthetic funding unit test", max_output_tokens: 1800 };
  it("allows the configured Sol model without a dollar ledger", async () => {
    vi.stubEnv("OPENAI_BUDGET_USD", "0");
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    expect(await fundedOpenAiFetch(body, fetcher)).toBeInstanceOf(Response);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).model).toBe("gpt-6.1-sol");
  });
  it("still rejects oversized requests and requires explicit spend authorization", async () => {
    for (const max_output_tokens of [0, -1, 1801, 1.5, NaN]) expect(openAiRequestWithinBounds({ ...body, max_output_tokens })).toBe(false);
    expect(openAiRequestWithinBounds({ ...body, input: "x".repeat(50_000) })).toBe(false);
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));
    vi.stubEnv("OPENAI_SPEND_AUTHORIZED", "false");
    expect(await fundedOpenAiFetch(body, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses free monthly quota only and stops before consuming extra/paid credits", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ account_status: "Active", plan_name: "Free Plan", plan_monthly_price: 0, plan_searches_left: 1, extra_credits: 0 }))) as typeof fetch;
    expect(await takeFreeSerpSearch("synthetic-key", fetcher)).toBe(true);
    expect(await takeFreeSerpSearch("synthetic-key", fetcher)).toBe(false);
    resetSerpQuota();
    expect(await takeFreeSerpSearch("synthetic-key", async () => new Response(JSON.stringify({ plan_name: "Paid", plan_monthly_price: 25, plan_searches_left: 100 })))).toBe(false);
  });
});
