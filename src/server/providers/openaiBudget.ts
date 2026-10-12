/** Runtime spending is authorized explicitly; hourly/total caps remain in limited.ts. */
export function openAiRequestWithinBounds(body: Record<string, unknown>): boolean {
  return typeof body.model === "string" && body.model.trim().length > 0 && body.model.length <= 100
    && Number.isSafeInteger(body.max_output_tokens) && Number(body.max_output_tokens) > 0
    && Number(body.max_output_tokens) <= 1800 && Buffer.byteLength(JSON.stringify(body)) <= 48_000;
}

export async function fundedOpenAiFetch(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_SPEND_AUTHORIZED !== "true" || !openAiRequestWithinBounds(body)) return null;
  return fetcher("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000), cache: "no-store", body: JSON.stringify(body),
  });
}
