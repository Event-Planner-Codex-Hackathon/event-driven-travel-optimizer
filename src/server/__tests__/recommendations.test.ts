import { describe, expect, it } from "vitest";
import { groundInterests, matchListing } from "../recommendations";
import type { EventCandidate, EventInterest, RouteOption } from "@/contract/trip";

const interests: EventInterest[] = [{ label: "Live jazz", quote: "I like live jazz", query: "live jazz", keywords: ["jazz"] }];
const visit = { city: "Singapore", arrivalDate: "2026-10-26", departureDate: "2026-10-30" };
const fixed: RouteOption["event"] = { name: "SWITCH 2026", city: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29", locked: true };
const event: EventCandidate = { id: "synthetic-test", source: "google_events", name: "Synthetic jazz night", description: "Synthetic jazz listing for unit test", city: "Singapore", catalogCity: "Singapore", startDate: "2026-10-26", endDate: "2026-10-26", dateConfidence: "listed", plannable: true, warnings: [] };
describe("grounded event recommendations", () => {
  it("requires quotes from the actual brief and keywords present in their evidence", () => {
    expect(groundInterests({ interests }, "I like live jazz")).toEqual(interests);
    expect(groundInterests({ interests }, "I like techno")).toEqual([]);
    expect(groundInterests({ interests: [{ ...interests[0], keywords: ["invented"] }] }, "I like live jazz")).toEqual([]);
  });
  it("matches only retrieved text, city and visit dates without changing the fixed event", () => {
    expect(matchListing(event, interests, visit, fixed)).toMatchObject({ matchedInterests: ["Live jazz"], evidence: ["jazz"], timing: "during-visit", eventDayConflict: false });
    expect(matchListing({ ...event, name: "Unknown concert", description: undefined }, interests, visit, fixed)).toBeNull();
    expect(matchListing({ ...event, catalogCity: "Bangkok" }, interests, visit, fixed)).toBeNull();
    expect(matchListing({ ...event, startDate: "2026-10-31", endDate: "2026-10-31" }, interests, visit, fixed)).toBeNull();
    expect(matchListing({ ...event, name: fixed.name }, interests, visit, fixed)).toBeNull();
  });
  it("keeps missing years unconfirmed and flags known fixed-event conflicts", () => {
    expect(matchListing({ ...event, startDate: undefined, endDate: undefined, dateText: "Mon, Oct 26", dateConfidence: "partial" }, interests, visit, fixed)?.timing).toBe("dates-unconfirmed");
    expect(matchListing({ ...event, startDate: "2026-10-27", endDate: "2026-10-27" }, interests, visit, fixed)?.eventDayConflict).toBe(true);
  });
});
