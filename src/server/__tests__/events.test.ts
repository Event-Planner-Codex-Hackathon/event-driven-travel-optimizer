import { beforeEach, describe, expect, it } from "vitest";
import {
  eventbriteIdFrom,
  importEventbrite,
  parseEventbriteEvent,
  parseGoogleEventDates,
  parseGoogleEvents,
  parseTicketmaster,
  resetEventCache,
  searchCatalog,
  searchEvents,
} from "../events";
import { resetPricingState } from "../providers/runtime";

const TODAY = "2026-10-12";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  resetEventCache();
  resetPricingState();
});

describe("catalog", () => {
  it("finds SWITCH with verified dates and ready overrides", () => {
    const [c] = searchCatalog("switch");
    expect(c).toMatchObject({ source: "catalog", name: "SWITCH 2026", catalogCity: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29", dateConfidence: "verified", plannable: true });
    expect(c.overrides).toEqual({ event: { name: "SWITCH 2026", city: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29" } });
    expect(searchCatalog("switch", "Bangkok")).toEqual([]);
  });
});

describe("Google Events dates", () => {
  it.each([
    [{ start_date: "Oct 27", when: "Tue, Oct 27, 2026 – Thu, Oct 29, 2026" }, "2026-10-27", "2026-10-29"],
    [{ start_date: "Oct 27", when: "Oct 27, 2026 – 29" }, "2026-10-27", "2026-10-29"],
    [{ start_date: "Jan 3", when: "Sat, 03 Jan 2027, 21:00–23:00 GMT-6" }, "2027-01-03", "2027-01-03"],
    [{ start_date: "Dec 30", when: "Wed, Dec 30 2026 – Fri, Jan 1 2027" }, "2026-12-30", "2027-01-01"],
  ])("parses %j", (date, start, end) => {
    expect(parseGoogleEventDates(date, TODAY)).toEqual({ startDate: start, endDate: end, partial: false });
  });

  it("marks unparseable dates partial instead of guessing", () => {
    expect(parseGoogleEventDates({ when: "Next spring" }, TODAY)).toEqual({ partial: true });
  });

  it("maps address lines to catalog cities and flags unsupported cities", () => {
    const results = parseGoogleEvents(
      {
        events_results: [
          { title: "Tech Week", date: { start_date: "Oct 27", when: "Oct 27, 2026 – 29" }, address: ["Marina Bay Sands Expo", "Singapore 018956"], link: "https://example.org/e" },
          { title: "Paris Expo", date: { start_date: "Nov 3", when: "Nov 3" }, address: ["Paris, France"] },
        ],
      },
      TODAY,
    );
    expect(results[0]).toMatchObject({ catalogCity: "Singapore", plannable: true, dateConfidence: "listed" });
    expect(results[1].plannable).toBe(false);
    expect(results[1].overrides).toBeUndefined();
    expect(results[1].warnings.join(" ")).toMatch(/not in our estimate catalog/);
  });
});

describe("Ticketmaster", () => {
  it("parses events and venues", () => {
    const [c] = parseTicketmaster({
      _embedded: { events: [{ name: "Concert", id: "TM1", url: "https://www.ticketmaster.com/e/TM1", dates: { start: { localDate: "2026-11-05" }, end: { localDate: "2026-11-05" } }, _embedded: { venues: [{ name: "Arena", city: { name: "London" }, country: { countryCode: "GB" } }] } }] },
    });
    expect(c).toMatchObject({ id: "ticketmaster:TM1", catalogCity: "London", startDate: "2026-11-05", endDate: "2026-11-05", plannable: true, countryCode: "GB" });
  });
});

describe("aggregate search", () => {
  it("returns catalog first, reports unconfigured sources, and spends no calls without keys", async () => {
    const r = await searchEvents("SWITCH", undefined, { today: TODAY });
    expect(r.results[0].source).toBe("catalog");
    expect(r.sources.map((s) => [s.source, s.status])).toEqual([["catalog", "ok"], ["google_events", "not_configured"], ["ticketmaster", "not_configured"]]);
    expect(r.meteredCalls).toBe(0);
  });

  it("dedupes provider duplicates of catalog events and caches provider results", async () => {
    let calls = 0;
    const fetcher = (async (url: URL) => {
      calls++;
      expect(String(url)).toContain("engine=google_events");
      return json({ events_results: [{ title: "SWITCH 2026", date: { start_date: "Oct 27", when: "Oct 27, 2026 – 29" }, address: ["Singapore"] }, { title: "Other Expo", date: { start_date: "Oct 28" }, address: ["Singapore"] }] });
    }) as unknown as typeof fetch;
    const first = await searchEvents("SWITCH", "Singapore", { serpApiKey: "k", today: TODAY, fetcher });
    expect(first.results.map((c) => c.name)).toEqual(["SWITCH 2026", "Other Expo"]);
    expect(first.results[0].source).toBe("catalog");
    expect(first.meteredCalls).toBe(1);
    const second = await searchEvents("SWITCH", "Singapore", { serpApiKey: "k", today: TODAY, fetcher });
    expect(calls).toBe(1);
    expect(second.meteredCalls).toBe(0);
  });
});

describe("Eventbrite import", () => {
  it("extracts ids only from Eventbrite links or bare ids", () => {
    expect(eventbriteIdFrom("https://www.eventbrite.com/e/switch-afterparty-tickets-1234567890123")).toBe("1234567890123");
    expect(eventbriteIdFrom("https://www.eventbrite.co.uk/e/x-tickets-987654321/")).toBe("987654321");
    expect(eventbriteIdFrom("987654321")).toBe("987654321");
    expect(eventbriteIdFrom("https://evil.example/e/x-tickets-987654321")).toBeUndefined();
  });

  it("sends the token as a Bearer header, never in the URL, and parses the event", async () => {
    let seenUrl = "";
    let seenAuth = "";
    const fetcher = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>).Authorization;
      return json({ id: "987654321", name: { text: "Startup Night" }, start: { local: "2026-10-28T18:00:00" }, end: { local: "2026-10-28T22:00:00" }, url: "https://www.eventbrite.com/e/987654321", online_event: false, venue: { name: "Hub", address: { city: "Singapore", country: "SG" } } });
    }) as unknown as typeof fetch;
    const r = await importEventbrite("987654321", "secret-token", fetcher);
    expect(seenUrl).not.toContain("secret-token");
    expect(seenAuth).toBe("Bearer secret-token");
    expect(r.ok && r.candidate).toMatchObject({ source: "eventbrite", catalogCity: "Singapore", startDate: "2026-10-28", endDate: "2026-10-28", plannable: true });
  });

  it("handles online events, missing token and 404s", async () => {
    expect(parseEventbriteEvent({ id: "1", name: { text: "Webinar" }, start: { local: "2026-10-28T10:00:00" }, end: { local: "2026-10-28T11:00:00" }, online_event: true })?.plannable).toBe(false);
    expect((await importEventbrite("987654321", undefined)).ok).toBe(false);
    const r = await importEventbrite("987654321", "t", (async () => json({}, 404)) as unknown as typeof fetch);
    expect(!r.ok && r.message).toMatch(/no public event/);
  });
});


describe("event review regressions", () => {
  it("does not invent a year or shorten an unreadable range", () => {
    expect(parseGoogleEventDates({ start_date: "Oct 27", when: "Oct 27 – 29" }, TODAY)).toEqual({ partial: true });
    expect(parseGoogleEventDates({ start_date: "Oct 27", when: "Oct 27 2026 – TBD" }, TODAY)).toEqual({ startDate: "2026-10-27", partial: true });
    expect(parseGoogleEventDates({ start_date: "Oct 27", when: "Oct 27 2028 – 29" }, TODAY).startDate).toBe("2028-10-27");
  });

  it("does not plan Ticketmaster events with an unknown end or wrong country", () => {
    const event = { name: "Expo", id: "1", dates: { start: { localDate: "2026-11-05" } }, _embedded: { venues: [{ city: { name: "London" }, country: { countryCode: "CA" } }] } };
    const [c] = parseTicketmaster({ _embedded: { events: [event] } });
    expect(c.endDate).toBeUndefined();
    expect(c.catalogCity).toBeUndefined();
    expect(c.plannable).toBe(false);
    expect(c.overrides).toBeUndefined();
  });

  it("shares concurrent searches and charges only the outbound caller", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    const fetcher = (async () => { calls++; await gate; return json({ events_results: [] }); }) as typeof fetch;
    const deps = { serpApiKey: "test-key", today: TODAY, fetcher };
    const a = searchEvents("conference", undefined, deps);
    const b = searchEvents("conference", undefined, deps);
    release();
    const results = await Promise.all([a, b]);
    expect(calls).toBe(1);
    expect(results.map((r) => r.meteredCalls)).toEqual([1, 0]);
  });

  it("caps Ticketmaster and Eventbrite attempts across guests, including failures", async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return json({}, 500); }) as typeof fetch;
    for (let i = 0; i < 40; i++) await searchEvents(`query-${i}`, undefined, { ticketmasterKey: "test", today: TODAY, fetcher });
    const blocked = await searchEvents("another", undefined, { ticketmasterKey: "test", today: TODAY, fetcher });
    expect(blocked.sources.find((s) => s.source === "ticketmaster")?.status).toBe("quota");
    expect(blocked.meteredCalls).toBe(0);
    expect(calls).toBe(40);
    for (let i = 0; i < 40; i++) await importEventbrite("987654321", "test", fetcher);
    const imported = await importEventbrite("987654321", "test", fetcher);
    expect(imported).toMatchObject({ ok: false, code: "rate_limited", spentProviderCall: false });
    expect(calls).toBe(80);
  });

  it("ignores malformed collections and rejects lookalike Eventbrite domains", () => {
    expect(parseGoogleEvents({ events_results: [null, 1] }, TODAY)).toEqual([]);
    expect(parseTicketmaster({ _embedded: { events: {} } })).toEqual([]);
    expect(eventbriteIdFrom("https://eventbrite.com.evil.example/e/987654321")).toBeUndefined();
    expect(eventbriteIdFrom("http://eventbrite.com/e/987654321")).toBeUndefined();
  });
});


it("preserves explicit end years and rejects reversed explicit ranges", () => {
  expect(parseGoogleEventDates({ when: "Oct 27 2026 – Oct 26 2026" }, TODAY)).toEqual({ startDate: "2026-10-27", partial: true });
  expect(parseGoogleEventDates({ when: "Oct 27 2026 – Oct 29 2027" }, TODAY)).toEqual({ startDate: "2026-10-27", endDate: "2027-10-29", partial: false });
});
