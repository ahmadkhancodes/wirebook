import { product } from "@/config/product";
import type { EndUser, HealthStatus } from "@/lib/qbwc/types";

/**
 * Connection health from the last Web Connector poll.
 *  - Pending: never polled; the connect flow owns it.
 *  - Connected: polled within asleepAfterMs.
 *  - Asleep: no poll for asleepAfterMs (the computer is probably off or asleep). Recovers by itself on the next poll.
 *  - Broken: the Web Connector reported a connection error, or no poll for brokenAfterMs. Needs the owner.
 * Thresholds live in product.ts. Recovery is done by the bridge (authenticate), not here.
 */
export interface Transition { status: HealthStatus; reason: string }

const hours = (ms: number) => Math.round(ms / 36e5);

/** What the status should be now, or null when it should not change. */
export function evaluate(u: Pick<EndUser, "status" | "lastPollAt" | "firstSyncAt">, now: Date): Transition | null {
  if (u.status === "pending" || u.status === "broken") return null;
  const last = u.lastPollAt?.getTime();
  if (last === undefined) return null;
  const age = now.getTime() - last;
  const { asleepAfterMs, brokenAfterMs } = product.health;
  if (age >= brokenAfterMs) return { status: "broken", reason: `No poll from the Web Connector for ${hours(age)} hours` };
  if (age >= asleepAfterMs && u.status === "connected") return { status: "asleep", reason: `No poll from the Web Connector for ${hours(age)} hours` };
  return null;
}

