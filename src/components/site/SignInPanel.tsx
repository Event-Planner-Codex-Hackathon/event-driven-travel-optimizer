"use client";

import { useId, useState } from "react";
import { signIn, validateSignIn } from "@/lib/session";
import { ArrowRight, Lock } from "../landing/Icons";
import styles from "./site.module.css";

type Props = {
  title: string;
  reason: string;
  onSignedIn?: () => void;
};

// Demo sign-in: keeps a name and email on this device only. No password, no server account.
export function SignInPanel({ title, reason, onSignedIn }: Props) {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateSignIn(name, email);
    setErrors(found);
    if (found.name || found.email) {
      event.currentTarget.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    signIn(name, email);
    onSignedIn?.();
  }

  return (
    <section className={styles.panel} aria-labelledby={`${id}-title`}>
      <div className={styles.panelBand}>
        <h2 id={`${id}-title`} className={styles.panelBandTitle}>
          {title}
        </h2>
        <Lock className={styles.navArrow} />
      </div>
      <form className={styles.panelBody} onSubmit={submit} noValidate>
        <p className={styles.hint} style={{ color: "var(--ink)", fontSize: "var(--step-0)" }}>
          {reason}
        </p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-name`}>
            Your name
          </label>
          <input
            id={`${id}-name`}
            className={styles.input}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          {errors.name ? (
            <p className={styles.error} id={`${id}-name-error`}>
              {errors.name}
            </p>
          ) : null}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-email`}>
            Email
          </label>
          <input
            id={`${id}-email`}
            className={styles.input}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
          />
          {errors.email ? (
            <p className={styles.error} id={`${id}-email-error`}>
              {errors.email}
            </p>
          ) : null}
        </div>
        <div>
          <button type="submit" className={`${styles.signButton} ${styles.signButtonDark}`}>
            <span className={styles.signArrow}>
              <ArrowRight />
            </span>
            <span>Sign in</span>
          </button>
        </div>
        <p className={styles.hint}>
          Preview sign-in: your name and email stay in this browser. There&rsquo;s no password and no account on a server.
        </p>
      </form>
    </section>
  );
}
