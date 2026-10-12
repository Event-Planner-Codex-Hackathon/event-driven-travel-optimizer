import type { Leg, Stay } from "@/contract/trip";

// Public search pages built from a route's own dates and cities. These are
// searches, not offers: the provider decides what is available and at what price.

export type SearchLink = { href: string; label: string; provider: string; kind: "search" };

export function flightSearchLink(leg: Leg): SearchLink {
  const query = `Flights from ${leg.fromCity} to ${leg.toCity} on ${leg.departureDate} one way`;
  return {
    href: `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}&curr=TRY&hl=en`,
    label: `Search flights ${leg.fromCity} → ${leg.toCity}`,
    provider: "Google Flights",
    kind: "search",
  };
}

export function hotelSearchLink(stay: Stay): SearchLink {
  const params = new URLSearchParams({
    ss: stay.city,
    checkin: stay.checkIn,
    checkout: stay.checkOut,
    group_adults: "1",
    no_rooms: "1",
    group_children: "0",
    selected_currency: "TRY",
  });
  return {
    href: `https://www.booking.com/searchresults.html?${params.toString()}`,
    label: `Search hotels in ${stay.city}`,
    provider: "Booking.com",
    kind: "search",
  };
}
