"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ApiRequestError, reoptimizeTrip } from "@/contract/client";
import type { NormalizedRequest, RouteOption, TripResponse } from "@/contract/trip";
import { saveTripResponse } from "@/lib/trips";
import { ArrowRight, Lock } from "../landing/Icons";
import site from "../site/site.module.css";
import styles from "./trip.module.css";
import { shortRange, stopoverCities } from "./tripFormat";

const NONE = "none";
const STOP_CHOICES = ["Bangkok", "Taipei", "Kuala Lumpur", "Hong Kong"];

function initialStop(requested: string[], featured: RouteOption): string {
  if (requested.length === 0) return NONE;
  const onRoute = stopoverCities(featured).find((city) => requested.includes(city));
  return onRoute ?? requested[0];
}

function requestedLabel(requested: string[]): string {
  if (requested.length === 0) return "no optional stop";
  return requested.join(" or ");
}

type Props = { trip: TripResponse; request: NormalizedRequest; featured: RouteOption };

// Reoptimization: change only the optional stop; the event stays locked.
export function ChangeStop({ trip, request, featured }: Props) {
  const id = useId();
  const router = useRouter();
  const requested = request.optionalCities.map((c) => c.city);
  const choices = [...STOP_CHOICES, ...requested.filter((city) => !STOP_CHOICES.includes(city))];
  const [stop, setStop] = useState(() => initialStop(requested, featured));
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigating, startTransition] = useTransition();
  const versionRef = useRef(trip.requirementsVersion);
  const abortRef = useRef<AbortController | null>(null);
  const busy = fetching || navigating;

  useEffect(() => {
    versionRef.current = Math.max(versionRef.current, trip.requirementsVersion);
  }, [trip.requirementsVersion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function recalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFetching(true);
    setError(null);

    try {
      const next = await reoptimizeTrip(
        trip.requestId,
        { optionalCities: stop === NONE ? [] : [{ city: stop }] },
        request,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // Superseded requests are aborted above, so any response that arrives here is the newest.
      if (next.status !== "ready" || next.options.length === 0) {
        setError(next.clarificationQuestions[0] ?? "We couldn't plan routes with that stop. Try another one.");
        return;
      }
      versionRef.current = next.requirementsVersion;
      saveTripResponse(next);
      startTransition(() => router.push(`/trips/${encodeURIComponent(next.requestId)}`));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(
        err instanceof ApiRequestError
          ? `We couldn't recalculate: ${err.message}`
          : "We couldn't recalculate. Check your connection and try again.",
      );
    } finally {
      if (abortRef.current === controller) setFetching(false);
    }
  }

  const stopName = stop === NONE ? "no stop" : stop;

  return (
    <section className={site.panel} aria-labelledby={`${id}-title`}>
      <div className={site.panelBand}>
        <h2 id={`${id}-title`} className={site.panelBandTitle}>
          Try a different stop
        </h2>
        <span className={site.lamp} data-status="swap" aria-hidden="true" />
      </div>
      <form className={styles.stopBody} onSubmit={recalculate} aria-busy={busy}>
        <fieldset className={styles.stopFieldset} aria-describedby={`${id}-now ${id}-lock`}>
          <legend className={site.label}>Optional stop</legend>
          <p className={site.hint} id={`${id}-now`}>
            You asked for {requestedLabel(requested)}.
          </p>
          <div className={styles.chips}>
            {[NONE, ...choices].map((value) => (
              <label className={styles.chip} key={value}>
                <input
                  type="radio"
                  name={`${id}-stop`}
                  value={value}
                  checked={stop === value}
                  onChange={() => setStop(value)}
                />
                <span>{value === NONE ? "None" : value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className={styles.lockNote} id={`${id}-lock`}>
          <Lock className={styles.lockIcon} />
          <span>
            {request.event.name} stays locked to {shortRange(request.event.startDate, request.event.endDate)} in{" "}
            {request.event.city}. Only the stop and the route around it change.
          </span>
        </p>

        <div>
          <button
            type="submit"
            className={`${site.signButton} ${site.signButtonDark} ${busy ? styles.busy : ""}`}
            aria-disabled={busy || undefined}
          >
            <span className={site.signArrow}>
              <ArrowRight />
            </span>
            <span>{busy ? "Recalculating…" : "Recalculate"}</span>
          </button>
        </div>

        <p className="visually-hidden" role="status">
          {busy ? `Recalculating routes with ${stopName}…` : ""}
        </p>
        {error ? (
          <p className={site.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
