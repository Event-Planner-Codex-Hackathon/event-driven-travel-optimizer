"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardHandle, BoardRow } from "./board/splitFlapEngine";
import {
  BOARD_READOUT,
  BOARD_ROWS,
  NARROW_COLUMNS,
  WIDE_COLUMNS,
  rowsFor,
  type BoardStateId,
} from "./boardStates";
import { signFont } from "./fonts";
import styles from "./Landing.module.css";

const WIDE_MIN_WIDTH = 720;

export type CustomBoard = { wide: BoardRow[]; narrow: BoardRow[]; readout: string };

type Props = {
  /** A landing story state, or pass `custom` rows instead. */
  state?: BoardStateId;
  custom?: CustomBoard;
  reducedMotion: boolean;
};

export function BoardStage({ state = "intro", custom, reducedMotion }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<BoardHandle | null>(null);
  const pick = (cols: number): BoardRow[] =>
    custom ? (cols >= WIDE_COLUMNS ? custom.wide : custom.narrow) : rowsFor(state, cols);
  const rowsKey = custom ? JSON.stringify(custom) : state;
  const pickRef = useRef(pick);
  const stateRef = useRef(state);
  const [columns, setColumns] = useState(WIDE_COLUMNS);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    stateRef.current = state;
    pickRef.current = pick;
  });

  // Pick the column count from the frame width.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width >= WIDE_MIN_WIDTH ? WIDE_COLUMNS : NARROW_COLUMNS;
      setColumns((current) => (current === next ? current : next));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Build the WebGL board; rebuild when the column count changes.
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let cancelled = false;
    let handle: BoardHandle | null = null;

    import("./board/splitFlapEngine")
      .then(({ createSplitFlapBoard }) =>
        createSplitFlapBoard({
          container: host,
          columns,
          rows: BOARD_ROWS,
          fontFamily: signFont.style.fontFamily,
          fontWeight: 600,
          reducedMotion,
        }),
      )
      .then((created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        handle = created;
        handleRef.current = created;
        setWebglReady(true);
        void created.setRows(pickRef.current(columns), {
          stagger: 700,
          instant: reducedMotion,
        });
      })
      .catch(() => {
        if (!cancelled) setWebglReady(false);
      });

    return () => {
      cancelled = true;
      handle?.dispose();
      handleRef.current = null;
      setWebglReady(false);
    };
  }, [columns, reducedMotion]);

  // Flip to the current story state or custom rows.
  useEffect(() => {
    void handleRef.current?.setRows(pickRef.current(columns), {
      stagger: 450,
      instant: reducedMotion,
    });
  }, [rowsKey, columns, reducedMotion]);

  // Render only while the board is on screen.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) handleRef.current?.resume();
      else handleRef.current?.pause();
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [webglReady]);

  // Subtle parallax from the pointer.
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      handleRef.current?.setPointer(x, y);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  return (
    <div
      ref={frameRef}
      className={styles.boardFrame}
      data-columns={columns}
      data-webgl={webglReady ? "ready" : "pending"}
    >
      <FallbackBoard rows={pick(columns)} columns={columns} />
      <div ref={canvasHostRef} className={styles.boardCanvas} aria-hidden="true" />
      <p className="visually-hidden" aria-live="polite">
        {custom ? custom.readout : BOARD_READOUT[state]}
      </p>
    </div>
  );
}

function FallbackBoard({ rows, columns }: { rows: BoardRow[]; columns: number }) {
  return (
    <div className={styles.fallbackBoard} aria-hidden="true" style={{ "--cols": columns } as React.CSSProperties}>
      {rows.map((row, rowIndex) => {
        const chars = row.text.toUpperCase().padEnd(columns, " ").slice(0, columns).split("");
        return (
          <div className={styles.fallbackRow} key={rowIndex}>
            <div className={styles.fallbackCells}>
              {chars.map((char, index) => (
                <span className={styles.fallbackCell} key={index}>
                  {char === " " ? " " : char}
                </span>
              ))}
            </div>
            <span className={styles.fallbackLamp} data-status={row.status} />
          </div>
        );
      })}
    </div>
  );
}
