"use client";
import { useSyncExternalStore } from "react";

/**
 * Session state for static marketing pages. Pages stay cacheable: the HTML is always the signed-out version and this
 * hook swaps labels after hydration (only text and href change, so nothing moves).
 *
 * It does not import the better-auth client: that client and its passkey, two factor and organization plugins cost
 * the marketing route about a second of main-thread time on a mid-range phone. One GET of the same session endpoint
 * the client would call, made when the browser is idle, answers the only question these pages ask.
 */
let signedIn = false;
let started = false;
const listeners = new Set<() => void>();

function load() {
  if (started) return;
  started = true;
  const run = () => {
    fetch("/api/auth/get-session", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: unknown } | null) => {
        signedIn = !!data?.user;
        if (signedIn) listeners.forEach((l) => l());
      })
      .catch(() => {});
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 1);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribe, () => signedIn, () => false);
}
