import { getBridge } from "@/lib/bridge";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { healthTick, ownerEmailFor } from "@/lib/health";
import { sendMail } from "@/lib/mail";
import { purgePayloads } from "@/lib/retention";
import { webhookSink } from "@/lib/webhooks/events";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  /** every 5 minutes (Cloudflare Worker cron, see infra/cron-worker): Asleep/Broken from the last poll, one Broken email per incident */
  "health-tick": async () => healthTick({ bridge: await getBridge(), ownerEmail: ownerEmailFor, send: (m) => sendMail(m), baseUrl: appUrl(), onEvent: webhookSink(await getDb()) }),
  /** daily 03:00 UTC: retention purge of payloads, with an audit entry */
  purge: async () => purgePayloads(await getDb(), await getBridge()),
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
