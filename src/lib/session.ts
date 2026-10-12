"use client";

import { useStoredValue, writeStore } from "./browserStore";

// Demo sign-in for the prototype. It keeps a name and email in this browser
// only: no password, no server account. Replace with real auth later.

export type DemoUser = { name: string; email: string; signedInAt: string };

const KEY = "eh:session";

export function useSession(): DemoUser | null {
  return useStoredValue<DemoUser | null>(KEY, null);
}

export function signIn(name: string, email: string): DemoUser {
  const user: DemoUser = { name: name.trim(), email: email.trim().toLowerCase(), signedInAt: new Date().toISOString() };
  writeStore(KEY, user);
  return user;
}

export function signOut(): void {
  writeStore(KEY, null);
}

export function validateSignIn(name: string, email: string): { name?: string; email?: string } {
  const errors: { name?: string; email?: string } = {};
  if (name.trim().length < 2) errors.name = "Enter your name, at least two letters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter an email address like name@example.com.";
  return errors;
}
