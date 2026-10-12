"use client";

import "../landing/landing.css";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { HallBackdrop } from "../landing/HallBackdrop";
import { readFont, signFont } from "../landing/fonts";
import { ArrowRight } from "../landing/Icons";
import { signOut, useSession } from "@/lib/session";
import { PookieMark } from "./PookieMark";
import styles from "./site.module.css";

const motionQuery = "(prefers-reduced-motion: reduce)";

function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

type Props = {
  children: React.ReactNode;
  /** Sky palette index 0–4 (same order as the landing story steps). */
  sky?: number;
  current?: "plan" | "trips";
};

export function SiteShell({ children, sky = 1, current }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div className={`eh ${signFont.variable} ${readFont.variable} ${styles.page}`}>
      <a className={styles.skip} href="#content">
        Skip to content
      </a>
      <HallBackdrop step={sky} reducedMotion={reducedMotion} />
      <SiteHeader current={current} />
      <main id="content">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function SiteHeader({ current }: { current?: "plan" | "trips" }) {
  const user = useSession();
  return (
    <header className={styles.signBand}>
      <Link className={styles.wordmark} href="/" aria-label="Pookie home">
        <span className={styles.wordmarkTile}>
          <PookieMark />
        </span>
        <span className={styles.wordmarkText}>Pookie</span>
      </Link>
      <nav className={styles.nav} aria-label="Main">
        <Link className={styles.navLink} href="/trips" aria-current={current === "trips" ? "page" : undefined}>
          My trips
        </Link>
        {user ? (
          <span className={`${styles.navUser} ${styles.navHideSmall}`}>
            {user.name}
            <button type="button" className={styles.navLink} onClick={signOut}>
              Sign out
            </button>
          </span>
        ) : null}
        <Link className={styles.navCta} href="/#plan" aria-current={current === "plan" ? "page" : undefined}>
          Plan a trip
          <ArrowRight className={styles.navArrow} />
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerMark}>Pookie</p>
      <div className={styles.footerText}>
        <p>Pookie compares trips around a fixed event. It doesn&rsquo;t book, sell tickets or take payment details.</p>
        <p>Every price is an estimate, not a live fare. Check the final price with the provider before you pay.</p>
      </div>
    </footer>
  );
}
