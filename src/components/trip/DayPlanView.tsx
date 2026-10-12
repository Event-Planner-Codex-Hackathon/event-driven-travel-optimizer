"use client";

import { useId } from "react";
import type { EstimateSource, Leg, Money, RouteOption, Stay } from "@/contract/trip";
import { formatDuration, formatMoney, formatWeekday } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ArrowUpRight, Lock, Plane } from "../landing/Icons";
import site from "../site/site.module.css";
import {
  PLANNED_SOURCES,
  buildDays,
  generalConsiderations,
  type EventSource,
  type PlanConsideration,
  type PlanDay,
  type PlanEvent,
  type RouteEnrichment,
  type WeatherDay,
} from "./dayPlan";
import styles from "./dayPlan.module.css";
import tripStyles from "./trip.module.css";
import { MODE_LABEL, SOURCE_LABEL, STYLE_LABEL, formatCompared, stopsLabel } from "./tripFormat";
import { WeatherIcon } from "./WeatherIcon";

// Day-by-day plan. Dates, legs, stays and costs come from the route; events and weather only from `enrichment`.

const SOURCE_TAG: Record<EventSource, string> = {
  eventbrite: "Eventbrite",
  ticketmaster: "Ticketmaster",
  web: "Web",
  official: "Official site",
  synthetic: "Synthetic sample",
};

type Props = { option: RouteOption; enrichment: RouteEnrichment | null };

export function DayPlan({ option, enrichment }: Props) {
  const id = useId();
  const signedIn = Boolean(useSession());
  const days = buildDays(option, enrichment);
  const notes = generalConsiderations(enrichment);
  const hasStops = days.some((day) => day.isStopDay);

  return (
    <section className={styles.plan} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>
        Your trip, day by day
      </h2>
      {enrichment?.synthetic ? (
        <p className={`${tripStyles.synthetic} ${styles.banner}`}>
          Demo data — synthetic, not live offers. Sample events and weather show the layout only.
        </p>
      ) : null}

      <div className={styles.board}>
        <Sources enrichment={enrichment} />
        {notes.length ? (
          <div className={styles.strip}>
            <h3 className={styles.stripTitle}>How this route was chosen</h3>
            <ul role="list" className={styles.notes}>
              {notes.map((note, index) => (
                <Note key={index} note={note} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <ol role="list" className={styles.days}>
        {days.map((day) => (
          <Day key={day.date} day={day} option={option} signedIn={signedIn} />
        ))}
      </ol>

      <p className={styles.legend}>
        <span>
          <span className={site.lamp} data-status="fixed" aria-hidden="true" /> Fixed event days
        </span>
        {hasStops ? (
          <span>
            <span className={site.lamp} data-status="swap" aria-hidden="true" /> Swappable stop
          </span>
        ) : null}
      </p>
    </section>
  );
}

// ---------- Sources strip ----------

type SourceRow = { name: string; tone: "ok" | "unavailable" | "off"; text: string; fetchedAt?: string };

function sourceRows(enrichment: RouteEnrichment | null): SourceRow[] {
  const listed = enrichment?.sources ?? [];
  const names = [...new Set<string>([...PLANNED_SOURCES, ...listed.map((s) => s.name)])];
  return names.map((name) => {
    const found = listed.find((s) => s.name === name);
    // Synthetic previews never claim a source was reached.
    if (!enrichment || enrichment.synthetic || !found || found.status === "not-connected") {
      return { name, tone: "off", text: enrichment?.synthetic ? "Sample only, not fetched" : "Not connected yet" };
    }
    if (found.status === "unavailable") return { name, tone: "unavailable", text: "Unavailable" };
    return { name, tone: "ok", text: "Connected", fetchedAt: found.fetchedAt ?? undefined };
  });
}

// Green means "fixed" in this system, so a working source shows its fetch time, not a coloured lamp.
const LAMP_FOR_TONE = { ok: undefined, unavailable: "unknown", off: undefined } as const;

function Sources({ enrichment }: { enrichment: RouteEnrichment | null }) {
  return (
    <div className={`${styles.strip} ${styles.sources}`}>
      <h3 className={styles.stripTitle}>Sources</h3>
      <ul role="list" className={styles.sourceList}>
        {sourceRows(enrichment).map((row) => (
          <li key={row.name} className={styles.source} data-tone={row.tone}>
            <span className={site.lamp} data-status={LAMP_FOR_TONE[row.tone]} aria-hidden="true" />
            <span className={styles.sourceName}>{row.name}</span>
            <span className="visually-hidden">: </span>
            <span className={styles.sourceState}>
              {row.fetchedAt ? (
                <>
                  Fetched <time dateTime={row.fetchedAt}>{formatCompared(row.fetchedAt)}</time>
                </>
              ) : (
                row.text
              )}
            </span>
          </li>
        ))}
      </ul>
      {!enrichment ? (
        <p className={styles.sourcesNote}>
          Event listings and weather appear here once the planner sends them. Dates, flights and hotel nights below
          are already planned.
        </p>
      ) : null}
    </div>
  );
}

// ---------- One day ----------

type Row =
  | { kind: "leg"; leg: Leg; sameDay: boolean }
  | { kind: "arrive"; leg: Leg }
  | { kind: "check-in"; stay: Stay }
  | { kind: "check-out"; stay: Stay }
  | { kind: "event"; event: PlanEvent }
  | { kind: "event-day" }
  | { kind: "free" };

/** Display order within a day: landings, check-outs, then the event and travel in a sensible order, then check-ins. */
function dayRows(day: PlanDay, eventCity: string): Row[] {
  const rows: Row[] = [];
  const landings: Row[] = [];
  const checkOuts: Row[] = [];
  const checkIns: Row[] = [];
  const legs: Extract<Row, { kind: "leg" }>[] = [];
  const events: PlanEvent[] = [];

  for (const a of day.activities) {
    if (a.kind === "depart") legs.push({ kind: "leg", leg: a.leg, sameDay: a.leg.arrivalDate === day.date });
    else if (a.kind === "arrive" && a.leg.departureDate !== day.date) landings.push({ kind: "arrive", leg: a.leg });
    else if (a.kind === "check-out") checkOuts.push({ kind: "check-out", stay: a.stay });
    else if (a.kind === "check-in") checkIns.push({ kind: "check-in", stay: a.stay });
    else if (a.kind === "event") events.push(a.event);
  }

  events.sort((a, b) => (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  const eventRows: Row[] = events.length
    ? events.map((event) => ({ kind: "event" as const, event }))
    : day.isEventDay
      ? [{ kind: "event-day" }]
      : [];
  // Arriving in the event city the same day puts the event after the flight; otherwise travel comes after it.
  const intoEvent = legs.some((l) => l.sameDay && l.leg.toCity === eventCity);

  rows.push(...landings, ...checkOuts);
  if (intoEvent) rows.push(...legs, ...checkIns, ...eventRows);
  else rows.push(...eventRows, ...legs, ...checkIns);
  return rows.length ? rows : [{ kind: "free" }];
}

function safeUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function Day({ day, option, signedIn }: { day: PlanDay; option: RouteOption; signedIn: boolean }) {
  const rows = dayRows(day, option.event.city);
  const sessions = rows.flatMap((row) => (row.kind === "event" ? [row.event] : []));
  const hasLinks = [...sessions, ...day.nearby].some((event) => safeUrl(event.url));
  const lamp = day.isEventDay ? "fixed" : day.isStopDay ? "swap" : undefined;

  return (
    <li className={styles.day}>
      <div className={styles.dayHead}>
        <div className={styles.dayName}>
          <span className={`${site.lamp} ${styles.dayLamp}`} data-status={lamp} aria-hidden="true" />
          <h3 className={styles.dayTitle}>
            <time dateTime={day.date}>{formatWeekday(day.date)}</time>
            <span className="visually-hidden">, </span>
            <span className={styles.dayCity}>{day.city ?? "In flight"}</span>
          </h3>
        </div>
        {day.isEventDay ? (
          <p className={styles.dayStatus} data-tone="fixed">
            <Lock className={styles.inlineIcon} />
            Event day · Fixed
          </p>
        ) : day.isStopDay ? (
          <p className={styles.dayStatus} data-tone="swap">
            Optional stop · swappable
          </p>
        ) : null}
        {day.weather ? <Weather weather={day.weather} /> : null}
      </div>

      <div className={styles.dayBody}>
        <ol role="list" className={styles.acts}>
          {rows.map((row, index) => (
            <Activity key={`${row.kind}-${index}`} row={row} day={day} option={option} signedIn={signedIn} />
          ))}
        </ol>

        {day.nearby.length ? (
          <div className={styles.nearby}>
            <h4 className={styles.nearbyTitle}>Nearby</h4>
            <ul role="list" className={styles.nearList}>
              {day.nearby.map((event) => (
                <li key={event.id} className={styles.near}>
                  <p className={styles.nearTitle}>{event.title}</p>
                  <EventMeta event={event} />
                  <EventMatch event={event} />
                  <EventFoot event={event} signedIn={signedIn} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {hasLinks && !signedIn ? (
          <p className={styles.gate}>
            <Lock className={styles.inlineIcon} />
            <a href="#route-links">Sign in to see event links</a>
          </p>
        ) : null}

        {day.considerations.length ? (
          <ul role="list" className={`${styles.notes} ${styles.dayNotes}`}>
            {day.considerations.map((note, index) => (
              <Note key={index} note={note} condition={day.weather?.condition} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function Weather({ weather }: { weather: WeatherDay }) {
  const high = Math.round(weather.highC);
  const low = Math.round(weather.lowC);
  const precip = weather.precipChance;
  return (
    <div className={styles.weather}>
      <WeatherIcon condition={weather.condition} className={styles.weatherIcon} />
      <div className={styles.weatherText}>
        <p className={styles.temps}>
          <span aria-hidden="true">
            {high}° / {low}°C
          </span>
          <span className="visually-hidden">
            High {high}°C, low {low}°C.
          </span>
        </p>
        <p className={styles.weatherLine}>
          {weather.summary}
          {precip != null ? ` · ${precip}% chance of rain` : null}
        </p>
        <p className={styles.weatherSource}>
          <span className={styles.weatherKind}>{weather.source === "Synthetic sample" ? "Sample, not a forecast" : weather.kind === "forecast" ? "Forecast" : "Typical for the season"}</span>{" "}
          · {weather.source}
        </p>
      </div>
    </div>
  );
}

// ---------- Activities ----------

function Cost({ money, source }: { money: Money; source: EstimateSource }) {
  return (
    <p className={styles.cost}>
      <span className={styles.amountLine}>
        <span className={styles.amount}>{formatMoney(money)}</span> <span className={site.estimateTag}>estimate</span>
      </span>
      <span className={styles.costSource}>{SOURCE_LABEL[source]}</span>
    </p>
  );
}

function Fixed() {
  return <p className={styles.fixed}>Fixed</p>;
}

function nights(n: number) {
  return `${n} ${n === 1 ? "night" : "nights"}`;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

type ActivityProps = { row: Row; day: PlanDay; option: RouteOption; signedIn: boolean };

function Activity({ row, day, option, signedIn }: ActivityProps) {
  switch (row.kind) {
    case "leg": {
      const { leg } = row;
      const meta = [MODE_LABEL[leg.mode], formatDuration(leg.durationMinutes), stopsLabel(leg.stops)]
        .filter(Boolean)
        .join(" · ");
      return (
        <li className={styles.act}>
          <span className={styles.actMark} aria-hidden="true">
            <Plane className={`${styles.actIcon} ${styles.depart}`} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>
              {leg.fromCity} → {leg.toCity}
            </p>
            <p className={styles.actMeta}>
              {meta}
              {meta ? " · " : null}
              {row.sameDay ? (
                "arrives the same day"
              ) : (
                <>
                  arrives <time dateTime={leg.arrivalDate}>{formatWeekday(leg.arrivalDate)}</time>
                </>
              )}
            </p>
          </div>
          <Cost money={leg.estimatedCost} source={leg.estimateSource} />
        </li>
      );
    }
    case "arrive": {
      const { leg } = row;
      return (
        <li className={styles.act}>
          <span className={styles.actMark} aria-hidden="true">
            <Plane className={`${styles.actIcon} ${styles.arrive}`} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>Arrive in {leg.toCity}</p>
            <p className={styles.actMeta}>
              {MODE_LABEL[leg.mode]} from {leg.fromCity}, left{" "}
              <time dateTime={leg.departureDate}>{formatWeekday(leg.departureDate)}</time>
            </p>
          </div>
        </li>
      );
    }
    case "check-in": {
      const { stay } = row;
      return (
        <li className={styles.act}>
          <span className={styles.actMark} aria-hidden="true">
            <Bed className={styles.actIcon} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>Check in · {stay.city}</p>
            <p className={styles.actMeta}>
              {nights(stay.nights)} · {STYLE_LABEL[stay.style]} · check out{" "}
              <time dateTime={stay.checkOut}>{formatWeekday(stay.checkOut)}</time>
            </p>
          </div>
          <Cost money={stay.estimatedCost} source={stay.estimateSource} />
        </li>
      );
    }
    case "check-out": {
      const { stay } = row;
      return (
        <li className={styles.act}>
          <span className={styles.actMark} aria-hidden="true">
            <Bed className={styles.actIcon} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>Check out · {stay.city}</p>
            <p className={styles.actMeta}>
              {STYLE_LABEL[stay.style]} · {nights(stay.nights)} from{" "}
              <time dateTime={stay.checkIn}>{formatWeekday(stay.checkIn)}</time>
            </p>
          </div>
        </li>
      );
    }
    case "event": {
      const { event } = row;
      return (
        <li className={styles.act}>
          <span className={styles.actMark} data-tone="fixed" aria-hidden="true">
            <Lock className={styles.actIcon} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>{event.title}</p>
            <EventMeta event={event} />
            <EventFoot event={event} signedIn={signedIn} />
          </div>
          <Fixed />
        </li>
      );
    }
    case "event-day": {
      const { startDate, endDate, name } = option.event;
      return (
        <li className={styles.act}>
          <span className={styles.actMark} data-tone="fixed" aria-hidden="true">
            <Lock className={styles.actIcon} />
          </span>
          <div className={styles.actMain}>
            <p className={styles.actTitle}>{name}</p>
            <p className={styles.actMeta}>
              Event day {daysBetween(startDate, day.date) + 1} of {daysBetween(startDate, endDate) + 1} · session
              times aren&rsquo;t available yet
            </p>
          </div>
          <Fixed />
        </li>
      );
    }
    case "free":
      return (
        <li className={styles.act}>
          <span className={styles.actMark} aria-hidden="true" />
          <p className={styles.free}>{day.city ? `No travel today. Free time in ${day.city}.` : "In flight."}</p>
        </li>
      );
  }
}

// ---------- Events and notes ----------

function EventMeta({ event }: { event: PlanEvent }) {
  const time = event.startTime ? (event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime) : null;
  const parts = [time, event.venue, event.priceNote || "Ticket price unknown"].filter(Boolean);
  return parts.length ? <p className={styles.actMeta}>{parts.join(" · ")}</p> : null;
}

function EventMatch({ event }: { event: PlanEvent }) {
  const reason = typeof event.matchReason === "string" ? event.matchReason.trim() : "";
  const interests = Array.isArray(event.matchedInterests)
    ? event.matchedInterests.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!reason || !interests.length || event.source === "synthetic") return null;
  return (
    <div className={styles.eventMatch}>
      <p><strong>Why this matches your interests</strong></p>
      <p>{reason}</p>
      <ul aria-label="Matching interests">{interests.map((interest) => <li key={interest}>{interest}</li>)}</ul>
    </div>
  );
}

function EventFoot({ event, signedIn }: { event: PlanEvent; signedIn: boolean }) {
  const url = signedIn ? safeUrl(event.url) : null;
  return (
    <p className={styles.eventFoot}>
      <span className={styles.sourceTag}>{SOURCE_TAG[event.source]}</span>
      {url ? (
        <a className={styles.eventLink} href={url} target="_blank" rel="noopener noreferrer">
          Event page
          <ArrowUpRight className={styles.linkIcon} />
          <span className="visually-hidden"> for {event.title} (opens in a new tab)</span>
        </a>
      ) : null}
    </p>
  );
}

function Note({ note, condition }: { note: PlanConsideration; condition?: WeatherDay["condition"] }) {
  return (
    <li className={styles.note}>
      {note.kind === "weather" ? (
        <WeatherIcon condition={condition ?? "partly-cloudy"} className={styles.noteIcon} />
      ) : (
        <Ticket className={styles.noteIcon} />
      )}
      <span>
        <span className="visually-hidden">{note.kind === "weather" ? "Weather: " : "Events: "}</span>
        {note.text}
      </span>
    </li>
  );
}

// ---------- Pictograms (same grid and style as ../landing/Icons) ----------

function Bed({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M2 4.5h2.6v7.3H22V20h-2.6v-2.6H4.6V20H2zM6.2 8h5.6v2.8H6.2z" />
    </svg>
  );
}

function Ticket({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4zm11.2 1.5v2h1.6v-2zm0 3.5v2h1.6v-2zm0 3.5v2h1.6v-2z"
      />
    </svg>
  );
}
