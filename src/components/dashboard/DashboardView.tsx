"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Plane } from "@/components/landing/Icons";
import { SignInPanel } from "@/components/site/SignInPanel";
import { SiteShell } from "@/components/site/SiteShell";
import site from "@/components/site/site.module.css";
import { hasSyntheticPrices } from "@/components/trip/tripFormat";
import { useHydrated } from "@/lib/browserStore";
import { formatDay, formatMoney, formatRange } from "@/lib/format";
import { signOut, useSession, type DemoUser } from "@/lib/session";
import {
  removePlannedTrip,
  savePlannedTrip,
  usePlannedTrips,
  useTripResponse,
  type PlannedTrip,
} from "@/lib/trips";
import styles from "./dashboard.module.css";

export function DashboardView() {
  return (
    <SiteShell sky={0} current="trips">
      <div className={site.container}>
        <Dashboard />
      </div>
    </SiteShell>
  );
}

function Dashboard() {
  const hydrated = useHydrated();
  const user = useSession();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const email = user?.email;

  // Signing in or out removes the control that had focus; land on the heading instead.
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  }, [email]);

  const intro = !hydrated
    ? "Checking this browser for saved trips."
    : user
      ? `Hi ${user.name}. These are the trips you saved on this device.`
      : "Sign in to see the trips you saved.";

  return (
    <>
      <div className={site.pageHead}>
        <h1 ref={headingRef} className={`${site.pageTitle} ${styles.title}`} tabIndex={-1}>
          My trips
        </h1>
        <p className={site.pageIntro}>{intro}</p>
        {hydrated && user ? (
          <div className={styles.headActions}>
            <Link className={site.signButton} href="/#plan">
              <span className={site.signArrow}>
                <Plane direction="forward" />
              </span>
              <span>Plan a new trip</span>
            </Link>
            <button
              type="button"
              className={site.textButton}
              onClick={() => {
                focusHeading.current = true;
                signOut();
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      {!hydrated ? null : user ? (
        <TripBoard user={user} />
      ) : (
        <div className={styles.signIn}>
          <SignInPanel
            title="Sign in to see your trips"
            reason="Trips you save are kept in this browser, linked to your email."
            onSignedIn={() => {
              focusHeading.current = true;
            }}
          />
        </div>
      )}
    </>
  );
}

type FocusTarget = { kind: "undo" } | { kind: "open"; requestId: string };

function TripBoard({ user }: { user: DemoUser }) {
  const stored = usePlannedTrips(user.email);
  const trips = [...stored].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  const [message, setMessage] = useState("");
  const [removed, setRemoved] = useState<PlannedTrip | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const openRefs = useRef(new Map<string, HTMLAnchorElement>());
  const pendingFocus = useRef<FocusTarget | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.kind === "undo") undoRef.current?.focus();
    else openRefs.current.get(target.requestId)?.focus();
  });

  function remove(trip: PlannedTrip) {
    pendingFocus.current = { kind: "undo" };
    setRemoved(trip);
    setMessage(`Removed ${trip.title} (${trip.eventName}) from your trips.`);
    removePlannedTrip(trip.requestId, trip.ownerEmail);
  }

  function undo() {
    if (!removed) return;
    pendingFocus.current = { kind: "open", requestId: removed.requestId };
    savePlannedTrip(removed);
    setMessage(`Restored ${removed.title} (${removed.eventName}).`);
    setRemoved(null);
  }

  return (
    <section aria-label="Saved trips">
      <div className={styles.notice} data-active={message ? "" : undefined}>
        <p className={styles.noticeText} role="status">
          {message}
        </p>
        {removed ? (
          <button ref={undoRef} type="button" className={`${site.textButton} ${styles.undo}`} onClick={undo}>
            Undo<span className="visually-hidden"> removing {removed.title}</span>
          </button>
        ) : null}
      </div>

      {trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className={styles.board}>
          <table className={styles.table} role="table">
            <caption className="visually-hidden">
              Saved trips, newest first. Totals are estimates.
            </caption>
            <thead className={styles.head} role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  <FlapLabel text="Event" />
                </th>
                <th scope="col" role="columnheader">
                  <FlapLabel text="Route" />
                </th>
                <th scope="col" role="columnheader">
                  <FlapLabel text="Estimated total" />
                </th>
                <th scope="col" role="columnheader">
                  <FlapLabel text="Status" />
                </th>
                <th scope="col" role="columnheader">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={styles.body} role="rowgroup">
              {trips.map((trip) => (
                <TripRow
                  key={trip.requestId}
                  trip={trip}
                  onRemove={() => remove(trip)}
                  openRef={(node) => {
                    if (node) openRefs.current.set(trip.requestId, node);
                    else openRefs.current.delete(trip.requestId);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>
        Saved in this browser only. Totals are the planner&rsquo;s estimates from when you saved each trip, not live
        fares.
      </p>
    </section>
  );
}

function TripRow({
  trip,
  onRemove,
  openRef,
}: {
  trip: PlannedTrip;
  onRemove: () => void;
  openRef: (node: HTMLAnchorElement | null) => void;
}) {
  const within = trip.withinBudget;
  const response = useTripResponse(trip.requestId);
  // Without the stored response the price sources are unknown, so label it as synthetic.
  const synthetic = isSynthetic(response);
  const href = `/trips/${encodeURIComponent(trip.requestId)}?option=${encodeURIComponent(trip.optionId)}`;
  const dates = safeFormat(() => formatRange(trip.eventStart, trip.eventEnd));
  const saved = savedDay(trip.savedAt);

  return (
    <tr className={styles.row} role="row" data-within={within ? "" : undefined}>
      <th scope="row" role="rowheader" className={styles.eventCell}>
        <span className={styles.cellLabel} aria-hidden="true">
          Event
        </span>
        <span className={styles.eventName}>{trip.eventName}</span>
        <span className={styles.meta}>
          {trip.eventCity}
          {dates ? ` · ${dates}` : null}
        </span>
      </th>
      <td role="cell" className={styles.routeCell}>
        <span className={styles.cellLabel} aria-hidden="true">
          Route
        </span>
        <span className={styles.routeTitle}>{trip.title}</span>
        <span className={styles.meta}>{trip.path}</span>
      </td>
      <td role="cell" className={styles.moneyCell}>
        <span className={styles.cellLabel} aria-hidden="true">
          Estimated total
        </span>
        <span className={styles.total}>
          <span className={styles.totalValue}>{formatMoney(trip.total)}</span>{" "}
          <span className={site.estimateTag}>estimate</span>
        </span>
        {synthetic ? <span className={styles.synthetic}>Demo data — synthetic, not live offers</span> : null}
        <span className={styles.meta}>Budget {formatMoney(trip.budget)}</span>
      </td>
      <td role="cell" className={styles.statusCell}>
        <span className={styles.cellLabel} aria-hidden="true">
          Status
        </span>
        <span className={styles.status}>
          <span className={site.lamp} data-status={within ? "fixed" : "unknown"} aria-hidden="true" />
          {within ? "Within budget" : "Over budget"}
        </span>
        {saved ? <span className={styles.meta}>Saved {saved}</span> : null}
      </td>
      <td role="cell" className={styles.actionsCell}>
        <div className={styles.actions}>
          <Link ref={openRef} className={styles.open} href={href}>
            Open<span className="visually-hidden"> {trip.title}, {trip.eventName}</span>
            <Plane direction="forward" className={styles.openArrow} />
          </Link>
          <button type="button" className={`${site.textButton} ${styles.remove}`} onClick={onRemove}>
            Remove<span className="visually-hidden"> {trip.title}, {trip.eventName}</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState() {
  const id = useId();
  return (
    <section className={`${site.panel} ${styles.empty}`} aria-labelledby={`${id}-title`}>
      <div className={site.panelBand}>
        <h2 id={`${id}-title`} className={site.panelBandTitle}>
          No saved trips yet
        </h2>
      </div>
      <div className={site.panelBody}>
        <p className={styles.emptyText}>
          Open a trip and choose <strong>Save to my trips</strong>.
        </p>
        <div>
          <Link className={`${site.signButton} ${site.signButtonDark}`} href="/#plan">
            <span className={site.signArrow}>
              <Plane direction="forward" />
            </span>
            <span>Plan a trip</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Column labels drawn as split-flap cells; the plain text stays for screen readers.
function FlapLabel({ text }: { text: string }) {
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span className={`${site.flapText} ${styles.flapLabel}`} aria-hidden="true">
        {text.split(" ").map((word, w) => (
          <span className={styles.flapWord} key={w}>
            {word.split("").map((char, c) => (
              <span className={styles.flapCell} key={c}>
                {char}
              </span>
            ))}
          </span>
        ))}
      </span>
    </>
  );
}

function isSynthetic(response: ReturnType<typeof useTripResponse>): boolean {
  if (!response) return true;
  try {
    return hasSyntheticPrices(response);
  } catch {
    return true;
  }
}

function safeFormat(format: () => string): string | null {
  try {
    return format();
  } catch {
    return null;
  }
}

/** Local calendar day of an ISO timestamp, e.g. "12 Oct". */
function savedDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return safeFormat(() => formatDay(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`));
}
