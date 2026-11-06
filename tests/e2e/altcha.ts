import type { APIRequestContext } from "@playwright/test";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";

/** The `x-altcha` header value for the magic-link endpoint: fetch a challenge and solve it in Node, as the sign-in form does in the browser. */
export async function altchaHeader(request: APIRequestContext): Promise<string> {
  const challenge = await (await request.get("/api/altcha")).json();
  const solution = await solveChallenge({ challenge, deriveKey } as never);
  return btoa(JSON.stringify({ challenge, solution }));
}
