import { NextResponse } from "next/server";
import { reoptimizeBodySchema, type NormalizedRequest, type TripResponse } from "@/contract/trip";
import { apiError, readJson } from "@/server/http";
import { reoptimizeTrip } from "@/server/trips";

export const runtime = "nodejs";

function looksLikeRequest(v: unknown): v is NormalizedRequest {
  const r = v as NormalizedRequest | undefined;
  return !!r && typeof r.origin?.city === "string" && typeof r.event?.city === "string" && typeof r.budget?.amountMinor === "number";
}

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const parsed = reoptimizeBodySchema.safeParse(await readJson(req));
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues);
  const base = looksLikeRequest(parsed.data.baseRequest) ? parsed.data.baseRequest : undefined;
  try {
    const result = reoptimizeTrip(requestId, parsed.data.changes, base);
    if (!result.ok) return apiError(404, result.code, result.message);
    return NextResponse.json<TripResponse>(result.response);
  } catch (err) {
    console.error("reoptimize failed", err);
    return apiError(500, "internal", "Could not recalculate this trip.");
  }
}
