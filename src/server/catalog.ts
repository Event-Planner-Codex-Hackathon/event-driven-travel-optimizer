/**
 * Small, clearly named estimate tables for the demo. Every number here is a
 * heuristic planning estimate in TRY — not a live fare, hotel rate or quote.
 * Replace by provider adapters behind the same functions in estimates.ts.
 */

export type CityInfo = {
  city: string;
  countryCode: string;
  iataCode: string;
  /** Airports searched for live flight prices (Google Flights accepts comma-separated codes). */
  airports: string[];
  aliases: string[];
  lat: number;
  lon: number;
  /** Nightly lodging estimate per style, whole TRY. */
  nightly: { budget: number; standard: number; comfort: number };
  /** Per-day food and activities, whole TRY. */
  dailyFood: number;
  /** Per-day local transport, whole TRY. */
  dailyLocal: number;
  /** One-way airport ↔ city transfer, whole TRY. */
  airportTransfer: number;
};

export const CITIES: CityInfo[] = [
  { city: "Istanbul", countryCode: "TR", iataCode: "IST", airports: ["IST", "SAW"], aliases: ["istanbul", "İstanbul", "ist"], lat: 41.01, lon: 28.98, nightly: { budget: 1500, standard: 3000, comfort: 6000 }, dailyFood: 1000, dailyLocal: 250, airportTransfer: 500 },
  { city: "Ankara", countryCode: "TR", iataCode: "ESB", airports: ["ESB"], aliases: ["ankara"], lat: 39.93, lon: 32.85, nightly: { budget: 1200, standard: 2400, comfort: 4500 }, dailyFood: 800, dailyLocal: 200, airportTransfer: 400 },
  { city: "Izmir", countryCode: "TR", iataCode: "ADB", airports: ["ADB"], aliases: ["izmir", "İzmir"], lat: 38.42, lon: 27.14, nightly: { budget: 1200, standard: 2500, comfort: 5000 }, dailyFood: 900, dailyLocal: 200, airportTransfer: 350 },
  { city: "Singapore", countryCode: "SG", iataCode: "SIN", airports: ["SIN"], aliases: ["singapore", "singapur"], lat: 1.35, lon: 103.82, nightly: { budget: 3200, standard: 5800, comfort: 9500 }, dailyFood: 1800, dailyLocal: 350, airportTransfer: 400 },
  { city: "Bangkok", countryCode: "TH", iataCode: "BKK", airports: ["BKK", "DMK"], aliases: ["bangkok"], lat: 13.76, lon: 100.5, nightly: { budget: 900, standard: 2000, comfort: 4200 }, dailyFood: 900, dailyLocal: 250, airportTransfer: 350 },
  { city: "Taipei", countryCode: "TW", iataCode: "TPE", airports: ["TPE"], aliases: ["taipei", "taipe"], lat: 25.03, lon: 121.57, nightly: { budget: 1600, standard: 3200, comfort: 6000 }, dailyFood: 1200, dailyLocal: 300, airportTransfer: 450 },
  { city: "Kuala Lumpur", countryCode: "MY", iataCode: "KUL", airports: ["KUL"], aliases: ["kuala lumpur", "kl"], lat: 3.14, lon: 101.69, nightly: { budget: 900, standard: 1900, comfort: 3800 }, dailyFood: 800, dailyLocal: 220, airportTransfer: 300 },
  { city: "Hong Kong", countryCode: "HK", iataCode: "HKG", airports: ["HKG"], aliases: ["hong kong", "hongkong"], lat: 22.32, lon: 114.17, nightly: { budget: 2800, standard: 5200, comfort: 9000 }, dailyFood: 1700, dailyLocal: 330, airportTransfer: 450 },
  { city: "Tokyo", countryCode: "JP", iataCode: "HND", airports: ["HND", "NRT"], aliases: ["tokyo"], lat: 35.68, lon: 139.69, nightly: { budget: 2400, standard: 4600, comfort: 8500 }, dailyFood: 1600, dailyLocal: 400, airportTransfer: 700 },
  { city: "Dubai", countryCode: "AE", iataCode: "DXB", airports: ["DXB"], aliases: ["dubai"], lat: 25.2, lon: 55.27, nightly: { budget: 2200, standard: 4500, comfort: 8500 }, dailyFood: 1600, dailyLocal: 400, airportTransfer: 400 },
  { city: "Lisbon", countryCode: "PT", iataCode: "LIS", airports: ["LIS"], aliases: ["lisbon", "lizbon", "lisboa"], lat: 38.72, lon: -9.14, nightly: { budget: 2500, standard: 4500, comfort: 8000 }, dailyFood: 1500, dailyLocal: 300, airportTransfer: 300 },
  { city: "Helsinki", countryCode: "FI", iataCode: "HEL", airports: ["HEL"], aliases: ["helsinki"], lat: 60.17, lon: 24.94, nightly: { budget: 2800, standard: 5000, comfort: 8500 }, dailyFood: 1900, dailyLocal: 350, airportTransfer: 300 },
  { city: "Berlin", countryCode: "DE", iataCode: "BER", airports: ["BER"], aliases: ["berlin"], lat: 52.52, lon: 13.4, nightly: { budget: 2600, standard: 4800, comfort: 8500 }, dailyFood: 1600, dailyLocal: 350, airportTransfer: 350 },
  { city: "London", countryCode: "GB", iataCode: "LHR", airports: ["LHR", "LGW"], aliases: ["london", "londra"], lat: 51.51, lon: -0.13, nightly: { budget: 3800, standard: 6800, comfort: 11500 }, dailyFood: 2200, dailyLocal: 450, airportTransfer: 600 },
];

export function findCity(name: string): CityInfo | undefined {
  const needle = name.trim().toLocaleLowerCase("tr");
  return CITIES.find(
    (c) =>
      c.city.toLocaleLowerCase("tr") === needle ||
      c.aliases.some((a) => a.toLocaleLowerCase("tr") === needle),
  );
}

/** Known events with verified dates. Anything else must come from the user's text. */
export type KnownEvent = {
  name: string;
  aliases: string[];
  city: string;
  startDate: string;
  endDate: string;
  sourceUrl: string;
};

export const KNOWN_EVENTS: KnownEvent[] = [
  {
    name: "SWITCH 2026",
    aliases: ["switch", "switch singapore", "switch 2026"],
    city: "Singapore",
    startDate: "2026-10-27",
    endDate: "2026-10-29",
    sourceUrl: "https://www.switchsg.org/",
  },
];

/** Heuristic flight model parameters (TRY, one adult, economy, one-way). */
export const FLIGHT_MODEL = {
  tryPerKm: 2.25,
  minimumFare: 1500,
  cruiseKmh: 820,
  taxiAndClimbMinutes: 45,
  /** Above this distance we assume one connection. */
  nonstopMaxKm: 11000,
  connectionMinutes: 120,
  /** Long-haul flights are modeled as overnight: arrive the next local day. */
  overnightMinKm: 5000,
} as const;

export const PLANNING_RULES = {
  contingencyRate: 0.08,
  /** Arrive in the event city at least this many days before the first event day. */
  arrivalBufferDays: 1,
  /** Leave the event city no earlier than this many days after the last event day. */
  departureBufferDays: 1,
  /** Default travel window when the user gives none. */
  defaultDaysBeforeEvent: 6,
  defaultDaysAfterEvent: 3,
} as const;

export const SCORE_WEIGHTS = {
  budgetFit: 0.5,
  travelEfficiency: 0.2,
  preferenceFit: 0.3,
} as const;
