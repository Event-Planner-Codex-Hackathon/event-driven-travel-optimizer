"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import type { OptimizeBody } from "@/contract/trip";
import { DEMO_REQUESTS } from "@/contract/demo";
import { formatRange } from "@/lib/format";
import { setPendingSearch, takePendingSearch } from "@/lib/trips";
import site from "../site/site.module.css";
import { ArrowDown, ArrowRight, Check, Lock } from "./Icons";
import styles from "./Landing.module.css";
import {
  LODGING,
  MAX_PLACES,
  ORIGINS,
  PLACES,
  SWITCH_EXAMPLE,
  TEXT_LABEL,
  TEXT_MAX,
  draftLabel,
  draftToBody,
  isDate,
  shiftDay,
  textToBody,
  wholeNumber,
  validateDraft,
  validateText,
  type DraftErrors,
  type Origin,
  type Place,
  type TripDraft,
} from "./planTrip";

type Mode = "form" | "text";

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: "form", label: "Fill in the form" },
  { id: "text", label: "Describe your trip" },
];

type Start = (body: OptimizeBody, label: string) => void;

export function TripForm() {
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("form");
  const [restoredText, setRestoredText] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Coming back after the planner asked for more detail: reopen the description that was sent.
  useEffect(() => {
    const text = takePendingSearch()?.body.text;
    if (text) {
      setMode("text");
      setRestoredText(text);
    }
  }, []);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const start: Start = (body, label) => {
    setPendingSearch({ body, label, createdAt: new Date().toISOString() });
    startTransition(() => router.push("/plan/searching"));
  };

  const tabId = (mode: Mode) => `${id}-tab-${mode}`;
  const panelId = (mode: Mode) => `${id}-panel-${mode}`;

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = MODES.findIndex((m) => m.id === mode);
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % MODES.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + MODES.length) % MODES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MODES.length - 1;
    else return;
    event.preventDefault();
    setMode(MODES[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={styles.planner}>
      <div className={styles.modeBar}>
        <div role="tablist" aria-label="How would you like to start?" className={styles.modeTabs} onKeyDown={onTabKey}>
          {MODES.map((item, index) => {
            const selected = item.id === mode;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={tabId(item.id)}
                aria-selected={selected}
                aria-controls={panelId(item.id)}
                tabIndex={selected ? 0 : -1}
                className={styles.modeTab}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" id={panelId("form")} aria-labelledby={tabId("form")} hidden={mode !== "form"}>
        <StandardForm labelledBy={tabId("form")} busy={busy} onStart={start} />
      </div>
      <div role="tabpanel" id={panelId("text")} aria-labelledby={tabId("text")} hidden={mode !== "text"}>
        <DescribeForm
          key={restoredText ?? "fresh"}
          labelledBy={tabId("text")}
          busy={busy}
          onStart={start}
          initialText={restoredText ?? ""}
        />
      </div>
    </div>
  );
}

type FormProps = { labelledBy: string; busy: boolean; onStart: Start };

function SubmitRow({ busy }: { busy: boolean }) {
  return (
    <div className={styles.submitRow}>
      <p className={styles.assumptions}>Planned for 1 adult, 1 room, economy class.</p>
      <button className={`${styles.signButton} ${styles.signButtonDark}`} type="submit" disabled={busy}>
        <span className={styles.signArrow}>
          <ArrowRight />
        </span>
        <span>{busy ? "Starting search…" : "Find routes"}</span>
      </button>
    </div>
  );
}

function eventDates(start: string, end: string) {
  return isDate(start) && isDate(end) && end >= start ? formatRange(start, end) : "Dates not set";
}

function StandardForm({ labelledBy, busy, onStart }: FormProps) {
  const id = useId();
  const [draft, setDraft] = useState<TripDraft>(SWITCH_EXAMPLE);
  const [budgetText, setBudgetText] = useState(wholeNumber.format(SWITCH_EXAMPLE.budgetTry));
  const [editingEvent, setEditingEvent] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});

  const update = (patch: Partial<TripDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateEvent = (patch: Partial<TripDraft["event"]>) =>
    setDraft((current) => ({ ...current, event: { ...current.event, ...patch } }));

  const atLimit = draft.places.length >= MAX_PLACES;
  const togglePlace = (place: Place) =>
    setDraft((current) => {
      if (current.places.includes(place)) return { ...current, places: current.places.filter((p) => p !== place) };
      if (current.places.length >= MAX_PLACES) return current;
      return { ...current, places: [...current.places, place] };
    });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validateDraft(draft);
    flushSync(() => {
      setErrors(found);
      if (found.eventDates) setEditingEvent(true);
    });
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    onStart(draftToBody(draft), draftLabel(draft));
  }

  const fieldId = (name: string) => `${id}-${name}`;
  const errorId = (name: keyof DraftErrors) => (errors[name] ? `${id}-${name}-error` : undefined);
  const { startDate, endDate } = draft.event;
  const eventOk = isDate(startDate) && isDate(endDate) && endDate >= startDate;

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={labelledBy}>
      <div className={styles.eventRow}>
        <span className={styles.eventLamp} aria-hidden="true" />
        <div className={styles.eventText}>
          <p className={styles.eventName}>{draft.event.name}</p>
          <p className={styles.eventMeta}>
            {draft.event.city} · {eventDates(startDate, endDate)}
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
                value={startDate}
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
                value={endDate}
                min={isDate(startDate) ? startDate : undefined}
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
          <label className={styles.label} htmlFor={fieldId("origin")}>
            From
          </label>
          <span className={styles.selectWrap}>
            <select
              id={fieldId("origin")}
              className={`${styles.input} ${styles.select}`}
              value={draft.origin}
              onChange={(e) => update({ origin: e.target.value as Origin })}
            >
              {ORIGINS.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <ArrowDown className={styles.selectIcon} />
          </span>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={fieldId("depart")}>
            Leave {draft.origin} from
          </label>
          <input
            id={fieldId("depart")}
            className={styles.input}
            type="date"
            value={draft.departFrom}
            max={eventOk ? shiftDay(startDate, -1) : undefined}
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
            Back home by
          </label>
          <input
            id={fieldId("return")}
            className={styles.input}
            type="date"
            value={draft.returnBy}
            min={eventOk ? shiftDay(endDate, 1) : undefined}
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
                const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 12);
                setBudgetText(digits);
                update({ budgetTry: digits ? Number(digits) : Number.NaN });
              }}
              onBlur={() => {
                if (Number.isFinite(draft.budgetTry)) setBudgetText(wholeNumber.format(draft.budgetTry));
              }}
              onFocus={() => setBudgetText(Number.isFinite(draft.budgetTry) ? String(draft.budgetTry) : "")}
              aria-invalid={errors.budget ? true : undefined}
              aria-describedby={[fieldId("budget-note"), errorId("budget")].filter(Boolean).join(" ")}
            />
            <span className={styles.moneyUnit} aria-hidden="true">
              TRY
            </span>
          </span>
          <p className={styles.hint} id={fieldId("budget-note")}>
            In Turkish lira. Every route is checked against it, and anything over budget is clearly marked.
          </p>
          {errors.budget ? (
            <p className={styles.error} id={errorId("budget")}>
              {errors.budget}
            </p>
          ) : null}
        </div>

        <fieldset className={`${styles.fieldGroup} ${styles.wide}`} aria-describedby={fieldId("places-note")}>
          <legend className={styles.label}>Places you&rsquo;d like to add</legend>
          <p className={styles.hint} id={fieldId("places-note")} aria-live="polite">
            {atLimit
              ? `You've chosen ${MAX_PLACES}, the most we compare. Remove one to choose another.`
              : `Optional. Choose up to ${MAX_PLACES} places to consider around the event.`}
          </p>
          <div className={styles.chips}>
            {PLACES.map((place) => {
              const checked = draft.places.includes(place);
              const blocked = !checked && atLimit;
              return (
                <label className={styles.chip} key={place} data-blocked={blocked || undefined}>
                  <input
                    type="checkbox"
                    name={fieldId("places")}
                    value={place}
                    checked={checked}
                    aria-disabled={blocked || undefined}
                    aria-describedby={blocked ? fieldId("places-note") : undefined}
                    onChange={() => togglePlace(place)}
                  />
                  <span>
                    <span className={styles.chipBox} aria-hidden="true">
                      {checked ? <Check /> : null}
                    </span>
                    {place}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className={`${styles.fieldGroup} ${styles.wide}`}>
          <legend className={styles.label}>Hotel style</legend>
          <div className={styles.chips}>
            {LODGING.map(({ value, label }) => (
              <label className={styles.chip} key={value}>
                <input
                  type="radio"
                  name={fieldId("lodging")}
                  value={value}
                  checked={draft.lodging === value}
                  onChange={() => update({ lodging: value })}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <SubmitRow busy={busy} />
    </form>
  );
}

function DescribeForm({ labelledBy, busy, onStart, initialText = "" }: FormProps & { initialText?: string }) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const over = text.length > TEXT_MAX;

  function fillExample() {
    const example = DEMO_REQUESTS[0].text;
    setText(example);
    setError(null);
    const area = areaRef.current;
    if (!area) return;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(example.length, example.length);
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateText(text);
    setError(found);
    if (found) {
      areaRef.current?.focus();
      return;
    }
    onStart(textToBody(text), TEXT_LABEL);
  }

  const areaId = `${id}-text`;
  const helpId = `${id}-help`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-labelledby={labelledBy}>
      <div className={styles.describe}>
        <div className={styles.describeHead}>
          <label className={styles.label} htmlFor={areaId}>
            Describe your trip
          </label>
          <button type="button" className={`${site.textButton} ${styles.exampleButton}`} onClick={fillExample}>
            Use the SWITCH example
          </button>
        </div>
        <div className={styles.describeHelp} id={helpId}>
          <p>Write it the way you&rsquo;d tell a friend. Include:</p>
          <ul>
            <li>where you leave from</li>
            <li>the event, its city and its dates</li>
            <li>your total budget in TRY</li>
            <li>places you&rsquo;d like to add, if any</li>
          </ul>
          <p>Leave out personal details such as passport or card numbers.</p>
        </div>
        <textarea
          ref={areaRef}
          id={areaId}
          className={`${styles.input} ${styles.textarea}`}
          rows={7}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={[helpId, countId, error ? errorId : null].filter(Boolean).join(" ")}
        />
        <div className={styles.textMeta}>
          {error ? (
            <p className={styles.error} id={errorId}>
              {error}
            </p>
          ) : null}
          <p className={styles.counter} id={countId} data-over={over || undefined}>
            {wholeNumber.format(text.length)} / {wholeNumber.format(TEXT_MAX)} characters
          </p>
        </div>
      </div>

      <SubmitRow busy={busy} />
    </form>
  );
}
