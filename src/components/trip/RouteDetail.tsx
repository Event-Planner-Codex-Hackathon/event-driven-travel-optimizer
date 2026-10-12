"use client";

import { useId, type Ref } from "react";
import type { RouteOption, TripResponse } from "@/contract/trip";
import { formatDuration, formatMoney, formatWeekday } from "@/lib/format";
import { ArrowDown, Lock, Plane } from "../landing/Icons";
import site from "../site/site.module.css";
import styles from "./trip.module.css";
import {
  MODE_LABEL,
  SOURCE_LABEL,
  STYLE_LABEL,
  absMoney,
  cityPath,
  shortRange,
  stopsLabel,
  timeline,
} from "./tripFormat";

function Estimate() {
  return <span className={site.estimateTag}>estimate</span>;
}

function budgetWord(option: RouteOption): { word: string; tone: "under" | "over" } {
  const remaining = option.costBreakdown.remaining.amountMinor;
  if (remaining < 0) return { word: "Over budget", tone: "over" };
  return { word: remaining === 0 ? "Right at budget" : "Under budget", tone: "under" };
}

type FeaturedProps = {
  option: RouteOption;
  recommended: boolean;
  signedIn: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
};

export function FeaturedRoute({ option, recommended, signedIn, headingRef }: FeaturedProps) {
  const id = useId();
  const { costBreakdown: cost, feasibility } = option;
  const within = feasibility.withinBudget;
  const { word, tone } = budgetWord(option);

  return (
    <section className={styles.featured} aria-labelledby={`${id}-title`}>
      <div className={styles.featuredTop}>
        <span className={site.lamp} data-status={within ? "fixed" : "unknown"} aria-hidden="true" />
        <span className={styles.labelTile} aria-hidden="true">
          {option.label}
        </span>
        <div className={styles.featuredHeading}>
          <h2 id={`${id}-title`} className={styles.featuredTitle} ref={headingRef} tabIndex={-1}>
            Route {option.label}
            {recommended ? <span className={styles.tag}>Recommended</span> : null}
          </h2>
          <p className={styles.featuredPath}>{cityPath(option)}</p>
        </div>
      </div>

      <dl className={styles.moneyGrid}>
        <div className={styles.moneyCell}>
          <dt>Estimated total</dt>
          <dd>
            <span className={styles.moneyValue}>{formatMoney(cost.total)}</span> <Estimate />
          </dd>
        </div>
        <div className={styles.moneyCell}>
          <dt>Your budget</dt>
          <dd>
            <span className={styles.moneyValue}>{formatMoney(cost.budget)}</span>
          </dd>
        </div>
        <div className={styles.moneyCell} data-tone={tone}>
          <dt>{word}</dt>
          <dd>
            <span className={styles.moneyValue}>{formatMoney(absMoney(cost.remaining))}</span> <Estimate />
          </dd>
        </div>
      </dl>

      {option.highlights.length ? (
        <ul className={styles.highlights}>
          {option.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {feasibility.warnings.length ? (
        <ul className={styles.warnings} aria-label="Warnings for this route">
          {feasibility.warnings.map((warning) => (
            <li key={warning}>
              <span className={site.lamp} data-status="unknown" aria-hidden="true" />
              <span>
                <span className={styles.warningWord}>Check: </span>
                {warning}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.featuredFoot}>
        <a className={styles.jumpLink} href="#route-links">
          {signedIn ? "Search links for this route" : "Sign in to see search links for this route"}
          <ArrowDown className={styles.jumpIcon} />
        </a>
      </p>
    </section>
  );
}

export function Itinerary({ option }: { option: RouteOption }) {
  const id = useId();
  const event = option.event;
  const eventDays = shortRange(event.startDate, event.endDate);
  const stopovers = new Set(
    option.citySequence.filter((stop) => stop.purpose === "stopover").map((stop) => stop.city),
  );

  return (
    <section className={styles.itinerary} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`${site.sectionTitle} ${styles.onSky}`}>
        Itinerary
      </h2>
      <ol className={styles.timeline}>
        {timeline(option).map((item, index) => {
          if (item.kind === "leg") {
            const { leg } = item;
            const meta = [MODE_LABEL[leg.mode], formatDuration(leg.durationMinutes), stopsLabel(leg.stops)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={`leg-${index}`} className={styles.item}>
                <span className={styles.itemMark} aria-hidden="true">
                  <Plane className={styles.planeIcon} />
                </span>
                <p className={styles.itemWhen}>
                  <time dateTime={leg.departureDate}>{formatWeekday(leg.departureDate)}</time>
                  {leg.arrivalDate !== leg.departureDate ? (
                    <span className={styles.itemArrive}>
                      arrives <time dateTime={leg.arrivalDate}>{formatWeekday(leg.arrivalDate)}</time>
                    </span>
                  ) : (
                    <span className={styles.itemArrive}>arrives same day</span>
                  )}
                </p>
                <div className={styles.itemMain}>
                  <h3 className={styles.itemTitle}>
                    {leg.fromCity} → {leg.toCity}
                  </h3>
                  <p className={styles.itemMeta}>{meta}</p>
                </div>
                <p className={styles.itemCost}>
                  <span className={styles.itemAmount}>{formatMoney(leg.estimatedCost)}</span>
                  <span className={styles.itemSource}>
                    <Estimate /> {SOURCE_LABEL[leg.estimateSource]}
                  </span>
                </p>
              </li>
            );
          }

          const { stay } = item;
          const isEvent = stay.city === event.city;
          const isStop = !isEvent && stopovers.has(stay.city);
          return (
            <li key={`stay-${index}`} className={styles.item} data-event={isEvent || undefined}>
              <span className={styles.itemMark}>
                <span
                  className={site.lamp}
                  data-status={isEvent ? "fixed" : isStop ? "swap" : undefined}
                  aria-hidden="true"
                />
              </span>
              <p className={styles.itemWhen}>
                <time dateTime={stay.checkIn}>{formatWeekday(stay.checkIn)}</time>
                <span className={styles.itemArrive}>
                  check out <time dateTime={stay.checkOut}>{formatWeekday(stay.checkOut)}</time>
                </span>
              </p>
              <div className={styles.itemMain}>
                <h3 className={styles.itemTitle}>Stay in {stay.city}</h3>
                <p className={styles.itemMeta}>
                  {stay.nights} {stay.nights === 1 ? "night" : "nights"} · {STYLE_LABEL[stay.style]}
                </p>
                {isEvent ? (
                  <p className={styles.itemFixed}>
                    <Lock className={styles.lockIcon} />
                    Event days {eventDays} are fixed
                  </p>
                ) : isStop ? (
                  <p className={styles.itemSwap}>Optional stop · you can swap it</p>
                ) : null}
              </div>
              <p className={styles.itemCost}>
                <span className={styles.itemAmount}>{formatMoney(stay.estimatedCost)}</span>
                <span className={styles.itemSource}>
                  <Estimate /> {SOURCE_LABEL[stay.estimateSource]}
                </span>
              </p>
            </li>
          );
        })}
      </ol>
      <p className={styles.legend}>
        <span>
          <span className={site.lamp} data-status="fixed" aria-hidden="true" /> Fixed event days
        </span>
        {stopovers.size ? (
          <span>
            <span className={site.lamp} data-status="swap" aria-hidden="true" /> Swappable stop
          </span>
        ) : null}
      </p>
    </section>
  );
}

export function CostBreakdown({ trip, option }: { trip: TripResponse; option: RouteOption }) {
  const id = useId();
  const cost = option.costBreakdown;
  const { word, tone } = budgetWord(option);
  const rows: Array<[string, typeof cost.total]> = [
    ["Transport", cost.transport],
    ["Lodging", cost.lodging],
    ["Local transport", cost.localTransport],
    ["Food and activities", cost.foodAndActivities],
    ["Contingency", cost.contingency],
  ];
  const assumptions = [...trip.assumptions, ...option.assumptions];

  return (
    <section className={site.panel} aria-labelledby={`${id}-title`}>
      <div className={site.panelBand}>
        <h2 id={`${id}-title`} className={site.panelBandTitle}>
          Cost breakdown · Route {option.label}
        </h2>
      </div>
      <div className={styles.costBody}>
        <table className={styles.costTable}>
          <caption className={styles.costCaption}>
            All amounts are estimates in {cost.total.currency}, apart from the budget you set.
          </caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, money]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{formatMoney(money)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.costTotal}>
              <th scope="row">Estimated total</th>
              <td>{formatMoney(cost.total)}</td>
            </tr>
            <tr>
              <th scope="row">Your budget</th>
              <td>{formatMoney(cost.budget)}</td>
            </tr>
            <tr className={styles.costRemaining} data-tone={tone}>
              <th scope="row">
                Remaining <span className={styles.costWord}>({word.toLowerCase()})</span>
              </th>
              <td>{formatMoney(cost.remaining)}</td>
            </tr>
          </tfoot>
        </table>

        {assumptions.length ? (
          <div className={styles.assumptions}>
            <h3 className={styles.assumptionsTitle}>How these estimates were made</h3>
            <ul>
              {assumptions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
