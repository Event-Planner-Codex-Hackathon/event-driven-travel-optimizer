/**
 * Typed browser client for the EventHopper API. UI code should call these
 * functions instead of fetch() directly, so a mock or a new backend can be
 * swapped in one place.
 */
import type {
  ApiError,
  HeroResponse,
  NormalizedRequest,
  OptimizeBody,
  QuoteBody,
  QuoteResponse,
  RequestOverrides,
  RouteOption,
  SessionResponse,
  TripResponse,
} from "./trip";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: ApiError["error"]["code"] | "network",
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Could not reach the server.");
  }
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    const e = (json as ApiError | undefined)?.error;
    throw new ApiRequestError(res.status, e?.code ?? "internal", e?.message ?? `Request failed (${res.status}).`);
  }
  return json as T;
}

export const optimizeTrip = (body: OptimizeBody, signal?: AbortSignal) =>
  post<TripResponse>("/api/trips/optimize", body, signal);

/** Full replan. Pass the last normalizedRequest so it still works after a server restart. */
export const reoptimizeTrip = (
  requestId: string,
  changes: RequestOverrides,
  baseRequest?: NormalizedRequest | null,
  signal?: AbortSignal,
) =>
  post<TripResponse>(
    `/api/trips/${encodeURIComponent(requestId)}/reoptimize`,
    { changes, ...(baseRequest ? { baseRequest } : {}) },
    signal,
  );

export const requestHero = (route: RouteOption, signal?: AbortSignal) =>
  post<HeroResponse>(
    `/api/routes/${encodeURIComponent(route.id)}/hero`,
    {
      route: {
        title: route.title,
        cities: route.citySequence.filter((s) => s.purpose !== "origin").map((s) => s.city),
        eventName: route.event.name,
      },
    },
    signal,
  );

/** Prices the current three options with live provider data; returns a new requirements version. */
export const priceCheckTrip = (requestId: string, baseRequest?: NormalizedRequest | null, signal?: AbortSignal) =>
  post<TripResponse>(`/api/trips/${encodeURIComponent(requestId)}/price-check`, baseRequest ? { baseRequest } : {}, signal);

/** Guest price lookup for one flight or one hotel stay. */
export const quotePrice = (body: QuoteBody, signal?: AbortSignal) => post<QuoteResponse>("/api/prices/quote", body, signal);

/** Starts/reads the anonymous guest session and returns feature flags, limits and supported cities. */
export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  let res: Response;
  try {
    res = await fetch("/api/session", { signal, cache: "no-store" });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Could not reach the server.");
  }
  if (!res.ok) throw new ApiRequestError(res.status, "internal", `Request failed (${res.status}).`);
  return (await res.json()) as SessionResponse;
}
