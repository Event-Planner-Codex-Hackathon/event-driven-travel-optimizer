"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { BoardStage, type CustomBoard } from "@/components/landing/BoardStage";
import type { BoardRow } from "@/components/landing/board/splitFlapEngine";
import { ArrowRight } from "@/components/landing/Icons";
import { SiteShell, usePrefersReducedMotion } from "@/components/site/SiteShell";
import site from "@/components/site/site.module.css";
import { ApiRequestError, optimizeTrip } from "@/contract/client";
import type { OptimizeBody } from "@/contract/trip";
import { useHydrated } from "@/lib/browserStore";
import { formatDay, formatMoney, formatRange } from "@/lib/format";
import { clearPendingSearch, saveTripResponse, takePendingSearch, type PendingSearch } from "@/lib/trips";
import styles from "./searching.module.css";

// One board row per thing the planner really does. Nothing here is a live search.
type Step = { wide: string; narrow: string; active: string; done: string; say: string };

const STEPS: readonly Step[] = [
  { wide: "YOUR TRIP", narrow: "TRIP", active: "CHECKING", done: "CHECKED", say: "Checking your trip details" },
  { wide: "EVENT DAYS", narrow: "EVENT", active: "PROTECTING", done: "PROTECTED", say: "Keeping the event days fixed" },
  { wide: "FLIGHTS", narrow: "FLIGHTS", active: "ESTIMATING", done: "ESTIMATED", say: "Estimating flight costs" },
  { wide: "HOTEL NIGHTS", narrow: "HOTELS", active: "ESTIMATING", done: "ESTIMATED", say: "Estimating hotel nights" },
  { wide: "3 ROUTES", narrow: "ROUTES", active: "RANKING", done: "RANKED", say: "Ranking three routes" },
];

type Layout = { cols: number; subject: number; narrow: boolean };
const WIDE: Layout = { cols: 30, subject: 13, narrow: false };
const NARROW: Layout = { cols: 18, subject: 8, narrow: true };

const STEP_MS = 1100;
// Board stays up at least MIN_BOARD_MS + finale so the flips can be read.
const MIN_BOARD_MS = 1600;
const FINALE_MS = 1800;
const FINALE_REDUCED_MS = 600;
// Avoids a flash of the board before a question or error panel.
const MIN_NOTICE_MS = 900;

type Phase =
  | { kind: "working" }
  | { kind: "finishing" }
  | { kind: "needs_input"; questions: string[] }
  | { kind: "error"; network: boolean; message: string };

type RowState = "waiting" | "active" | "done";

/** Board-safe text: uppercase, accents stripped, only characters the flaps carry. */
function boardText(raw: string): string {
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/→|->/g, ">")
    .replace(/[^A-Z0-9 .,\-–/:·'>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The route label for the first row once the trip is read, if it fits. */
function fitLabel(label: string, cols: number): string | null {
  const clean = boardText(label);
  if (!clean || clean === "YOUR TRIP") return null;
  if (clean.length <= cols) return clean;
  const tight = clean.replace(/\s*>\s*/g, ">");
  return tight.length <= cols ? tight : null;
}

function buildBoard(current: number, finished: boolean, label: string | null): CustomBoard {
  const stateOf = (index: number): RowState =>
    finished || index < current ? "done" : index === current ? "active" : "waiting";

  const rows = (layout: Layout): BoardRow[] => {
    const route = label ? fitLabel(label, layout.cols) : null;
    return STEPS.map((step, index): BoardRow => {
      const subject = layout.narrow ? step.narrow : step.wide;
      const state = stateOf(index);
      if (state === "waiting") return { text: subject, status: "off" };
      if (state === "active") return { text: subject.padEnd(layout.subject) + step.active, status: "flex" };
      if (index === 0 && route) return { text: route, status: "fixed" };
      return { text: subject.padEnd(layout.subject) + step.done, status: "fixed" };
    });
  };

  const readout = finished
    ? "All five steps are done. Opening your route comparison."
    : `Step ${current + 1} of ${STEPS.length}: ${STEPS[current].say}.`;

  return { wide: rows(WIDE), narrow: rows(NARROW), readout };
}

function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function describeError(err: unknown): { network: boolean; message: string } {
  if (err instanceof ApiRequestError) return { network: err.code === "network", message: err.message };
  return { network: false, message: "Something unexpected stopped the comparison." };
}

type Fact = { term: string; value: string };

function dateSpan(start?: string, end?: string): string | null {
  if (start && end) return formatRange(start, end);
  if (start) return `From ${formatDay(start)}`;
  if (end) return `Until ${formatDay(end)}`;
  return null;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The form fields the traveler sent, in their own words. */
function submittedFacts(body: OptimizeBody): Fact[] {
  const o = body.overrides;
  if (!o) return [];
  const pairs: Array<[string, string | null | undefined]> = [
    ["From", o.origin?.city],
    ["Event", [o.event?.name, o.event?.city].filter(Boolean).join(", ")],
    ["Event dates", dateSpan(o.event?.startDate, o.event?.endDate)],
    ["Travel window", dateSpan(o.travelWindow?.startDate, o.travelWindow?.endDate)],
    ["Budget", o.budget ? formatMoney(o.budget) : null],
    ["Extra cities", o.optionalCities?.map((c) => c.city).join(", ")],
    ["Hotels", o.preferences?.lodgingStyle ? capitalize(o.preferences.lodgingStyle) : null],
    ["Pace", o.preferences?.preferredPace ? capitalize(o.preferences.preferredPace) : null],
    ["Max stops", o.preferences?.maxStops === undefined ? null : String(o.preferences.maxStops)],
  ];
  return pairs.flatMap(([term, value]) => (value ? [{ term, value }] : []));
}

/** Shows what was sent so it can be copied before going back to the form. */
function SubmittedDetails({ body, idBase }: { body: OptimizeBody; idBase: string }) {
  const text = body.text?.trim() ?? "";
  const facts = submittedFacts(body);
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const [copyNote, setCopyNote] = useState("");

  if (!text && facts.length === 0) return null;

  const selectQuote = () => {
    const node = quoteRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Description copied.");
    } catch {
      selectQuote();
      setCopyNote("Copying was blocked, so the text is selected. Press Ctrl+C or ⌘C to copy it.");
    }
  };

  return (
    <section className={styles.sent} aria-labelledby={`${idBase}-sent`}>
      <h3 className={styles.sentTitle} id={`${idBase}-sent`}>
        What you sent
      </h3>
      {text ? (
        <>
          <blockquote className={styles.quote} ref={quoteRef}>
            {text}
          </blockquote>
          <div className={styles.copyRow}>
            <button type="button" className={site.ghostButton} onClick={copy}>
              Copy description
            </button>
            <span className={site.hint} role="status">
              {copyNote}
            </span>
          </div>
        </>
      ) : null}
      {facts.length > 0 ? (
        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div className={styles.fact} key={fact.term}>
              <dt>{fact.term}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className={site.hint}>
        {text
          ? "Copy your description before going back, then add the missing details to it."
          : "Keep these to hand when you go back to the form and add the missing details."}
      </p>
    </section>
  );
}

export function SearchingView() {
  return (
    <SiteShell sky={1} current="plan">
      <Searching />
    </SiteShell>
  );
}

function Searching() {
  const router = useRouter();
  const hydrated = useHydrated();
  const reducedMotion = usePrefersReducedMotion();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Read once in the browser; the server never sees the pending search.
  const pending = useMemo<PendingSearch | null>(() => (hydrated ? takePendingSearch() : null), [hydrated]);

  const [phase, setPhase] = useState<Phase>({ kind: "working" });
  const [step, setStep] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const abortTimerRef = useRef<number | undefined>(undefined);
  const reducedRef = useRef(reducedMotion);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  const run = useCallback(
    async (search: PendingSearch) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      const startedAt = Date.now();
      const holdUntil = (ms: number) => sleep(Math.max(0, ms - (Date.now() - startedAt)), signal);

      try {
        const response = await optimizeTrip(search.body, signal);
        if (signal.aborted) return;

        if (response.status === "ready") {
          saveTripResponse(response);
          const href = `/trips/${encodeURIComponent(response.requestId)}`;
          router.prefetch(href);
          if (!(await holdUntil(MIN_BOARD_MS))) return;
          clearPendingSearch();
          setPhase({ kind: "finishing" });
          if (!(await sleep(reducedRef.current ? FINALE_REDUCED_MS : FINALE_MS, signal))) return;
          router.replace(href);
          return;
        }

        if (!(await holdUntil(MIN_NOTICE_MS))) return;
        setPhase({ kind: "needs_input", questions: response.clarificationQuestions });
      } catch (err) {
        if (signal.aborted) return;
        if (!(await holdUntil(MIN_NOTICE_MS))) return;
        setPhase({ kind: "error", ...describeError(err) });
      }
    },
    [router],
  );

  // Start exactly once. StrictMode remounts at once, so the abort waits a tick and is cancelled by the remount.
  useEffect(() => {
    window.clearTimeout(abortTimerRef.current);
    if (pending && !controllerRef.current) void run(pending);
    return () => {
      abortTimerRef.current = window.setTimeout(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
      }, 0);
    };
  }, [pending, run]);

  // Advance the progress board while the request is out.
  useEffect(() => {
    if (!pending || phase.kind !== "working") return;
    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [pending, phase.kind]);

  const view = !hydrated ? null : !pending ? "empty" : phase.kind === "finishing" ? "working" : phase.kind;

  // Move focus to the new heading when the page switches to a different view.
  const lastView = useRef<string | null>(null);
  useEffect(() => {
    if (view === null) return;
    if (lastView.current !== null && lastView.current !== view) headingRef.current?.focus();
    lastView.current = view;
  }, [view]);

  const board = useMemo(
    () => buildBoard(step, phase.kind === "finishing", pending?.label ?? null),
    [step, phase.kind, pending],
  );

  const retry = () => {
    if (!pending) return;
    setStep(0);
    setPhase({ kind: "working" });
    void run(pending);
  };

  const headingProps = {
    id: headingId,
    ref: headingRef,
    tabIndex: -1,
    className: `${site.pageTitle} ${styles.heading}`,
  };

  if (view === "empty") {
    return (
      <div className={site.container}>
        <header className={site.pageHead}>
          <h1 {...headingProps}>No trip to compare yet</h1>
          <p className={site.pageIntro}>
            Start with the trip form, and Pookie will compare routes around your event here.
          </p>
          <div className={styles.actions}>
            <Link className={site.signButton} href="/#plan">
              <span className={site.signArrow}>
                <ArrowRight />
              </span>
              <span>Plan a trip</span>
            </Link>
          </div>
        </header>
      </div>
    );
  }

  if (phase.kind === "needs_input") {
    const count = phase.questions.length;
    return (
      <div className={`${site.container} ${styles.outcome}`}>
        <header className={site.pageHead}>
          <h1 {...headingProps}>We need a bit more detail</h1>
          <p className={site.pageIntro}>
            Pookie doesn&rsquo;t guess required details. Add these on the form, then compare again.
          </p>
        </header>
        <section className={`${site.panel} ${styles.notice}`} aria-labelledby={`${headingId}-missing`}>
          <div className={site.panelBand}>
            <h2 className={`${site.panelBandTitle} ${styles.bandTitle}`} id={`${headingId}-missing`}>
              <span className={site.lamp} data-status="unknown" aria-hidden="true" />
              Still unknown
            </h2>
            {count > 0 ? (
              <span className={styles.bandCount}>
                {count} {count === 1 ? "question" : "questions"}
              </span>
            ) : null}
          </div>
          <div className={site.panelBody}>
            {count > 0 ? (
              <ul className={site.boardRows}>
                {phase.questions.map((question, index) => (
                  <li className={`${site.boardRow} ${styles.question}`} key={index}>
                    <span className={`${site.lamp} ${styles.questionLamp}`} data-status="unknown" aria-hidden="true" />
                    <span className={styles.questionText}>{question}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.message}>Add your event, its dates and your budget, then compare again.</p>
            )}
            {pending ? <SubmittedDetails body={pending.body} idBase={headingId} /> : null}
            <div className={styles.actions}>
              <Link className={`${site.signButton} ${site.signButtonDark}`} href="/#plan">
                <span className={site.signArrow}>
                  <ArrowRight />
                </span>
                <span>Back to the form</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className={`${site.container} ${styles.outcome}`}>
        <header className={site.pageHead}>
          <h1 {...headingProps}>Routes couldn&rsquo;t be compared</h1>
        </header>
        <section className={`${site.panel} ${styles.notice}`} aria-labelledby={`${headingId}-problem`}>
          <div className={site.panelBand}>
            <h2 className={site.panelBandTitle} id={`${headingId}-problem`}>
              {phase.network ? "We couldn’t reach the planner." : "The planner couldn’t finish this trip."}
            </h2>
          </div>
          <div className={site.panelBody}>
            <p className={styles.message}>
              {phase.network
                ? "The request didn’t reach Pookie’s planner, so no routes were compared. Check your connection, then try again."
                : phase.message}
            </p>
            <p className={site.hint}>Try again sends the same trip details.</p>
            <div className={styles.actions}>
              <button type="button" className={`${site.signButton} ${site.signButtonDark}`} onClick={retry}>
                <span className={site.signArrow}>
                  <ArrowRight />
                </span>
                <span>Try again</span>
              </button>
              <Link className={site.textButton} href="/#plan">
                Back to the form
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <BoardStage custom={board} reducedMotion={reducedMotion} />
      <div className={styles.caption}>
        <h1 {...headingProps}>Comparing routes around your event</h1>
        <p className={site.pageIntro}>
          Pookie is checking your dates, keeping the event days fixed and estimating flights and hotel nights
          for each route. Every price is an estimate, not a live fare.
        </p>
        <ul className={styles.legend} aria-label="Lamp key">
          <li>
            <span className={site.lamp} data-status="fixed" aria-hidden="true" />
            Done
          </li>
          <li>
            <span className={site.lamp} data-status="flex" aria-hidden="true" />
            Working
          </li>
          <li>
            <span className={`${site.lamp} ${styles.lampOff}`} aria-hidden="true" />
            Waiting
          </li>
        </ul>
      </div>
    </div>
  );
}
