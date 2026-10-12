"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiRequestError, requestHero } from "@/contract/client";
import type { RouteOption } from "@/contract/trip";
import { useStoredValue, writeStore } from "@/lib/browserStore";
import { formatRange } from "@/lib/format";
import { PookieMark } from "../site/PookieMark";
import site from "../site/site.module.css";
import { downloadPoster } from "./exportPoster";
import { posterCities, posterResult, routeDates, safePosterUrl } from "./poster";
import styles from "./experience.module.css";

type SavedArtwork = { url: string; cached: boolean };
type State = "idle" | "generating" | "queued" | "failed";

export function TripPoster({ option, preview = false }: { option: RouteOption; preview?: boolean }) {
  const id = useId();
  const storeKey = `eh:poster:${option.id}`;
  const stored = useStoredValue<SavedArtwork | null>(storeKey, null);
  const [artwork, setArtwork] = useState<SavedArtwork | null>(null);
  // Explicit layout preview reuses our vector logo. It never calls an image provider.
  const previewUrl = preview && typeof window !== "undefined" ? `${window.location.origin}/pookie-logo.svg` : undefined;
  const url = safePosterUrl(previewUrl ?? artwork?.url ?? stored?.url ?? (option.heroImage?.status === "ready" ? option.heroImage.url : undefined));
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busy = state === "generating";
  const cities = posterCities(option);
  const dates = routeDates(option);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current?.abort(); };
  }, []);

  async function generate() {
    if (active.current || url) return;
    const controller = new AbortController();
    active.current = controller;
    setState("generating"); setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 70_000);
    try {
      const response = await requestHero(option, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const result = posterResult(response, option.id);
      if (result.status === "queued") { setState("queued"); return; }
      const ready = { url: result.url, cached: result.cached };
      setArtwork(ready);
      writeStore(storeKey, ready);
      setState("idle");
    } catch (err) {
      if (!mounted.current) return;
      setState("failed");
      const message = err instanceof ApiRequestError
        ? err.code === "hero_disabled" ? "Poster generation is not configured yet. Your itinerary is still ready."
          : err.code === "hero_limit_reached" ? "The poster generation limit has been reached. Your itinerary is still ready."
          : "Artwork generation failed. You can retry without changing your itinerary."
        : controller.signal.aborted ? "Artwork generation timed out. You can retry." : "No usable artwork came back. Please retry.";
      setError(message);
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) active.current = null;
    }
  }

  async function exportImage() {
    if (!url || exporting) return;
    setExporting(true); setExportError(null);
    try { await downloadPoster(option, url, preview); }
    catch (err) { if (mounted.current) setExportError(err instanceof Error ? err.message : "Poster download failed. Try again."); }
    finally { if (mounted.current) setExporting(false); }
  }

  return (
    <section className={site.panel} aria-labelledby={`${id}-title`}>
      <div className={site.panelBand}>
        <h2 className={site.panelBandTitle} id={`${id}-title`}>Your trip, as a poster</h2>
        <span className={styles.badge}>fal.ai</span>
      </div>
      <div className={styles.posterLayout}>
        <div className={styles.poster} role="img" aria-label={`Pookie trip poster: ${cities.join(" and ")}, ${formatRange(dates.start, dates.end)}. ${preview ? "Synthetic layout preview, no fal.ai call." : url && !imageFailed ? "AI-generated artwork." : "Artwork not generated or unavailable."}`}>
          {url && !imageFailed ? (
            // A public provider image. Next Image would require a shared remote-host configuration change.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} className={styles.posterImage} src={url} alt="" onLoad={() => setImageLoaded(true)} onError={() => { setImageFailed(true); setImageLoaded(false); }} />
          ) : <div className={styles.posterPlaceholder} aria-hidden="true"><span /><span /><span /></div>}
          <div className={styles.posterShade} />
          <div className={styles.posterBrand}><span><PookieMark /></span>Pookie</div>
          <div className={styles.posterCopy}>
            <p className={styles.posterEyebrow}>Your next chapter</p>
            <h3>{cities.map((city) => <span key={city}>{city}</span>)}</h3>
            <p>{formatRange(dates.start, dates.end)}</p>
            <div className={styles.posterEvent}><strong>{option.event.name}</strong><span>{option.event.city} · {formatRange(option.event.startDate, option.event.endDate)}</span></div>
            <p className={styles.posterDisclosure}>{preview ? "Synthetic layout preview · no fal.ai call" : url && !imageFailed ? "AI-generated artwork · fal.ai" : "Poster layout · artwork not generated"}</p>
          </div>
        </div>
        <div className={styles.posterControls}>
          <h3>A souvenir for route {option.label}</h3>
          <p>{preview ? "Synthetic layout preview using the Pookie logo. No artwork was generated and no provider was called." : "Turn your selected route into a travel poster. The artwork comes from fal.ai; the cities, dates and event come from your itinerary."}</p>
          <p className={styles.briefNote}>{preview ? "This preview is for checking layout and download behaviour only." : "Decorative artwork, not a photograph of a confirmed hotel, venue or booking. Generation starts only when you press the button."}</p>
          {url ? (
            <>
              <p className={styles.posterStatus} role="status">{imageFailed ? "Artwork could not load." : imageLoaded ? preview ? "Layout preview ready. This is not generated artwork." : "Your poster is ready." : "Loading your artwork…"} {!preview && (stored?.cached || artwork?.cached) ? "Reused existing artwork." : ""}</p>
              <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={exporting || !imageLoaded} onClick={exportImage}>{exporting ? "Preparing PNG…" : "Download poster PNG"}</button>
              <a className={styles.artworkLink} href={url} target="_blank" rel="noreferrer">Open the original artwork ↗</a>
              {exportError ? <p className={site.error} role="alert">{exportError}</p> : null}
            </>
          ) : (
            <>
              <button type="button" className={`${site.signButton} ${site.signButtonDark}`} disabled={busy} onClick={generate}>
                {busy ? "Creating your poster…" : state === "queued" ? "Check poster status" : state === "failed" ? "Retry poster generation" : "Create my trip poster"}
              </button>
              <p className={styles.posterStatus} role="status">{busy ? "Generating one image for this route. You can keep exploring your itinerary." : state === "queued" ? "Your artwork is queued. Check again shortly." : "Dates stay fixed. Artwork never changes the route or price."}</p>
              {error ? <p className={site.error} role="alert">{error}</p> : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
