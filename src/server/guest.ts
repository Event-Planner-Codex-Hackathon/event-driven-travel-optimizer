/**
 * Guest access: no accounts. Every visitor gets an anonymous, random guest id
 * in an httpOnly cookie, used for per-guest limits on paid/quota-bound actions
 * (live prices, banners). A cookie can be dropped to get a fresh id, so the
 * same actions are also limited per client IP, and process-wide caps apply on
 * top. All of this lives in process memory: with several server instances the
 * caps are per instance (see docs/backend.md).
 */
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

export const GUEST_COOKIE = "eh_guest";
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export type GuestAction = "priceCheck" | "quote" | "hero";

export const GUEST_LIMITS: Record<GuestAction, { max: number; windowMinutes: number }> = {
  priceCheck: { max: 5, windowMinutes: 60 },
  quote: { max: 10, windowMinutes: 60 },
  hero: { max: 3, windowMinutes: 60 },
};

/** Per-IP allowance = this many guests' worth, to tolerate shared networks. */
const IP_MULTIPLIER = 3;

export type Guest = { id: string; isNew: boolean; ip?: string };

type UsageEntry = { at: number; token: string };
type State = { usage: Map<string, UsageEntry[]>; nextToken: number };
const g = globalThis as typeof globalThis & { __eventhopperGuests?: State };
const state: State = (g.__eventhopperGuests ??= { usage: new Map(), nextToken: 0 });

const ID_RE = /^g_[a-f0-9]{24}$/;

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) {
      try {
        return decodeURIComponent(part.slice(i + 1));
      } catch {
        return undefined; // malformed cookie: treat as a new guest
      }
    }
  }
  return undefined;
}

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : undefined;
}

export function guestFromRequest(req: Request): Guest {
  const ip = clientIp(req);
  const existing = readCookie(req, GUEST_COOKIE);
  if (existing && ID_RE.test(existing)) return { id: existing, isNew: false, ip };
  return { id: `g_${randomUUID().replace(/-/g, "").slice(0, 24)}`, isNew: true, ip };
}

export function attachGuestCookie<T extends NextResponse>(res: T, guest: Guest): T {
  if (guest.isNew) {
    res.cookies.set(GUEST_COOKIE, guest.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_S,
    });
  }
  return res;
}

function recent(subject: string, action: GuestAction, now: number): UsageEntry[] {
  const key = `${subject}|${action}`;
  const windowMs = GUEST_LIMITS[action].windowMinutes * 60_000;
  const entries = (state.usage.get(key) ?? []).filter((entry) => now - entry.at < windowMs);
  if (entries.length) state.usage.set(key, entries);
  else state.usage.delete(key); // do not retain empty keys after refunds/expiry
  return entries;
}

type Subject = string | Pick<Guest, "id" | "ip">;
const subjects = (s: Subject) => (typeof s === "string" ? [{ key: s, max: 1 }] : [{ key: s.id, max: 1 }, ...(s.ip ? [{ key: `ip:${s.ip}`, max: IP_MULTIPLIER }] : [])]);

export function remaining(guest: Subject, action: GuestAction, now = Date.now()): number {
  const { max } = GUEST_LIMITS[action];
  return Math.max(0, Math.min(...subjects(guest).map((s) => max * s.max - recent(s.key, action, now).length)));
}

/** Record one use if both the guest id and its IP have allowance left. */
export function consume(guest: Subject, action: GuestAction, now = Date.now()): { ok: true; reservation: string } | { ok: false; retryAfterSeconds: number } {
  const { max, windowMinutes } = GUEST_LIMITS[action];
  const lists = subjects(guest).map((s) => ({ key: `${s.key}|${action}`, times: recent(s.key, action, now), limit: max * s.max }));
  const blocked = lists.find((l) => l.times.length >= l.limit);
  if (blocked) {
    const retryAfterSeconds = Math.max(1, Math.ceil((blocked.times[0].at + windowMinutes * 60_000 - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  const reservation = `${now}:${++state.nextToken}`;
  for (const l of lists) {
    l.times.push({ at: now, token: reservation });
    state.usage.set(l.key, l.times);
  }
  return { ok: true, reservation };
}

/** Give back a use when the action did not spend provider quota (cache hit, not configured, failure). */
export function refund(guest: Subject, action: GuestAction, reservation: string): void {
  for (const s of subjects(guest)) {
    const key = `${s.key}|${action}`;
    const entries = state.usage.get(key);
    if (!entries) continue;
    const index = entries.findIndex((entry) => entry.token === reservation);
    if (index >= 0) entries.splice(index, 1);
    if (entries.length === 0) state.usage.delete(key);
  }
}

/** Test helper. */
export function resetGuestState(): void {
  state.usage.clear();
}
