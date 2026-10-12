import { NextResponse } from "next/server";
import type { ApiError } from "@/contract/trip";

export function apiError(status: number, code: ApiError["error"]["code"], message: string, details?: unknown) {
  return NextResponse.json<ApiError>({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
