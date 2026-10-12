"use client";

import { useCallback, useEffect, useState } from "react";
import { getSession } from "@/contract/client";
import type { SessionResponse } from "@/contract/trip";

/** Server feature flags and anonymous allowances; separate from the device-only profile. */
export function useBackendSession() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    getSession(controller.signal).then((value) => {
      if (!controller.signal.aborted) { setSession(value); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision]);
  return { session, error, refresh };
}
