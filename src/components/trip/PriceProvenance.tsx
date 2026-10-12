import type { PriceSource } from "@/contract/trip";
import { priceSourceLabel, publicSourceUrl } from "./pricingDisplay";
import styles from "./integration.module.css";

export function PriceProvenance({ source }: { source?: PriceSource }) {
  if (!source) return null;
  const observed = source.observedAt ?? source.fetchedAt;
  const url = publicSourceUrl(source.searchUrl);
  return (
    <span className={styles.provenance}>
      <strong>{priceSourceLabel(source)}</strong>
      <span>SerpApi · {source.product === "google_flights" ? "Google Flights" : "Google Hotels"} · {source.description}</span>
      <span>Observed <time dateTime={observed}>{new Date(observed).toLocaleString("en-GB")}</time></span>
      {source.fetchedAt !== observed ? <span>Retrieved <time dateTime={source.fetchedAt}>{new Date(source.fetchedAt).toLocaleString("en-GB")}</time> · original observation time retained</span> : null}
      {source.notes?.map((note) => <span key={note}>{note}</span>)}
      {url ? <a href={url} target="_blank" rel="noreferrer">Public search page ↗</a> : null}
      <span>Search observation, not a reserved offer. Taxes and availability need provider confirmation.</span>
    </span>
  );
}
