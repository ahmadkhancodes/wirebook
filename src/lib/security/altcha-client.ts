import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";

/** Browser side: fetch a challenge, solve it with Web Crypto (about a second), return the base64 payload for the `x-altcha` header. */
export async function solveAltcha(): Promise<string> {
  const res = await fetch("/api/altcha", { cache: "no-store" });
  if (!res.ok) throw new Error("challenge_unavailable");
  const challenge = await res.json();
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error("challenge_timeout");
  return btoa(JSON.stringify({ challenge, solution }));
}
