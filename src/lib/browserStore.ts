"use client";

import { useSyncExternalStore } from "react";

// Small typed wrapper over localStorage that React components can subscribe to.
// Everything here lives in this browser only; nothing is sent to a server.

const CHANGE_EVENT = "eh-store-change";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return read(key, fallback);
}

export function writeStore<T>(key: string, value: T | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked; the page keeps working without it.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

// Raw string snapshots keep useSyncExternalStore stable between renders.
function rawSnapshot(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Subscribe to a stored JSON value. Returns `fallback` on the server and before hydration. */
export function useStoredValue<T>(key: string, fallback: T): T {
  const raw = useSyncExternalStore(
    subscribe,
    () => rawSnapshot(key),
    () => null,
  );
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** True once the component is running in the browser (stored values are real). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
