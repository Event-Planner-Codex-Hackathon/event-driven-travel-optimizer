"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, priceCheckTrip } from "@/contract/client";
import type { SessionResponse, TripResponse } from "@/contract/trip";
import { saveTripResponse } from "@/lib/trips";
import { carryTripBrief } from "@/lib/tripBrief";
import { assertTripUpdate, pricingLabel } from "./pricingDisplay";
import site from "../site/site.module.css";
import styles from "./integration.module.css";

type Props = { trip: TripResponse; session: SessionResponse | null; sessionError: boolean; refresh: () => void; locked: boolean; onBusy: (busy: boolean) => void };

export function PriceCheck({ trip, session, sessionError, refresh, locked, onBusy }: Props) {
  const router = useRouter();
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const available = session?.features.livePrices;
  const allowance = session?.limits.priceCheck;
  const replay = session?.features.priceMode === "replay";
  async function check() {
    if (active.current || locked || !available || !allowance?.remaining) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); onBusy(true); setError(null);
    const timer = window.setTimeout(() => { setError("Price check timed out. Your previous results remain available."); controller.abort(); }, 90_000);
    try {
      const next = await priceCheckTrip(trip.requestId, trip.normalizedRequest, controller.signal, trip.requirementsVersion);
      if (controller.signal.aborted) return;
      assertTripUpdate(trip, next);
      saveTripResponse(next); carryTripBrief(trip.requestId, next.requestId);
      router.push(`/trips/${encodeURIComponent(next.requestId)}`);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof ApiRequestError || err instanceof Error ? err.message : "Price check failed. Your previous results remain available.");
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); onBusy(false); refresh(); }
    }
  }
  return (
    <section className={styles.context} aria-label="Price sources and checks">
      <div className={styles.heading}><h2>{pricingLabel(trip)}</h2><span>Requirements v{trip.requirementsVersion}</span></div>
      <p>Totals include estimated food, local transport and contingency. Ticket costs may be unknown; this is not a confirmed booking price.</p>
      {trip.pricing?.notes.length ? <ul>{trip.pricing.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
      {trip.pricing?.checkedAt ? <p>Checked <time dateTime={trip.pricing.checkedAt}>{new Date(trip.pricing.checkedAt).toLocaleString("en-GB")}</time> · {trip.pricing.providerCalls} provider calls · {trip.pricing.cacheHits} cache hits</p> : null}
      <button type="button" className={`${site.signButton} ${site.signButtonDark} ${styles.priceButton}`} disabled={busy || locked || !available || !allowance?.remaining} onClick={check}>
        {busy ? "Checking prices…" : replay ? "Check recorded flight & hotel prices" : "Check flight & hotel prices"}
      </button>
      <p className={styles.note} role="status">{busy ? "Your event remains fixed. All three options will be checked and ranked again." : sessionError ? "Provider controls unavailable. Retry the connection below." : !session ? "Checking provider availability…" : !available ? "Provider pricing is not configured. Planning estimates remain visible." : `${allowance?.remaining ?? 0} of ${allowance?.max ?? 0} checks remaining per ${allowance?.windowMinutes ?? 60} minutes. ${replay ? "Recorded observations, not current prices." : "Starts provider searches only when pressed; server quotas apply."}`}</p>
      {sessionError ? <button type="button" className={styles.textButton} onClick={refresh}>Retry provider connection</button> : null}
      {error ? <p className={site.error} role="alert">{error}</p> : null}
    </section>
  );
}
