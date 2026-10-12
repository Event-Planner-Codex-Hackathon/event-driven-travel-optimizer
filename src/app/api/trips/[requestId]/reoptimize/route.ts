import { NextResponse } from "next/server";
import { reoptimizeBodySchema, type TripResponse } from "@/contract/trip";
import { apiError, readBodyOr413 } from "@/server/http";
import { getFxRates } from "@/server/providers/fx";
import { reoptimizeTrip } from "@/server/trips";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const body = await readBodyOr413(req);
  if (!body.ok) return body.response;
  const parsed = reoptimizeBodySchema.safeParse(body.body);
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues);
  try {
    const fx = await getFxRates();
    const result = reoptimizeTrip(requestId, parsed.data.changes, parsed.data.baseRequest, fx, parsed.data.baseRequirementsVersion);
    if (!result.ok) return apiError(result.code === "invalid_body" ? 400 : 404, result.code, result.message);
    return NextResponse.json<TripResponse>(result.response);
  } catch (err) {
    console.error("reoptimize failed", err);
    return apiError(500, "internal", "Could not recalculate this trip.");
  }
}
