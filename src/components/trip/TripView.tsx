"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { TripResponse } from "@/contract/trip";
import { useHydrated } from "@/lib/browserStore";
import { formatMoney, formatRange } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTripResponse } from "@/lib/trips";
import { useBackendSession } from "@/lib/backendSession";
import { ArrowRight, Lock } from "../landing/Icons";
import { SiteShell, usePrefersReducedMotion } from "../site/SiteShell";
import site from "../site/site.module.css";
import { ChangeStop } from "./ChangeStop";
import { TripBriefView } from "./TripBriefView";
import { TripPoster } from "./TripPoster";
import { PriceCheck } from "./PriceCheck";
import { LocalContext } from "./LocalContext";
import { NearbySights } from "./NearbySights";
import { PersonalEvents } from "./PersonalEvents";
import { pricingLabel } from "./pricingDisplay";
import { OtherOptions } from "./OtherOptions";
import { enrichmentOf, syntheticEnrichment } from "./dayPlan";
import { DayPlan } from "./DayPlanView";
import { CostBreakdown, FeaturedRoute } from "./RouteDetail";
import { SearchLinks } from "./SearchLinks";
import styles from "./trip.module.css";
import { defaultOption, formatCompared, hasSyntheticPrices, pickFeatured } from "./tripFormat";

export function TripView() {
  return (
    <SiteShell sky={2}>
      <Suspense fallback={<TripPending />}>
        <TripRoute />
      </Suspense>
    </SiteShell>
  );
}

function TripRoute() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  return <TripContent key={id} id={id} />;
}

function TripContent({ id }: { id: string }) {
  const hydrated = useHydrated();
  const trip = useTripResponse(id);
  const searchParams = useSearchParams();

  if (!hydrated) return <TripPending />;
  if (!trip) return <TripMissing />;
  if (trip.status !== "ready" || !trip.normalizedRequest || trip.options.length === 0) {
    return <TripNeedsInput trip={trip} />;
  }
  return (
    <TripReady
      trip={trip}
      optionParam={searchParams.get("option")}
      preview={searchParams.get("preview") === "synthetic"}
    />
  );
}

function TripPending() {
  return (
    <div className={`${site.container} ${styles.pending}`} aria-busy="true">
      <p className="visually-hidden" role="status">
        Loading your trip
      </p>
    </div>
  );
}

function PlanButton({ label = "Plan a trip" }: { label?: string }) {
  return (
    <div>
      <Link className={site.signButton} href="/#plan">
        <span className={site.signArrow}>
          <ArrowRight />
        </span>
        <span>{label}</span>
      </Link>
    </div>
  );
}

function TripMissing() {
  return (
    <div className={site.container}>
      <div className={styles.messageHead}>
        <h1 className={site.pageTitle}>We can&rsquo;t find this trip on this device</h1>
        <p className={site.pageIntro}>
          Trips are kept in the browser where they were planned. If you planned it somewhere else or cleared this
          browser&rsquo;s data, plan it again here.
        </p>
        <PlanButton />
      </div>
    </div>
  );
}

function TripNeedsInput({ trip }: { trip: TripResponse }) {
  return (
    <div className={site.container}>
      <div className={styles.messageHead}>
        <h1 className={site.pageTitle}>We need a bit more to plan this trip</h1>
        {trip.clarificationQuestions.length ? (
          <ul className={styles.questions}>
            {trip.clarificationQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className={site.pageIntro}>No routes came back for this request.</p>
        )}
        <PlanButton label="Plan again" />
      </div>
    </div>
  );
}

type ReadyProps = { trip: TripResponse; optionParam: string | null; preview: boolean };

function TripReady({ trip, optionParam, preview }: ReadyProps) {
  const featured = pickFeatured(trip, optionParam)!;
  // Synthetic sample data only with an explicit ?preview=synthetic; never as a fallback.
  const enrichment = preview ? syntheticEnrichment(featured) : enrichmentOf(featured);
  const request = trip.normalizedRequest!;
  const session = useSession();
  const provider = useBackendSession();
  const [revisionBusy, setRevisionBusy] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const featuredHeading = useRef<HTMLHeadingElement>(null);
  const shownId = useRef(featured.id);
  const event = featured.event;

  // When another route is chosen, bring it into view and move focus to its heading.
  useEffect(() => {
    if (shownId.current === featured.id) return;
    shownId.current = featured.id;
    const heading = featuredHeading.current;
    if (!heading) return;
    const section = heading.closest("section") ?? heading;
    const top = section.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) {
      section.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
    heading.focus({ preventScroll: true });
  }, [featured.id, reducedMotion]);

  return (
    <div className={site.container}>
      <div className={styles.head}>
        <h1 className={site.pageTitle}>{featured.title}</h1>

        <div className={styles.eventRow}>
          <span className={site.lamp} data-status="fixed" aria-hidden="true" />
          <div className={styles.eventText}>
            <p className={styles.eventName}>{event.name}</p>
            <p className={styles.eventMeta}>
              {event.city} · {formatRange(event.startDate, event.endDate)}
            </p>
          </div>
          <p className={styles.eventFixed}>
            <Lock className={styles.lockIcon} />
            Fixed
          </p>
        </div>

        <p className={styles.metaLine}>
          Budget {formatMoney(request.budget)} · {pricingLabel(trip)} · Compared{" "}
          <time dateTime={trip.generatedAt}>{formatCompared(trip.generatedAt)}</time>
        </p>
        {hasSyntheticPrices(trip) ? <p className={styles.synthetic}>Demo data — synthetic, not live offers</p> : null}
        <ChangeSummary trip={trip} />
        <TripBriefView requestId={trip.requestId} request={request} />
        {trip.interpretation ? <p className={styles.metaLine}>{trip.interpretation.mode === "openai" && trip.interpretation.status === "used" ? `Requirements interpreted with OpenAI${trip.interpretation.fromCache ? " (cached interpretation)" : ""}.` : trip.interpretation.status === "fallback" ? "AI interpretation was unavailable; the deterministic parser read your request." : "The deterministic parser read your request; AI interpretation is disabled."} Confirm the interpreted dates and preferences. Routes, costs and ranking are calculated deterministically.</p> : null}
        <PriceCheck trip={trip} session={provider.session} sessionError={provider.error} refresh={provider.refresh} locked={revisionBusy} onBusy={setRevisionBusy} />
      </div>

      <OtherOptions requestId={trip.requestId} options={trip.options} selectedId={featured.id} recommendedId={trip.recommendedOptionId} preview={preview} />
      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <FeaturedRoute
            option={featured}
            recommended={featured.id === trip.recommendedOptionId}
            signedIn={Boolean(session)}
            headingRef={featuredHeading}
          />
          <TripPoster key={`${featured.id}-${preview}`} option={featured} preview={preview} providerSession={provider.session} onProviderUsed={provider.refresh} />
          <DayPlan option={featured} enrichment={enrichment} />
          {!preview ? <PersonalEvents key={`events-${featured.id}`} requestId={trip.requestId} option={featured} session={provider.session} onUsed={provider.refresh} /> : null}
          {!preview ? <LocalContext key={featured.id} option={featured} session={provider.session} refresh={provider.refresh} /> : null}
          {!preview ? <NearbySights key={`sights-${featured.id}`} option={featured} session={provider.session} refresh={provider.refresh} /> : null}
          <CostBreakdown trip={trip} option={featured} />
        </div>
        <div className={styles.asideCol}>
          <ChangeStop trip={trip} request={request} featured={featured} session={provider.session} locked={revisionBusy} onBusy={setRevisionBusy} />
          <SearchLinks trip={trip} option={featured} />
        </div>
      </div>
    </div>
  );
}

// After a recalculation: one display-only line comparing the recommended totals.
function ChangeSummary({ trip }: { trip: TripResponse }) {
  const previous = useTripResponse(trip.previousRequestId ?? "");
  if (!trip.previousRequestId || !previous) return null;
  const before = defaultOption(previous);
  const after = defaultOption(trip);
  if (!before || !after) return null;

  return (
    <div className={styles.changeRow}>
      <p className={styles.changeText}>
        <span className={styles.changeWord}>Recalculated. </span>
        Was {formatMoney(before.costBreakdown.total)} <span className={site.estimateTag}>estimate</span> with{" "}
        {before.title}, now {formatMoney(after.costBreakdown.total)}{" "}
        <span className={site.estimateTag}>estimate</span> with {after.title}.
      </p>
    </div>
  );
}
