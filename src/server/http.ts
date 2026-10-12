import { NextResponse } from "next/server";
import type { ApiError } from "@/contract/trip";
import { attachGuestCookie, type Guest } from "./guest";

/** Largest JSON body any endpoint accepts. Requests are small; this bounds memory before parsing. */
export const MAX_BODY_BYTES = 32 * 1024;

export function apiError(
  status: number,
  code: ApiError["error"]["code"],
  message: string,
  details?: unknown,
  opts: { guest?: Guest; retryAfterSeconds?: number } = {},
) {
  const res = NextResponse.json<ApiError>({ error: { code, message, ...(details ? { details } : {}) } }, { status });
  if (opts.retryAfterSeconds) res.headers.set("Retry-After", String(opts.retryAfterSeconds));
  return opts.guest ? attachGuestCookie(res, opts.guest) : res;
}

export class BodyTooLargeError extends Error {}

/** Parse a JSON body; undefined when empty or malformed. Throws BodyTooLargeError over MAX_BODY_BYTES. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLargeError();
  if (!req.body) return undefined;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Read the body, mapping an oversized body to a 413 response. */
export async function readBodyOr413(req: Request, guest?: Guest): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await readJson(req) };
  } catch (err) {
    if (err instanceof BodyTooLargeError)
      return { ok: false, response: apiError(413, "invalid_body", `Request body is larger than ${MAX_BODY_BYTES / 1024} KB.`, undefined, { guest }) };
    throw err;
  }
}
