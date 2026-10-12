"use client";
// Backend developer console: exercises every endpoint end to end.
// Not the product UI — the frontend track builds that against src/contract.

import { useRef, useState } from "react";
import { ApiRequestError, optimizeTrip, priceCheckTrip, reoptimizeTrip, requestHero } from "@/contract/client";
import { DEMO_REQUESTS } from "@/contract/demo";
import type { HeroImage, Money, RouteOption, TripResponse } from "@/contract/trip";

const fmt = (m: Money) => `${Math.round(m.amountMinor / 100).toLocaleString("en-US")} ${m.currency}`;
const box: React.CSSProperties = { background: "#fff", border: "1px solid #dde1e6", borderRadius: 10, padding: 16 };
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #14171c", background: "#14171c", color: "#fff", cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "#fff", color: "#14171c" };

export default function DevConsole() {
  const [text, setText] = useState<string>(DEMO_REQUESTS[0].text);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [budget, setBudget] = useState("");
  const [optional, setOptional] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hero, setHero] = useState<Record<string, HeroImage>>({});
  const seq = useRef(0);

  async function run(call: (signal: AbortSignal) => Promise<TripResponse>) {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await call(new AbortController().signal);
      if (mine !== seq.current) return; // a newer request superseded this one
      setTrip(res);
      setSelectedId(res.recommendedOptionId ?? res.options[0]?.id ?? null);
      if (res.normalizedRequest) {
        setBudget(String(Math.round(res.normalizedRequest.budget.amountMinor / 100)));
        setOptional(res.normalizedRequest.optionalCities.map((c) => c.city).join(", "));
      }
    } catch (e) {
      if (mine === seq.current) setError(e instanceof ApiRequestError ? e.message : "Unexpected error.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  const plan = () => run((signal) => optimizeTrip({ text }, signal));
  const recalc = () => {
    if (!trip) return;
    const amount = Number(budget.replace(/[^\d]/g, ""));
    if (!amount) return setError("Enter a budget in TRY.");
    const cities = optional.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 2).map((city) => ({ city }));
    run((signal) =>
      reoptimizeTrip(trip.requestId, { budget: { amountMinor: amount * 100, currency: "TRY" }, optionalCities: cities }, trip.normalizedRequest, signal),
    );
  };

  const checkPrices = () => trip && run((signal) => priceCheckTrip(trip.requestId, trip.normalizedRequest, signal));

  async function makeHero(route: RouteOption) {
    setHero((h) => ({ ...h, [route.id]: { status: "queued" } }));
    try {
      const res = await requestHero(route);
      setHero((h) => ({ ...h, [route.id]: res.heroImage }));
    } catch (e) {
      setHero((h) => ({ ...h, [route.id]: { status: "failed", error: e instanceof Error ? e.message : "Failed." } }));
    }
  }

  const req = trip?.normalizedRequest;
  const selected = trip?.options.find((o) => o.id === selectedId);
  const selectedHero = selected ? hero[selected.id] ?? selected.heroImage : undefined;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>EventHopper · backend console</h1>
        <span style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/prices">Guest price lookup</a>
          <span style={{ background: "#fff4d6", border: "1px solid #e7c96b", borderRadius: 999, padding: "4px 10px" }}>
            {trip && trip.pricing.mode !== "estimates" ? "Mixed: provider prices + estimates — not bookable quotes" : "Demo data — heuristic estimates, not live offers"}
          </span>
        </span>
      </header>

      <section style={{ ...box, display: "grid", gap: 10 }}>
        <label htmlFor="req" style={{ fontWeight: 600 }}>Trip request</label>
        <textarea id="req" value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", font: "inherit", padding: 10, borderRadius: 8, border: "1px solid #c5cbd3" }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={plan} disabled={loading}>{loading ? "Planning…" : "Plan trip"}</button>
          {DEMO_REQUESTS.map((d) => (
            <button key={d.id} style={ghost} onClick={() => setText(d.text)}>{d.label}</button>
          ))}
        </div>
      </section>

      {error && <div role="alert" style={{ ...box, borderColor: "#e5a1a1", background: "#fff5f5" }}>{error}</div>}

      {trip?.status === "needs_input" && (
        <section style={{ ...box, borderColor: "#e7c96b" }}>
          <strong>We need a bit more information</strong>
          <ul>{trip.clarificationQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
        </section>
      )}

      {req && trip?.status === "ready" && (
        <section style={{ ...box, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14 }}>
            <span><b>From</b> {req.origin.city}</span>
            <span>🔒 <b>{req.event.name}</b> · {req.event.city} · {req.event.startDate} → {req.event.endDate}</span>
            <span><b>Window</b> {req.travelWindow.startDate} → {req.travelWindow.endDate}</span>
            <span><b>Optional</b> {req.optionalCities.map((c) => c.city).join(", ") || "none"}</span>
            <span style={{ color: "#5b6470" }}>v{trip.requirementsVersion}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", fontSize: 13 }}>Budget (TRY)
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" style={{ padding: 8, borderRadius: 8, border: "1px solid #c5cbd3", width: 140 }} />
            </label>
            <label style={{ display: "grid", fontSize: 13 }}>Optional cities
              <input value={optional} onChange={(e) => setOptional(e.target.value)} placeholder="Bangkok, Taipei" style={{ padding: 8, borderRadius: 8, border: "1px solid #c5cbd3", width: 200 }} />
            </label>
            <button style={btn} onClick={recalc} disabled={loading}>Recalculate itinerary</button>
            <button style={ghost} onClick={checkPrices} disabled={loading}>Check live prices</button>
          </div>
          <div style={{ fontSize: 13 }}>
            <b>Pricing:</b> {trip.pricing.mode === "estimates" ? "estimates only" : trip.pricing.mode === "mixed" ? "mixed — some provider prices" : "provider prices for all flights and stays"}
            {trip.pricing.checkedAt && ` · checked ${new Date(trip.pricing.checkedAt).toLocaleTimeString()} · ${trip.pricing.providerCalls} calls, ${trip.pricing.cacheHits} cached`}
            {trip.pricing.mode !== "estimates" && <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{trip.pricing.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
          {!trip.recommendedOptionId && <div style={{ color: "#a33" }}>No option fits this budget. The event stays locked; options below show what it would cost.</div>}
          <details><summary style={{ cursor: "pointer", fontSize: 13 }}>Assumptions</summary><ul style={{ fontSize: 13 }}>{trip.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
        </section>
      )}

      {trip?.status === "ready" && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
          {trip.options.map((o) => {
            const c = o.costBreakdown;
            const rec = o.id === trip.recommendedOptionId;
            return (
              <article key={o.id} style={{ ...box, outline: o.id === selectedId ? "2px solid #2f6fed" : undefined, display: "grid", gap: 8, alignContent: "start" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{o.label}. {o.title}</strong>
                  {rec && <span style={{ fontSize: 12, color: "#1d7a3a" }}>Recommended</span>}
                </div>
                <div style={{ fontSize: 13 }}>{o.citySequence.map((s) => `${s.city}${s.purpose === "event" ? " 🔒" : ""}`).join(" → ")}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(c.total)}</div>
                <div style={{ fontSize: 13, color: c.remaining.amountMinor >= 0 ? "#1d7a3a" : "#a33" }}>
                  {c.remaining.amountMinor >= 0 ? `${fmt(c.remaining)} under budget` : `${fmt({ ...c.remaining, amountMinor: -c.remaining.amountMinor })} over budget`}
                </div>
                <table style={{ fontSize: 13, borderCollapse: "collapse" }}><tbody>
                  {([["Transport", c.transport], ["Lodging", c.lodging], ["Local transport", c.localTransport], ["Food & activities", c.foodAndActivities], ["Contingency", c.contingency]] as const).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td style={{ textAlign: "right" }}>{fmt(v)}</td></tr>
                  ))}
                </tbody></table>
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>{o.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
                {o.feasibility.warnings.length > 0 && <ul style={{ fontSize: 12, color: "#8a5a00", margin: 0, paddingLeft: 18 }}>{o.feasibility.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                <details><summary style={{ fontSize: 12, cursor: "pointer" }}>Legs & stays</summary>
                  <ul style={{ fontSize: 12 }}>
                    {o.legs.map((l, i) => <li key={i}>{l.departureDate} {l.fromCity} → {l.toCity} (arr {l.arrivalDate}) · {fmt(l.estimatedCost)} · {l.estimateSource}{l.source && <> · {l.source.description}{l.source.searchUrl && <> · <a href={l.source.searchUrl} target="_blank" rel="noreferrer">search</a></>}</>}</li>)}
                    {o.stays.map((s, i) => <li key={`s${i}`}>{s.city} {s.checkIn} → {s.checkOut} · {s.nights}n {s.style} · {fmt(s.estimatedCost)} · {s.estimateSource}{s.source && <> · {s.source.description}</>}</li>)}
                  </ul>
                </details>
                <div style={{ fontSize: 12, color: "#5b6470" }}>Score {o.score.total} · budget {o.score.budgetFit} · travel {o.score.travelEfficiency} · preferences {o.score.preferenceFit}</div>
                <button style={o.id === selectedId ? btn : ghost} onClick={() => setSelectedId(o.id)}>{o.id === selectedId ? "Selected" : "Select this route"}</button>
              </article>
            );
          })}
        </section>
      )}

      {selected && (
        <section style={{ ...box, display: "grid", gap: 10 }}>
          <strong>Route banner · {selected.title}</strong>
          {selectedHero?.status === "ready" && selectedHero.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedHero.url} alt={`Banner for ${selected.title}`} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 8 }} />
          ) : (
            <div style={{ aspectRatio: "16 / 5", borderRadius: 8, background: "#eef1f5", display: "grid", placeItems: "center", color: "#5b6470", fontSize: 14 }}>
              {selectedHero?.status === "queued" ? "Generating banner with Fal.ai…" : selectedHero?.status === "failed" ? selectedHero.error ?? "Banner failed." : "No banner yet"}
            </div>
          )}
          <div>
            <button style={ghost} disabled={selectedHero?.status === "queued" || selectedHero?.status === "ready"} onClick={() => makeHero(selected)}>
              {selectedHero?.status === "failed" ? "Retry banner" : selectedHero?.status === "ready" ? "Banner ready" : "Generate banner"}
            </button>
            <span style={{ fontSize: 12, color: "#5b6470", marginLeft: 8 }}>Decorative only — does not affect ranking.</span>
          </div>
        </section>
      )}
    </main>
  );
}
