import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const falMocks = vi.hoisted(() => ({
  config: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
  result: vi.fn(),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: falMocks.config,
    queue: { submit: falMocks.submit, status: falMocks.status, result: falMocks.result },
  },
}));

import { getOrCreateHero, type HeroContext } from "../hero";

const ctx = (eventName: string): HeroContext => ({ title: "Test trip", cities: ["Istanbul", "Singapore"], eventName });
const originalFalKey = process.env.FAL_KEY;

beforeEach(() => {
  process.env.FAL_KEY = "test-only-fake-key";
  falMocks.config.mockReset();
  falMocks.submit.mockReset().mockResolvedValue({ request_id: "fake-request-id" });
  falMocks.status.mockReset().mockResolvedValue({ status: "COMPLETED" });
  falMocks.result.mockReset().mockResolvedValue({ data: { images: [{ url: "https://fal.media/fake.jpg" }] } });
});

afterEach(() => {
  if (originalFalKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = originalFalKey;
});

describe("Fal queue billing safeguards (mocked)", () => {
  it("deduplicates parallel callers and charges only the submitter", async () => {
    const context = ctx("Parallel Fake Event");
    const [first, second] = await Promise.all([getOrCreateHero(context), getOrCreateHero(context)]);
    expect(falMocks.submit).toHaveBeenCalledTimes(1);
    expect(falMocks.status).toHaveBeenCalledTimes(1);
    expect([first.newGeneration, second.newGeneration].sort()).toEqual([false, true]);
    expect(first.ok && first.heroImage.url).toBe("https://fal.media/fake.jpg");
    expect(second.ok && second.heroImage.url).toBe("https://fal.media/fake.jpg");
  });

  it("keeps a queued request id after a transient status failure and resumes it", async () => {
    const context = ctx("Transient Fake Event");
    falMocks.status.mockRejectedValueOnce(new Error("fake transport failure"));
    const first = await getOrCreateHero(context);
    expect(first.ok).toBe(false);
    expect(first.newGeneration).toBe(true);
    expect(falMocks.submit).toHaveBeenCalledTimes(1);

    const retry = await getOrCreateHero(context);
    expect(retry.ok).toBe(true);
    expect(retry.newGeneration).toBe(false);
    expect(falMocks.submit).toHaveBeenCalledTimes(1);
    expect(falMocks.status).toHaveBeenCalledTimes(2);
  });
});
