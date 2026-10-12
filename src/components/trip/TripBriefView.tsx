"use client";

import type { NormalizedRequest } from "@/contract/trip";
import { useTripBrief } from "@/lib/tripBrief";
import styles from "./experience.module.css";

export function TripBriefView({ requestId, request }: { requestId: string; request: NormalizedRequest }) {
  const brief = useTripBrief(requestId);
  // Quote explicit preference paragraphs verbatim; do not infer genres or matches from keywords.
  const paragraphs = brief?.description.split(/\n\s*\n/).filter((text) => /^(I like\b|On holiday I want\b|My interests:)/i.test(text.trim())) ?? [];
  const pace = request.preferences.preferredPace;

  return (
    <section className={styles.brief} aria-label="Your travel preferences">
      <div className={styles.briefHeading}>
        <h2>Your travel preferences</h2>
        <span className={styles.badge}>Your brief</span>
      </div>
      <ul className={styles.preferenceTags}>
        {request.preferences.lodgingStyle ? <li>{request.preferences.lodgingStyle} hotels</li> : null}
        {pace ? <li>{pace} pace</li> : null}
        <li>Event dates fixed</li>
      </ul>
      {brief?.interests ? <p className={styles.briefQuote}>{brief.interests}</p> : paragraphs.map((text, i) => <p key={i} className={styles.briefQuote}>{text}</p>)}
      {brief?.description ? (
        <details className={styles.briefDetails}>
          <summary>Read your original description</summary>
          <p>{brief.description}</p>
        </details>
      ) : null}
      <p className={styles.briefNote}>
        {brief?.description || brief?.interests
          ? "Your interests are kept with this trip when you change the stop. Personalized event matching is awaiting integration."
          : "Music and activity interests were not saved with this trip. Add them in a new trip description."}
      </p>
    </section>
  );
}
