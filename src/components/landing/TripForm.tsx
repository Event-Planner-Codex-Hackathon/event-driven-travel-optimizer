"use client";

import { useId, useState } from "react";
import { ArrowRight, Lock } from "./Icons";
import styles from "./Landing.module.css";

export type OptionalStop = "none" | "bangkok" | "taipei";

export type TripDraft = {
  event: { name: string; city: string; startDate: string; endDate: string; sourceUrl: string };
  origin: string;
  departFrom: string;
  returnBy: string;
  budgetTry: number;
  optionalStop: OptionalStop;
};

export const SWITCH_EXAMPLE: TripDraft = {
  event: {
    name: "SWITCH 2026",
    city: "Singapore",
    startDate: "2026-10-27",
    endDate: "2026-10-29",
    sourceUrl: "https://www.switchsg.org/",
  },
  origin: "Istanbul",
  departFrom: "2026-10-21",
  returnBy: "2026-11-01",
  budgetTry: 100000,
  optionalStop: "bangkok",
};

type Errors = Partial<Record<"eventDates" | "departure" | "returnBy" | "budget", string>>;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const fullFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const tryFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

function toUtc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function eventRange(start: string, end: string) {
  const s = toUtc(start);
  const e = toUtc(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "Dates not set";
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()}–${fullFormat.format(e)}`;
  }
  return `${dayFormat.format(s)} – ${fullFormat.format(e)}`;
}

function validate(draft: TripDraft): Errors {
  const errors: Errors = {};
  const { startDate, endDate } = draft.event;
  if (!startDate || !endDate || endDate < startDate) {
    errors.eventDates = "The event has to end on or after the day it starts.";
  }
  if (!draft.departFrom) {
    errors.departure = "Choose the earliest day you can leave Istanbul.";
  } else if (startDate && draft.departFrom >= startDate) {
    errors.departure = `You need to leave before the event starts on ${dayFormat.format(
      toUtc(startDate),
    )}. Pick an earlier date.`;
  }
  if (!draft.returnBy) {
    errors.returnBy = "Choose the latest day you can be back in Istanbul.";
  } else if (endDate && draft.returnBy <= endDate) {
    errors.returnBy = `You need to be back after the event ends on ${dayFormat.format(
      toUtc(endDate),
    )}. Pick a later date.`;
  }
  if (!Number.isFinite(draft.budgetTry) || draft.budgetTry <= 0) {
    errors.budget = "Enter your total budget in Turkish lira, above zero.";
  }
  return errors;
}

type Props = {
  onPlan: (draft: TripDraft) => Promise<string> | string;
};

export function TripForm({ onPlan }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<TripDraft>(SWITCH_EXAMPLE);
  const [budgetText, setBudgetText] = useState(tryFormat.format(SWITCH_EXAMPLE.budgetTry));
  const [editingEvent, setEditingEvent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ tone: "idle" | "busy" | "done"; text: string }>({
    tone: "idle",
    text: "",
  });

  const update = (patch: Partial<TripDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateEvent = (patch: Partial<TripDraft["event"]>) =>
    setDraft((current) => ({ ...current, event: { ...current.event, ...patch } }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = event.currentTarget.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      setStatus({ tone: "idle", text: "" });
      return;
    }
    setStatus({ tone: "busy", text: "Checking your trip…" });
    const message = await onPlan(draft);
    setStatus({ tone: "done", text: message });
  }

  const fieldId = (name: string) => `${id}-${name}`;
  const errorId = (name: keyof Errors) => (errors[name] ? `${id}-${name}-error` : undefined);

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby="plan-title">
      <div className={styles.eventRow} data-editing={editingEvent || undefined}>
        <span className={styles.eventLamp} aria-hidden="true" />
        <div className={styles.eventText}>
          <p className={styles.eventName}>{draft.event.name}</p>
          <p className={styles.eventMeta}>
            {draft.event.city} · {eventRange(draft.event.startDate, draft.event.endDate)}
          </p>
        </div>
        <p className={styles.eventFixed}>
          <Lock className={styles.eventLock} />
          Fixed
        </p>
        <button
          type="button"
          className={styles.eventEdit}
          aria-expanded={editingEvent}
          aria-controls={fieldId("event-dates")}
          onClick={() => setEditingEvent((value) => !value)}
        >
          {editingEvent ? "Keep these dates" : "Edit event"}
        </button>
      </div>

      {editingEvent ? (
        <fieldset className={styles.eventEditor} id={fieldId("event-dates")}>
          <legend className={styles.label}>Event dates</legend>
          <p className={styles.hint}>
            These dates are protected in every route we compare. Check them on the{" "}
            <a href={draft.event.sourceUrl} target="_blank" rel="noreferrer">
              official event site
            </a>
            .
          </p>
          <div className={styles.pair}>
            <label className={styles.field}>
              <span className={styles.label}>First day</span>
              <input
                className={styles.input}
                type="date"
                value={draft.event.startDate}
                onChange={(e) => updateEvent({ startDate: e.target.value })}
                aria-invalid={errors.eventDates ? true : undefined}
                aria-describedby={errorId("eventDates")}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Last day</span>
              <input
                className={styles.input}
                type="date"
                value={draft.event.endDate}
                onChange={(e) => updateEvent({ endDate: e.target.value })}
                aria-invalid={errors.eventDates ? true : undefined}
                aria-describedby={errorId("eventDates")}
              />
            </label>
          </div>
          {errors.eventDates ? (
            <p className={styles.error} id={errorId("eventDates")}>
              {errors.eventDates}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className={styles.fields}>
        <div className={styles.field}>
          <span className={styles.label}>From</span>
          <p className={styles.staticValue}>
            Istanbul <span className={styles.staticNote}>IST · the only origin for now</span>
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId("depart")}>
            Leave Istanbul from
          </label>
          <input
            id={fieldId("depart")}
            className={styles.input}
            type="date"
            value={draft.departFrom}
            onChange={(e) => update({ departFrom: e.target.value })}
            aria-invalid={errors.departure ? true : undefined}
            aria-describedby={errorId("departure")}
          />
          {errors.departure ? (
            <p className={styles.error} id={errorId("departure")}>
              {errors.departure}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId("return")}>
            Back in Istanbul by
          </label>
          <input
            id={fieldId("return")}
            className={styles.input}
            type="date"
            value={draft.returnBy}
            onChange={(e) => update({ returnBy: e.target.value })}
            aria-invalid={errors.returnBy ? true : undefined}
            aria-describedby={errorId("returnBy")}
          />
          {errors.returnBy ? (
            <p className={styles.error} id={errorId("returnBy")}>
              {errors.returnBy}
            </p>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId("budget")}>
            Total budget
          </label>
          <span className={styles.money}>
            <input
              id={fieldId("budget")}
              className={`${styles.input} ${styles.moneyInput}`}
              inputMode="numeric"
              autoComplete="off"
              value={budgetText}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setBudgetText(digits);
                update({ budgetTry: digits ? Number(digits) : Number.NaN });
              }}
              onBlur={() => {
                if (Number.isFinite(draft.budgetTry)) setBudgetText(tryFormat.format(draft.budgetTry));
              }}
              onFocus={() => setBudgetText(Number.isFinite(draft.budgetTry) ? String(draft.budgetTry) : "")}
              aria-invalid={errors.budget ? true : undefined}
              aria-describedby={[fieldId("budget-note"), errorId("budget")].filter(Boolean).join(" ")}
            />
            <span className={styles.moneyUnit}>TRY</span>
          </span>
          <p className={styles.hint} id={fieldId("budget-note")}>
            Every route is checked against it. Anything over budget is clearly marked.
          </p>
          {errors.budget ? (
            <p className={styles.error} id={errorId("budget")}>
              {errors.budget}
            </p>
          ) : null}
        </div>

        <fieldset className={`${styles.fieldGroup} ${styles.stopGroup}`}>
          <legend className={styles.label}>Optional stop on the way</legend>
          <div className={styles.stops}>
            {(
              [
                ["none", "No stop"],
                ["bangkok", "Bangkok"],
                ["taipei", "Taipei"],
              ] as const
            ).map(([value, label]) => (
              <label className={styles.stop} key={value}>
                <input
                  type="radio"
                  name={fieldId("stop")}
                  value={value}
                  checked={draft.optionalStop === value}
                  onChange={() => update({ optionalStop: value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className={styles.submitRow}>
        <p className={styles.assumptions}>Planned for 1 adult, 1 room, economy class.</p>
        <button className={`${styles.signButton} ${styles.signButtonDark}`} type="submit" disabled={status.tone === "busy"}>
          <span className={styles.signArrow}>
            <ArrowRight />
          </span>
          <span>{status.tone === "busy" ? "Checking…" : "Find routes"}</span>
        </button>
      </div>
      <p className={styles.status} role="status" aria-live="polite" data-tone={status.tone}>
        {status.text}
      </p>
    </form>
  );
}
