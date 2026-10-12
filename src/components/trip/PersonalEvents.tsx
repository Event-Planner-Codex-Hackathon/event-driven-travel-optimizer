"use client";

import { useEffect, useRef, useState } from "react";
import { recommendEvents } from "@/contract/client";
import type { EventRecommendationsResponse, RouteOption, SessionResponse } from "@/contract/trip";
import { useTripBrief } from "@/lib/tripBrief";
import { formatRange } from "@/lib/format";
import { EVENT_SOURCE_NAMES, EVENT_STATUS_NAMES } from "./contextDisplay";
import { publicSourceUrl } from "./pricingDisplay";
import site from "../site/site.module.css";
import styles from "./integration.module.css";

export function PersonalEvents({ requestId, option, session, onUsed }: { requestId: string; option: RouteOption; session: SessionResponse | null; onUsed: () => void }) {
  const brief = useTripBrief(requestId);
  const text = brief?.description || brief?.interests || "";
  const [response, setResponse] = useState<EventRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!session || !text || started.current && retry === 0) return;
    if (!session.features.aiParsing || !session.features.eventSearch) return;
    started.current = true;
    const controller = new AbortController();
    setBusy(true); setError(null);
    const timer = window.setTimeout(() => { setError("Event recommendations timed out. Try again when ready."); controller.abort(); setBusy(false); }, 60_000);
    recommendEvents(option, text.slice(0, 2000), controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.routeId !== option.id) throw new Error("The response belonged to another route and was ignored.");
      setResponse(result);
    }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Event recommendations unavailable."); }).finally(() => { window.clearTimeout(timer); if (!controller.signal.aborted) { setBusy(false); onUsed(); } });
    return () => { window.clearTimeout(timer); controller.abort(); started.current = false; };
  }, [session?.features.aiParsing, session?.features.eventSearch, text, option.id, retry]);
  return <section className={styles.context} aria-label="Events matched to your interests">
    <h2>Events matched to your interests</h2>
    <p>Real retrieved listings, matched against the interests in your brief. Suggestions stay separate from your fixed event and trip budget.</p>
    {busy ? <p role="status">Reading your interests and searching events for this route…</p> : null}
    {!session ? <p>Checking event-search availability…</p> : !text ? <p>No interest brief was saved. Use the keyword search below.</p> : !session.features.aiParsing || !session.features.eventSearch ? <p>AI interpretation or event search is unavailable on this server. Use the manual keyword search below.</p> : null}
    {error ? <><p className={site.error} role="alert">{error}</p><button type="button" className={styles.textButton} onClick={() => setRetry((value) => value + 1)}>Retry event recommendations</button></> : null}
    {response ? <>
      {!busy ? <button type="button" className={styles.textButton} onClick={() => setRetry((value) => value + 1)}>Refresh matched listings</button> : null}
      <p className={styles.note}>{response.interests.map((interest) => interest.label).join(" · ")} · {response.providerCalls} provider searches</p>
      <p className={styles.note}>{response.sources.map((source) => `${EVENT_SOURCE_NAMES[source.source]}: ${EVENT_STATUS_NAMES[source.status]}`).join(" · ")}</p>
      {response.notes.map((note) => <p key={note}>{note}</p>)}
      {response.recommendations.map((match) => {
        const event = match.event;
        const url = publicSourceUrl(event.sourceUrl);
        return <article className={styles.listing} key={event.id}>
          <h3>{event.name}</h3>
          <p>{event.catalogCity ?? event.city} · {event.venue ?? "Venue as listed by source"}</p>
          <p>{event.startDate && event.endDate ? formatRange(event.startDate, event.endDate) : event.dateText ?? "Date unknown"}</p>
          <p><strong>Why this fits:</strong> {match.matchReason}</p>
          <p className={styles.note}>{match.timing === "dates-unconfirmed" ? "Year or full date range unconfirmed; check the source before attending." : "Dates overlap your visit; attendance is not booked."} {match.eventDayConflict ? "Overlaps the fixed event; confirm session times." : ""}</p>
          <p>{event.priceNote ?? "Ticket price unknown"} · not added to the trip total</p>
          <p className={styles.note}>{EVENT_SOURCE_NAMES[event.source]} · {event.fromCache ? "cached observation" : "retrieved listing"}{event.observedAt ? ` · observed ${new Date(event.observedAt).toLocaleString("en-GB")}` : " · source observation age unknown"}</p>
          {url ? <a href={url} target="_blank" rel="noreferrer">Inspect event and tickets ↗</a> : null}
        </article>;
      })}
    </> : null}
  </section>;
}
