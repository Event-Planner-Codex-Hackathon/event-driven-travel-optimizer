"use client";
// Guest price lookup: one flight or one hotel stay, no trip and no account.
// Functional baseline from the backend track; the frontend track may restyle it.

import { useEffect, useState } from "react";
import { ApiRequestError, getSession, quotePrice } from "@/contract/client";
import type { LodgingStyle, Money, QuoteBody, QuoteResponse, SessionResponse } from "@/contract/trip";

const fmt = (m: Money) => `${Math.round(m.amountMinor / 100).toLocaleString("en-US")} ${m.currency}`;
const box: React.CSSProperties = { background: "#fff", border: "1px solid #dde1e6", borderRadius: 10, padding: 16 };
const input: React.CSSProperties = { padding: 8, borderRadius: 8, border: "1px solid #c5cbd3", font: "inherit" };
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #14171c", background: "#14171c", color: "#fff", cursor: "pointer" };
const tab = (active: boolean): React.CSSProperties => ({ ...btn, background: active ? "#14171c" : "#fff", color: active ? "#fff" : "#14171c" });

export default function PriceLookup() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [kind, setKind] = useState<"flight" | "hotel">("flight");
  const [from, setFrom] = useState("Istanbul");
  const [to, setTo] = useState("Singapore");
  const [date, setDate] = useState("2026-10-25");
  const [city, setCity] = useState("Bangkok");
  const [checkIn, setCheckIn] = useState("2026-10-23");
  const [checkOut, setCheckOut] = useState("2026-10-25");
  const [style, setStyle] = useState<LodgingStyle>("standard");
  const [result, setResult] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshSession = () => getSession().then(setSession).catch(() => setSession(null));
  useEffect(() => {
    refreshSession();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const body: QuoteBody = kind === "flight" ? { kind, from, to, date } : { kind, city, checkIn, checkOut, style };
    try {
      setResult(await quotePrice(body));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
      refreshSession();
    }
  }

  const cities = session?.cities.map((c) => c.city) ?? [];
  const citySelect = (value: string, onChange: (v: string) => void, label: string) => (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
        {(cities.length ? cities : [value]).map((c) => <option key={c}>{c}</option>)}
      </select>
    </label>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 16 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>EventHopper · price lookup</h1>
        <span style={{ fontSize: 13, color: "#5b6470" }}>
          Browsing as a guest — no account needed.
          {session && (session.features.livePrices
            ? ` ${session.limits.quote.remaining}/${session.limits.quote.max} live lookups left this hour.`
            : " Live prices are off on this server; you will see planning estimates only.")}
        </span>
      </header>

      <form onSubmit={submit} style={{ ...box, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={tab(kind === "flight")} onClick={() => setKind("flight")}>Flight</button>
          <button type="button" style={tab(kind === "hotel")} onClick={() => setKind("hotel")}>Hotel</button>
        </div>
        {kind === "flight" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {citySelect(from, setFrom, "From")}
            {citySelect(to, setTo, "To")}
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} /></label>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            {citySelect(city, setCity, "City")}
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Check-in<input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} style={input} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Check-out<input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} style={input} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>Style
              <select value={style} onChange={(e) => setStyle(e.target.value as LodgingStyle)} style={input}>
                <option value="budget">Budget</option><option value="standard">Standard</option><option value="comfort">Comfort</option>
              </select>
            </label>
          </div>
        )}
        <div><button type="submit" style={btn} disabled={loading}>{loading ? "Checking…" : "Check price"}</button></div>
      </form>

      {error && <div role="alert" style={{ ...box, borderColor: "#e5a1a1", background: "#fff5f5" }}>{error}</div>}

      {result && (
        <section style={{ ...box, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>
              {result.kind === "flight" ? `${result.query.from} → ${result.query.to} · ${result.query.date}` : `${result.query.city} · ${result.query.checkIn} → ${result.query.checkOut} (${result.query.nights}n)`}
            </strong>
            <span style={{ fontSize: 13 }}>Planning estimate: <b>{fmt(result.estimate.price)}</b> <span style={{ color: "#5b6470" }}>({result.estimate.estimateSource})</span></span>
          </div>
          {result.provider.status === "ok" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#5b6470" }}>
                Provider results · fetched {new Date(result.provider.fetchedAt).toLocaleTimeString()}{result.provider.fromCache ? " (cached)" : ""}
                {result.provider.searchUrl && <> · <a href={result.provider.searchUrl} target="_blank" rel="noreferrer">open search</a></>}
              </span>
              {result.provider.offers.length === 0 && <span>No offers matched this date.</span>}
              {result.provider.offers.map((o, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid #eef1f5", paddingTop: 6 }}>
                  <span style={{ fontSize: 14 }}>
                    {o.description}
                    {o.arrivalDate && o.arrivalDate !== o.departureDate && <span style={{ color: "#5b6470" }}> · lands {o.arrivalDate}</span>}
                    {o.totalDerived && <span style={{ color: "#5b6470" }}> · total from nightly rate</span>}
                  </span>
                  <b>{fmt(o.price)}</b>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 14, color: "#8a5a00" }}>{result.provider.message} Showing the planning estimate only.</span>
          )}
          <span style={{ fontSize: 12, color: "#5b6470" }}>{result.scope}</span>
        </section>
      )}
    </main>
  );
}
