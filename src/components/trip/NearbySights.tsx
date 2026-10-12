"use client";

import { useEffect, useRef, useState } from "react";
import { getNearbyPlaces } from "@/contract/client";
import type { NearbyPlacesResponse, RouteOption, SessionResponse } from "@/contract/trip";
import { publicSourceUrl } from "./pricingDisplay";
import site from "../site/site.module.css";
import styles from "./integration.module.css";

export function acceptNearbyResponse(response: NearbyPlacesResponse, routeId: string): NearbyPlacesResponse {
  if (response.routeId !== routeId) throw new Error("The returned sights belong to a different route and were ignored.");
  return response;
}

export function NearbySights({ option, session, refresh }: { option: RouteOption; session: SessionResponse | null; refresh: () => void }) {
  const [response, setResponse] = useState<NearbyPlacesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const allowance = session?.limits.nearby;
  const available = session?.features.nearbyPlaces;
  async function load() {
    if (active.current || !available || allowance?.remaining === 0) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null);
    const timer = window.setTimeout(() => { setError("Sights lookup timed out. Your itinerary is unchanged."); controller.abort(); active.current = null; setBusy(false); }, 20_000);
    try {
      const result = await getNearbyPlaces(option, controller.signal);
      if (!controller.signal.aborted) setResponse(acceptNearbyResponse(result, option.id));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Nearby sights unavailable.");
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); refresh(); }
    }
  }
  return (
    <section className={styles.context} aria-label="Nearby sights">
      <h2>Sights along your route</h2>
      <p>Explore places around each city centre. Fees, opening hours and availability are unknown; these suggestions do not change your schedule or total.</p>
      <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={busy || !available || allowance?.remaining === 0} onClick={load}>{busy ? "Finding nearby sights…" : "Explore nearby sights"}</button>
      <p className={styles.note}>{!session ? "Checking sights availability…" : !available ? "Nearby sights are not configured on this server." : `${allowance?.remaining ?? "—"} of ${allowance?.max ?? "—"} lookups remaining per ${allowance?.windowMinutes ?? 60} minutes. Geoapify is contacted only when pressed.`}</p>
      {error ? <p className={site.error} role="alert">{error}</p> : null}
      {response ? <>
        <p className={styles.note}>{response.attribution} · {response.providerCalls} provider calls</p>
        <p>{response.note}</p>
        <div className={styles.grid}>{response.cities.map((city) => <div key={city.city}>
          <h3>{city.city}</h3>
          <p className={styles.note}>{city.status === "ok" ? city.fromCache ? "Cached places" : "Retrieved places" : city.status === "not_configured" ? "Not configured" : city.status === "quota" ? "Limit reached" : "Unavailable"} · {city.radiusMeters} m around the catalog city centre{city.fetchedAt ? ` · observed ${new Date(city.fetchedAt).toLocaleString("en-GB")}` : ""}</p>
          <p>{city.note}</p>
          {city.status === "ok" && !city.places.length ? <p>No sights returned for this area.</p> : null}
          {city.places.map((place) => {
            const url = publicSourceUrl(place.website);
            return <article className={styles.listing} key={place.id}>
              <h3>{place.name}</h3>
              {place.address ? <p>{place.address}</p> : null}
              <p className={styles.note}>{place.distanceMeters} m from the catalog city centre · fees and hours unknown</p>
              {url ? <a href={url} target="_blank" rel="noreferrer">Inspect the place website ↗</a> : null}
            </article>;
          })}
        </div>)}</div>
      </> : null}
    </section>
  );
}
