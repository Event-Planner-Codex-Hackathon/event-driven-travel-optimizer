"use client";

import { useEffect, useId, useRef, useState } from "react";
import { importEvent, searchEvents } from "@/contract/client";
import type { EventCandidate, EventSourceStatus } from "@/contract/trip";
import { useBackendSession } from "@/lib/backendSession";
import { formatRange } from "@/lib/format";
import { publicSourceUrl } from "../trip/pricingDisplay";
import { EVENT_SOURCE_NAMES, EVENT_STATUS_NAMES } from "../trip/contextDisplay";
import site from "../site/site.module.css";
import styles from "../trip/integration.module.css";

/** Selecting a listing confirms it in the editable form; planning still requires form submission. */
export function EventLookup({ onSelect }: { onSelect: (candidate: EventCandidate) => void }) {
  const id = useId();
  const provider = useBackendSession();
  const [query, setQuery] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [results, setResults] = useState<EventCandidate[] | null>(null);
  const [sources, setSources] = useState<EventSourceStatus[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function lookup(kind: "search" | "import") {
    if (active.current || (kind === "search" ? query.trim().length < 2 : !eventUrl.trim())) return;
    if ((kind === "import" && !provider.session?.features.eventImport) || ((kind === "import" || provider.session?.features.eventSearch) && provider.session?.limits.eventSearch?.remaining === 0)) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setResults(null);
    const timer = window.setTimeout(() => { setError("Event lookup timed out. Retry when ready."); controller.abort(); setBusy(false); active.current = null; }, 20_000);
    try {
      if (kind === "search") {
        const response = await searchEvents(query.trim(), undefined, controller.signal);
        if (!controller.signal.aborted) { setResults(response.results); setSources(response.sources); setNote("Confirm the event's city and dates before planning. They will be fixed in every route."); }
      } else {
        const response = await importEvent(eventUrl.trim(), controller.signal);
        if (!controller.signal.aborted) { setResults([response.candidate]); setSources(response.sources); setNote("Confirm the listing's city and dates before planning."); }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Event lookup failed.");
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); provider.refresh(); }
    }
  }
  return (
    <details className={styles.context}>
      <summary>Find a different fixed event</summary>
      <p>Search for an event or import its Eventbrite listing, then confirm it in your trip form. No tickets are purchased.</p>
      <label className={styles.field} htmlFor={`${id}-query`}>Event name or keywords<input id={`${id}-query`} value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookup("search"); } }} placeholder="SWITCH Singapore" /></label>
      <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={busy || query.trim().length < 2 || (provider.session?.features.eventSearch && provider.session.limits.eventSearch?.remaining === 0)} onClick={() => lookup("search")}>{busy ? "Looking up events…" : "Search fixed events"}</button>
      <label className={styles.field} htmlFor={`${id}-url`}>Eventbrite event link or ID<input id={`${id}-url`} value={eventUrl} maxLength={500} onChange={(e) => setEventUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (provider.session?.features.eventImport && provider.session.limits.eventSearch?.remaining !== 0) void lookup("import"); } }} placeholder="https://www.eventbrite.com/e/…" /></label>
      <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={busy || !eventUrl.trim() || !provider.session?.features.eventImport || provider.session.limits.eventSearch?.remaining === 0} onClick={() => lookup("import")}>Import Eventbrite listing</button>
      <p className={styles.note}>{provider.session?.features.eventImport ? "Eventbrite import is configured; the server's call limits apply." : "Eventbrite import is not configured on this server."} Keyword search uses the curated catalog plus configured search providers.</p>
      {error ? <p className={site.error} role="alert">{error}</p> : null}
      {results ? <>
        <p className={styles.note}>{sources.map((source) => `${EVENT_SOURCE_NAMES[source.source]}: ${EVENT_STATUS_NAMES[source.status]}`).join(" · ")} · {note}</p>
        {!results.length ? <p role="status">No listings returned. Try another name.</p> : null}
        {results.map((candidate) => {
          const url = publicSourceUrl(candidate.sourceUrl);
          return <article className={styles.listing} key={candidate.id}>
            <h3>{candidate.name}</h3>
            <p>{candidate.catalogCity ?? candidate.city ?? "City unconfirmed"} · {candidate.startDate && candidate.endDate ? formatRange(candidate.startDate, candidate.endDate) : "Dates unconfirmed"}</p>
            <p className={styles.note}>{EVENT_SOURCE_NAMES[candidate.source]} · {candidate.dateConfidence} dates · ticket price unknown</p>
            {candidate.warnings.map((warning) => <p className={styles.note} key={warning}>{warning}</p>)}
            {url ? <p><a href={url} target="_blank" rel="noreferrer">Inspect source listing ↗</a></p> : null}
            <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={!candidate.plannable || !candidate.overrides?.event || busy} onClick={() => { onSelect({ ...candidate, sourceUrl: url ?? undefined }); setResults(null); }}>Confirm as my fixed event</button>
            {!candidate.plannable ? <p className={styles.note}>Dates or supported city missing. This listing cannot be used for planning yet.</p> : null}
          </article>;
        })}
      </> : null}
    </details>
  );
}
