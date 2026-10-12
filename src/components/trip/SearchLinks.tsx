"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { RouteOption, TripResponse } from "@/contract/trip";
import { useHydrated } from "@/lib/browserStore";
import { formatWeekday } from "@/lib/format";
import { flightSearchLink, hotelSearchLink, type SearchLink } from "@/lib/searchLinks";
import { useSession, type DemoUser } from "@/lib/session";
import { savePlannedTrip, usePlannedTrips } from "@/lib/trips";
import { ArrowRight, ArrowUpRight, Check } from "../landing/Icons";
import { SignInPanel } from "../site/SignInPanel";
import site from "../site/site.module.css";
import styles from "./trip.module.css";
import { cityPath } from "./tripFormat";

type Props = { trip: TripResponse; option: RouteOption };

// The gate: search links show only with a preview session on this device.
export function SearchLinks({ trip, option }: Props) {
  const hydrated = useHydrated();
  const session = useSession();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusAfterSignIn, setFocusAfterSignIn] = useState(false);

  useEffect(() => {
    if (focusAfterSignIn && session) {
      headingRef.current?.focus();
      setFocusAfterSignIn(false);
    }
  }, [focusAfterSignIn, session]);

  if (!hydrated) return <div id="route-links" className={styles.linksAnchor} />;

  return (
    <div id="route-links" className={styles.linksAnchor}>
      {session ? (
        <LinksPanel trip={trip} option={option} session={session} headingRef={headingRef} />
      ) : (
        <SignInPanel
          title="Sign in to see the search links"
          reason="We'll list a flight search for every leg and a hotel search for every stay on this route."
          onSignedIn={() => setFocusAfterSignIn(true)}
        />
      )}
    </div>
  );
}

type PanelProps = Props & { session: DemoUser; headingRef: React.Ref<HTMLHeadingElement> };

function LinksPanel({ trip, option, session, headingRef }: PanelProps) {
  const id = useId();
  return (
    <section className={site.panel} aria-labelledby={`${id}-title`}>
      <div className={site.panelBand}>
        <h2 id={`${id}-title`} className={site.panelBandTitle} ref={headingRef} tabIndex={-1}>
          Search links for this route
        </h2>
      </div>
      <div className={site.panelBody}>
        <p className={styles.linksNote}>
          These open public search pages. Prices and availability there can differ from our estimates.
        </p>

        <div className={styles.linkGroup}>
          <h3 className={styles.linkGroupTitle}>Flights · Route {option.label}</h3>
          <ul className={styles.linkList}>
            {option.legs.map((leg, index) => (
              <SearchRow
                key={`leg-${index}`}
                link={flightSearchLink(leg)}
                detail={`${formatWeekday(leg.departureDate)} · one way`}
              />
            ))}
          </ul>
        </div>

        {option.stays.length ? (
          <div className={styles.linkGroup}>
            <h3 className={styles.linkGroupTitle}>Hotels · Route {option.label}</h3>
            <ul className={styles.linkList}>
              {option.stays.map((stay, index) => (
                <SearchRow
                  key={`stay-${index}`}
                  link={hotelSearchLink(stay)}
                  detail={`${formatWeekday(stay.checkIn)} – ${formatWeekday(stay.checkOut)} · ${stay.nights} ${
                    stay.nights === 1 ? "night" : "nights"
                  }`}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <SaveTrip trip={trip} option={option} session={session} />
      </div>
    </section>
  );
}

function SearchRow({ link, detail }: { link: SearchLink; detail: string }) {
  return (
    <li>
      <a className={styles.searchLink} href={link.href} target="_blank" rel="noopener noreferrer">
        <span className={styles.searchText}>
          <span className={styles.searchLabel}>{link.label}</span>
          <span className={styles.searchMeta}>
            {link.provider} search · {detail}
          </span>
        </span>
        <span className={styles.searchIcon} aria-hidden="true">
          <ArrowUpRight />
        </span>
        <span className="visually-hidden"> (opens {link.provider} in a new tab)</span>
      </a>
    </li>
  );
}

function SaveTrip({ trip, option, session }: Props & { session: DemoUser }) {
  const planned = usePlannedTrips(session.email);
  const saved = planned.find((t) => t.requestId === trip.requestId);
  const savedThis = saved?.optionId === option.id;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (justSaved && savedThis) statusRef.current?.focus();
  }, [justSaved, savedThis]);

  function save() {
    savePlannedTrip({
      requestId: trip.requestId,
      savedAt: new Date().toISOString(),
      ownerEmail: session.email,
      eventName: option.event.name,
      eventCity: option.event.city,
      eventStart: option.event.startDate,
      eventEnd: option.event.endDate,
      optionId: option.id,
      title: option.title,
      path: cityPath(option),
      total: option.costBreakdown.total,
      budget: option.costBreakdown.budget,
      withinBudget: option.feasibility.withinBudget,
    });
    setJustSaved(true);
  }

  const savedLabel = saved ? trip.options.find((o) => o.id === saved.optionId)?.label : undefined;

  return (
    <div className={styles.save}>
      {savedThis ? (
        <div className={styles.saved}>
          <p className={styles.savedText} ref={statusRef} tabIndex={-1}>
            <Check className={styles.savedIcon} />
            Saved to my trips
          </p>
          <Link className={styles.savedLink} href="/trips">
            Open my trips
            <ArrowRight className={styles.showIcon} />
          </Link>
        </div>
      ) : (
        <>
          {savedLabel ? (
            <p className={styles.saveNote}>
              You saved route {savedLabel} from this search. Saving route {option.label} replaces it.
            </p>
          ) : null}
          <div>
            <button type="button" className={`${site.signButton} ${site.signButtonDark}`} onClick={save}>
              <span className={site.signArrow}>
                <ArrowRight />
              </span>
              <span>{savedLabel ? `Save route ${option.label} instead` : "Save to my trips"}</span>
            </button>
          </div>
        </>
      )}
      <p className={site.hint}>Saved on this device for {session.email}.</p>
    </div>
  );
}
