import { NextResponse } from "next/server";
import type { SessionResponse } from "@/contract/trip";
import { aiParsingEnabled } from "@/server/providers/openai";
import { CITIES } from "@/server/catalog";
import { GUEST_LIMITS, attachGuestCookie, guestFromRequest, remaining } from "@/server/guest";
import { getPricingRuntime, priceMode } from "@/server/providers/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anonymous guest session: issues the guest cookie and reports features and limits. */
export async function GET(req: Request) {
  const guest = guestFromRequest(req);
  const limits = Object.fromEntries(
    (Object.keys(GUEST_LIMITS) as Array<keyof typeof GUEST_LIMITS>).map((action) => [
      action,
      { remaining: remaining(guest, action), ...GUEST_LIMITS[action] },
    ]),
  ) as SessionResponse["limits"];
  const body: SessionResponse = {
    guest: { id: guest.id, isNew: guest.isNew },
    features: { livePrices: getPricingRuntime().available, banners: Boolean(process.env.FAL_KEY), priceMode: priceMode(), eventSearch: Boolean(process.env.SERPAPI_API_KEY || process.env.TICKETMASTER_API_KEY), eventImport: Boolean(process.env.EVENTBRITE_TOKEN), aiParsing: aiParsingEnabled(), nearbyPlaces: Boolean(process.env.GEOAPIFY_API_KEY) },
    limits,
    cities: CITIES.map((c) => ({ city: c.city, countryCode: c.countryCode, iataCode: c.iataCode })),
  };
  return attachGuestCookie(NextResponse.json(body), guest);
}
