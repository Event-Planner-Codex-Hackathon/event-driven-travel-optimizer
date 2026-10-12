"use client";

import Link from "next/link";
import { useId } from "react";
import type { RouteOption } from "@/contract/trip";
import { formatMoney } from "@/lib/format";
import { ArrowRight } from "../landing/Icons";
import { routeDates } from "./poster";
import { absMoney, cityPath, shortRange } from "./tripFormat";
import styles from "./experience.module.css";

type Props = { requestId: string; options: RouteOption[]; selectedId: string; recommendedId: string | null; preview?: boolean };

export function OtherOptions({ requestId, options, selectedId, recommendedId, preview = false }: Props) {
  const id = useId();
  if (!options.length) return null;
  return (
    <section className={styles.comparison} aria-labelledby={`${id}-title`}>
      <div className={styles.comparisonHeading}>
        <h2 id={`${id}-title`}>Compare your routes</h2>
        <p>{options.length} options returned · all totals are estimates</p>
      </div>
      <ul className={styles.comparisonGrid}>
        {options.map((option) => {
          const selected = option.id === selectedId;
          const dates = routeDates(option);
          const nights = option.stays.reduce((total, stay) => total + stay.nights, 0);
          const remaining = option.costBreakdown.remaining;
          const tradeoffs = option.highlights.filter((line) => !line.startsWith(`${option.event.name} locked:`) && !line.startsWith("Within your ")).slice(0, 2);
          const difference = remaining.amountMinor === 0 ? "at your budget" : `${formatMoney(absMoney(remaining))} ${remaining.amountMinor < 0 ? "over" : "below"} your budget`;
          return (
            <li key={option.id} className={styles.comparisonCard} data-selected={selected || undefined}>
              <div className={styles.cardTop}>
                <span className={styles.routeLabel}>Route {option.label}</span>
                {option.id === recommendedId ? <span className={styles.recommended}>Recommended</span> : null}
                {selected ? <span className={styles.badge}>Selected</span> : null}
              </div>
              <h3>{option.title}</h3>
              <p className={styles.cardPath}>{cityPath(option)}</p>
              <dl className={styles.cardSchedule}>
                <div><dt>Travel</dt><dd>{shortRange(dates.start, dates.end)}</dd></div>
                <div><dt>Hotel stays</dt><dd>{nights} {nights === 1 ? "night" : "nights"}</dd></div>
              </dl>
              <p className={styles.cardPrice}>{formatMoney(option.costBreakdown.total)} <small>estimated</small></p>
              <p className={styles.cardBudget}>Estimated {difference}</p>
              {!option.feasibility.hardConstraintsSatisfied ? <p className={styles.cardWarning}>Schedule needs attention</p> : <p className={styles.cardBudget}>Event dates protected</p>}
              {tradeoffs.length ? tradeoffs.map((line) => <p key={line} className={styles.cardSummary}>{line}</p>) : option.summary ? <p className={styles.cardSummary}>{option.summary}</p> : null}
              <Link className={styles.cardLink} href={`/trips/${encodeURIComponent(requestId)}?option=${encodeURIComponent(option.id)}${preview ? "&preview=synthetic" : ""}`} replace scroll={false} aria-current={selected ? "true" : undefined}>
                {selected ? "Viewing this route" : "Explore this route"}
                <span className="visually-hidden"> ({option.title})</span>
                <ArrowRight />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
