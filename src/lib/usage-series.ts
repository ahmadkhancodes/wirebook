import { periodOf } from "@/lib/billing/usage";
import type { Db } from "@/lib/db/types";
import { dayOf } from "@/lib/security/abuse";

export interface Point { label: string; value: number }

/** API requests per UTC day for the last `days` days, oldest first (zero for quiet days). */
export async function requestsByDay(db: Db, orgId: string, days = 30, now = new Date()): Promise<Point[]> {
  const out: Point[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(new Date(now.getTime() - i * 864e5));
    out.push({ label: d, value: await db.getUsage(orgId, "requests", d) });
  }
  return out;
}

/** Active production files per calendar month for the last `months` months, oldest first. */
export async function filesByMonth(db: Db, orgId: string, months = 6, now = new Date()): Promise<Point[]> {
  const out: Point[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const p = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)));
    out.push({ label: p, value: (await db.listActiveFiles(orgId, p)).length });
  }
  return out;
}
