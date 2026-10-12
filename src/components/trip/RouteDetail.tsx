"use client";

import { useId, type Ref } from "react";
import type { RouteOption, TripResponse } from "@/contract/trip";
import { formatMoney } from "@/lib/format";
import { ArrowDown } from "../landing/Icons";
import site from "../site/site.module.css";
import styles from "./trip.module.css";
import { absMoney, cityPath } from "./tripFormat";

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
            Amounts in {cost.total.currency}. Flight and hotel observations are labelled per line in the day plan. Allowances remain estimates; ticket costs may be unknown.
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
        {option.convertedTotals?.length && trip.fx ? <p className={styles.costCaption}>Reference equivalents: {option.convertedTotals.map(formatMoney).join(" · ")}. {trip.fx.note}</p> : null}

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
