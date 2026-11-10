import { getBridge } from "@/lib/bridge";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { healthTick, ownerEmailFor } from "@/lib/health";
import { sendMailSafe } from "@/lib/mail";
import { SENT_TIMEOUT_MS } from "@/lib/qbwc";
import { purgePayloads } from "@/lib/retention";
import { webhookSink } from "@/lib/webhooks/events";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  /** Asleep/Broken from the last poll, one Broken email per incident. Runs inside the daily purge job (see product.cadence). */
  "health-tick": async () => {
    const bridge = await getBridge();
    // requests whose Web Connector session died after the send and never came back: give them up as outcome_unknown
    const expired = (await bridge.queue.expireSent(SENT_TIMEOUT_MS, new Date())).length;
    return { expired, ...(await healthTick({ bridge, ownerEmail: ownerEmailFor, send: (m) => sendMailSafe(m), baseUrl: appUrl(), onEvent: webhookSink(await getDb()) })) };
  },
  /** daily 03:30 UTC: retention purge of payloads (with an audit entry), then the health sweep and stuck-request expiry */
  purge: async () => {
    const purged = await purgePayloads(await getDb(), await getBridge());
    const health = await cronJobs["health-tick"]!().catch(() => null);
    return { purged, health };
  },
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
