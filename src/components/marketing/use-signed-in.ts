"use client";
import { authClient } from "@/lib/auth/client";

/**
 * Session state for static marketing pages. Pages stay cacheable: the HTML is always the signed-out version and this
 * hook swaps labels after hydration (one frame at most; only text and href change, so nothing moves).
 */
export function useSignedIn(): boolean {
  const { data } = authClient.useSession();
  return !!data?.user;
}
