"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, getWeather, searchEvents } from "@/contract/client";
import type { EventSearchResponse, RouteOption, SessionResponse, WeatherResponse } from "@/contract/trip";
import { formatRange } from "@/lib/format";
import { cityVisit, eventContext, EVENT_SOURCE_NAMES, EVENT_STATUS_NAMES } from "./contextDisplay";
import { posterCities } from "./poster";
import { publicSourceUrl } from "./pricingDisplay";
import site from "../site/site.module.css";
import styles from "./integration.module.css";

type Props = { option: RouteOption; session: SessionResponse | null; refresh: () => void };
export function LocalContext({ option, session, refresh }: Props) {
  const id = useId();
  const cities = posterCities(option);
  const [city, setCity] = useState(option.event.city);
  const visit = cityVisit(option, city);
  const [query, setQuery] = useState("");
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [events, setEvents] = useState<EventSearchResponse | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const weatherActive = useRef<AbortController | null>(null);
  const eventsActive = useRef<AbortController | null>(null);
  useEffect(() => () => { weatherActive.current?.abort(); eventsActive.current?.abort(); }, []);
  function changeCity(value: string) {
    weatherActive.current?.abort(); eventsActive.current?.abort();
    weatherActive.current = null; eventsActive.current = null;
    setCity(value); setWeather(null); setEvents(null); setReceivedAt(null);
    setWeatherError(null); setEventError(null); setWeatherBusy(false); setEventBusy(false);
  }
  async function loadWeather() {
    if (!visit || weatherActive.current) return;
    const controller = new AbortController(); weatherActive.current = controller;
    setWeatherBusy(true); setWeatherError(null);
    const timer = window.setTimeout(() => { setWeatherError("Weather request timed out. Retry when ready."); controller.abort(); setWeatherBusy(false); weatherActive.current = null; }, 15_000);
    try {
      const result = await getWeather(city, visit.arrivalDate, visit.departureDate, controller.signal);
      if (!controller.signal.aborted) setWeather(result);
    } catch (err) {
      if (!controller.signal.aborted) setWeatherError(err instanceof Error ? err.message : "Weather unavailable.");
    } finally {
      window.clearTimeout(timer);
      if (weatherActive.current === controller) { weatherActive.current = null; setWeatherBusy(false); }
    }
  }
  async function findEvents() {
    if (eventsActive.current || query.trim().length < 2) return;
    const controller = new AbortController(); eventsActive.current = controller;
    setEventBusy(true); setEventError(null); setEvents(null);
    const timer = window.setTimeout(() => { setEventError("Event search timed out. Retry when ready."); controller.abort(); setEventBusy(false); eventsActive.current = null; }, 20_000);
    try {
      const result = await searchEvents(query.trim(), city, controller.signal);
      if (!controller.signal.aborted) { setEvents(result); setReceivedAt(new Date().toISOString()); }
    } catch (err) {
      if (!controller.signal.aborted) setEventError(err instanceof ApiRequestError ? err.message : "Event search unavailable. Your itinerary is unchanged.");
    } finally {
      window.clearTimeout(timer);
      if (eventsActive.current === controller) { eventsActive.current = null; setEventBusy(false); refresh(); }
    }
  }
  const visibleEvents = events?.results.filter((event) => ["during-visit", "unconfirmed"].includes(eventContext(event, option, city))) ?? [];
  const excluded = (events?.results.length ?? 0) - visibleEvents.length;
  const eventLimit = session?.limits.eventSearch;
  return (
    <section className={styles.context} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Local events and weather</h2>
      <p>Explore your interests without changing the fixed event. Results are suggestions to inspect, not scheduled activities or tickets included in your total.</p>
      <label className={styles.field}>City on this route<select value={city} onChange={(e) => changeCity(e.target.value)}>{cities.map((name) => <option key={name}>{name}</option>)}</select></label>
      {visit ? <p className={styles.note}>Visit: {formatRange(visit.arrivalDate, visit.departureDate)} · arrival/departure times and event conflicts still need checking.</p> : null}
      <div className={styles.grid}>
        <div>
          <h3>Events you might enjoy</h3>
          <label className={styles.field}>Music, activity or event keywords<input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Jazz, house music, art…" /></label>
          <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={eventBusy || query.trim().length < 2 || (session?.features.eventSearch && eventLimit?.remaining === 0)} onClick={findEvents}>{eventBusy ? "Searching events…" : "Find events"}</button>
          <p className={styles.note}>{session?.features.eventSearch ? `${eventLimit?.remaining ?? "—"} searches remaining. Configured providers are contacted only when pressed.` : "Curated catalog search is available; external event providers are not configured."} Interest scoring and ticket prices are not supplied by this endpoint.</p>
          {eventError ? <p className={site.error} role="alert">{eventError}</p> : null}
          {events ? <>
            <p className={styles.note}>{events.sources.map((source) => `${EVENT_SOURCE_NAMES[source.source]}: ${EVENT_STATUS_NAMES[source.status]}${source.message ? ` (${source.message})` : ""}`).join(" · ")}</p>
            {receivedAt ? <p className={styles.note}>Response received {new Date(receivedAt).toLocaleString("en-GB")}. Provider observation age is not supplied.</p> : null}
            {excluded ? <p>{excluded} listings excluded because they fall outside this visit or are already your fixed event.</p> : null}
            {!visibleEvents.length ? <p role="status">No listings with usable dates for this visit were returned. Try different keywords.</p> : null}
            {visibleEvents.map((event) => {
              const url = publicSourceUrl(event.sourceUrl);
              const context = eventContext(event, option, city);
              const conflicts = event.startDate && event.endDate && city === option.event.city && event.startDate <= option.event.endDate && event.endDate >= option.event.startDate;
              return <article className={styles.listing} key={event.id}>
                <h3>{event.name}</h3>
                <p>{event.venue ?? event.city ?? "Venue unknown"} · {EVENT_SOURCE_NAMES[event.source]} · {event.dateConfidence}</p>
                <p>{event.startDate && event.endDate ? formatRange(event.startDate, event.endDate) : "Dates need confirmation"}</p>
                <p className={styles.note}>{context === "unconfirmed" ? "City or dates unconfirmed; not an itinerary match." : "Dates overlap your visit; attendance has not been validated."} {conflicts ? "Overlaps your fixed event: check session times before attending." : ""}</p>
                <p>Ticket price unknown · not added to the trip total.</p>
                {event.warnings.map((warning) => <p className={styles.note} key={warning}>{warning}</p>)}
                {url ? <a href={url} target="_blank" rel="noreferrer">Inspect the event listing ↗</a> : null}
              </article>;
            })}
          </> : null}
        </div>
        <div>
          <h3>Weather for your visit</h3>
          <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={weatherBusy || !visit} onClick={loadWeather}>{weatherBusy ? "Checking weather…" : "Check weather"}</button>
          <p className={styles.note}>Forecasts are context only. Dates beyond the provider horizon stay unknown.</p>
          {weatherError ? <p className={site.error} role="alert">{weatherError}</p> : null}
          {weather ? <>
            <p>{weather.note}</p>
            <p className={styles.note}>{weather.attribution} · horizon {weather.forecastHorizon}{weather.fetchedAt ? ` · observed ${new Date(weather.fetchedAt).toLocaleString("en-GB")}` : ""}</p>
            <ul className={styles.list}>{weather.days.map((day) => <li className={styles.weatherRow} key={day.date}>
              <time dateTime={day.date}>{day.date}</time> · {day.status === "beyond_forecast" ? "Beyond forecast horizon — unknown" : day.status === "unavailable" ? "Forecast unavailable" : `${day.summary ?? "Forecast"} · ${day.tempMinC ?? "?"}–${day.tempMaxC ?? "?"}°C${day.precipitationProbabilityMax !== undefined ? ` · rain ${day.precipitationProbabilityMax}%` : ""}`}
            </li>)}</ul>
          </> : null}
        </div>
      </div>
    </section>
  );
}
