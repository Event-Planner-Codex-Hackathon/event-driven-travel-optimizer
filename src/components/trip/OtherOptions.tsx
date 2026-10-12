"use client";

import Link from "next/link";
import { useId } from "react";
import type { RouteOption } from "@/contract/trip";
import { formatMoney } from "@/lib/format";
import { ArrowRight } from "../landing/Icons";
import site from "../site/site.module.css";
import styles from "./trip.module.css";
import { absMoney, cityPath } from "./tripFormat";

type Props = { requestId: string; options: RouteOption[]; recommendedId: string | null };

export function OtherOptions({ requestId, options, recommendedId }: Props) {
  const id = useId();
  if (options.length === 0) return null;

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={`${site.sectionTitle} ${styles.onSky} ${styles.asideTitle}`}>
        Other routes
      </h2>
      <ul className={site.boardRows}>
        {options.map((option) => {
          const within = option.feasibility.withinBudget;
          const remaining = option.costBreakdown.remaining;
          const diff = remaining.amountMinor < 0 ? "over budget" : "under budget";
          return (
            <li key={option.id} className={styles.otherRow} data-within={within || undefined}>
              <span className={site.lamp} data-status={within ? "fixed" : "unknown"} aria-hidden="true" />
              <span className={styles.labelTileSmall} aria-hidden="true">
                {option.label}
              </span>
              <div className={styles.otherMain}>
                <h3 className={styles.otherTitle}>
                  <span className="visually-hidden">Route {option.label}: </span>
                  {option.title}
                  {option.id === recommendedId ? <span className={styles.tag}>Recommended</span> : null}
                </h3>
                <p className={styles.otherPath}>{cityPath(option)}</p>
                {option.summary ? <p className={styles.otherSummary}>{option.summary}</p> : null}
                <p className={styles.otherMoney}>
                  <span className={styles.otherTotal}>{formatMoney(option.costBreakdown.total)}</span>{" "}
                  <span className={site.estimateTag}>estimate</span>
                  <span className={styles.otherDiff}>
                    Estimated {formatMoney(absMoney(remaining))} {diff}
                  </span>
                </p>
                <Link
                  className={styles.showLink}
                  href={`/trips/${encodeURIComponent(requestId)}?option=${encodeURIComponent(option.id)}`}
                  replace
                  scroll={false}
                >
                  Show this route
                  <span className="visually-hidden"> ({option.title})</span>
                  <ArrowRight className={styles.showIcon} />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
