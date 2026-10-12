"use client";

import "./landing.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BoardStage } from "./BoardStage";
import { HallBackdrop } from "./HallBackdrop";
import type { BoardStateId } from "./boardStates";
import { readFont, signFont } from "./fonts";
import { ArrowDown, ArrowRight, Plane } from "./Icons";
import styles from "./Landing.module.css";
import { planTrip } from "./planTrip";
import { TripForm } from "./TripForm";

type Step = { id: BoardStateId; label: string };

const STEPS: Step[] = [
  { id: "intro", label: "Start" },
  { id: "trip", label: "Your trip" },
  { id: "swap", label: "Swap" },
  { id: "sources", label: "Prices" },
  { id: "handoff", label: "Book" },
];

const motionQuery = "(prefers-reduced-motion: reduce)";

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

function Lamp({ tone }: { tone: "fixed" | "flex" | "swap" | "unknown" }) {
  return <span className={styles.inlineLamp} data-status={tone} aria-hidden="true" />;
}

export function Landing() {
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [stacked, setStacked] = useState(false);
  const [ended, setEnded] = useState(false);

  // Map scroll position inside the story track to a board state.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const stage = stageRef.current;
      const isStacked = Boolean(stage && getComputedStyle(stage).position !== "sticky");
      setStacked(isStacked);
      if (isStacked) {
        // Short screens stack the captions; the one past the upper half is active.
        const captions = captionsRef.current?.querySelectorAll<HTMLElement>("[data-caption]") ?? [];
        let active = 0;
        captions.forEach((caption, index) => {
          if (caption.getBoundingClientRect().top < window.innerHeight * 0.55) active = index;
        });
        setStep(active);
        return;
      }
      const rect = track.getBoundingClientRect();
      setEnded(rect.bottom < window.innerHeight - 1);
      const travel = rect.height - window.innerHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
      setStep(Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length)));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const stage = stageRef.current;
      if (stage && getComputedStyle(stage).position !== "sticky") {
        const caption = captionsRef.current?.querySelectorAll<HTMLElement>("[data-caption]")[index];
        const board = stage.querySelector<HTMLElement>("[data-webgl]");
        if (!caption) return;
        const offset = (board?.offsetHeight ?? 0) + 16;
        const top = caption.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
        return;
      }
      const travel = track.offsetHeight - window.innerHeight;
      const top = track.getBoundingClientRect().top + window.scrollY;
      const target = top + (travel * (index + 0.5)) / STEPS.length;
      window.scrollTo({ top: target, behavior: reducedMotion ? "auto" : "smooth" });
    },
    [reducedMotion],
  );

  const current = STEPS[step];

  return (
    <div className={`eh ${signFont.variable} ${readFont.variable} ${styles.page}`} id="top">
      <HallBackdrop step={step} reducedMotion={reducedMotion} />
      <a className={styles.skip} href="#plan">
        Skip to the trip planner
      </a>

      <header className={styles.signBand}>
        <a className={styles.wordmark} href="#top" aria-label="EventHopper, back to top">
          <span className={styles.wordmarkTile}>
            <Plane />
          </span>
          EventHopper
        </a>
        <nav className={styles.nav} aria-label="Main">
          <button type="button" className={styles.navLink} onClick={() => goToStep(1)}>
            How it works
          </button>
          <a className={styles.navCta} href="#plan">
            Plan a trip
            <ArrowRight className={styles.navArrow} />
          </a>
        </nav>
      </header>

      <main>
        <div
          ref={trackRef}
          className={styles.track}
          style={{ "--steps": STEPS.length } as React.CSSProperties}
        >
          <section
            ref={stageRef}
            className={styles.stage}
            aria-labelledby="hero-title"
            data-step={current.id}
            data-ended={ended || undefined}
          >
            <h1 id="hero-title" className="visually-hidden">
              EventHopper: your event is fixed, your budget is fixed, the route can move.
            </h1>

            <BoardStage state={current.id} reducedMotion={reducedMotion} />

            <div ref={captionsRef} className={styles.captions} data-motion={reducedMotion ? "reduced" : "full"}>
              <article data-caption className={styles.caption} data-active={step === 0 || undefined} aria-hidden={!stacked && step !== 0}>
                <p className={styles.lede}>
                  Plan around the dates you can&rsquo;t move and the money you won&rsquo;t go over.
                </p>
                <div className={styles.actions}>
                  <a className={styles.signButton} href="#plan" tabIndex={stacked || step === 0 ? undefined : -1}>
                    <span className={styles.signArrow}>
                      <ArrowRight />
                    </span>
                    <span>Plan around my event</span>
                  </a>
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => goToStep(1)}
                    tabIndex={stacked || step === 0 ? undefined : -1}
                  >
                    See how it works
                    <ArrowDown className={styles.textButtonIcon} />
                  </button>
                </div>
              </article>

              <article data-caption className={styles.caption} data-active={step === 1 || undefined} aria-hidden={!stacked && step !== 1}>
                <h2 className={styles.captionTitle}>Your trip, on one board.</h2>
                <p className={styles.captionBody}>
                  Take the launch example. You leave Istanbul from 21 October, attend SWITCH in Singapore from
                  27 to 29 October, are home by 1 November and spend no more than 100,000 TRY.
                </p>
                <p className={styles.legend}>
                  <span><Lamp tone="fixed" /> never moves</span>
                  <span><Lamp tone="flex" /> can shift</span>
                  <span><Lamp tone="swap" /> can be swapped</span>
                </p>
              </article>

              <article data-caption className={styles.caption} data-active={step === 2 || undefined} aria-hidden={!stacked && step !== 2}>
                <h2 className={styles.captionTitle}>Swap the stop. Keep the event.</h2>
                <p className={styles.captionBody}>
                  Choose Taipei instead of Bangkok and EventHopper replans the whole trip: route order, travel
                  dates, hotel nights and totals. Singapore on 27–29 October stays exactly where it was.
                </p>
              </article>

              <article data-caption className={styles.caption} data-active={step === 3 || undefined} aria-hidden={!stacked && step !== 3}>
                <h2 className={styles.captionTitle}>Every price says where it came from.</h2>
                <p className={styles.captionBody}>
                  Today every cost is an estimate, and it&rsquo;s labelled as one: flights from a distance-based
                  model, hotels from a nightly rate table, plus food, local transport and a safety margin. Nothing
                  is shown as a live fare.
                </p>
              </article>

              <article data-caption className={styles.caption} data-active={step === 4 || undefined} aria-hidden={!stacked && step !== 4}>
                <h2 className={styles.captionTitle}>We compare. The provider sells.</h2>
                <p className={styles.captionBody}>
                  When a route works for you, book it directly with the airline and the hotel. EventHopper never
                  sells tickets or asks for your card.
                </p>
                <div className={styles.actions}>
                  <a className={styles.signButton} href="#plan" tabIndex={stacked || step === 4 ? undefined : -1}>
                    <span className={styles.signArrow}>
                      <ArrowRight />
                    </span>
                    <span>Plan around my event</span>
                  </a>
                </div>
              </article>
            </div>

            <nav className={styles.steps} aria-label="Story steps">
              {STEPS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.stepButton}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => goToStep(index)}
                >
                  <span className={styles.stepBar} aria-hidden="true" />
                  <span className={styles.stepLabel}>{item.label}</span>
                </button>
              ))}
            </nav>
          </section>
        </div>

        <section id="plan" className={styles.plan} aria-labelledby="plan-title">
          <div className={styles.planHead}>
            <h2 id="plan-title" className={styles.planTitle}>
              Plan around your event
            </h2>
            <p className={styles.planIntro}>
              Start from the SWITCH example or make it yours. Your event dates and budget stay fixed while we
              compare routes around them.
            </p>
          </div>
          <div className={styles.planPanel}>
            <TripForm onPlan={planTrip} />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerMark}>EventHopper</p>
        <div className={styles.footerText}>
          <p>EventHopper compares trips around a fixed event. It doesn&rsquo;t book, sell tickets or take payment details.</p>
          <p>Every price is an estimate, not a live fare. Check the final price with the provider before you pay.</p>
        </div>
      </footer>
    </div>
  );
}
