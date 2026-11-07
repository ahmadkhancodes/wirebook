import { product as p, type PlanId } from "@/config/product";
import type { DocPage } from "./types";

const n = (x: number) => x.toLocaleString("en-US");
const planName = (id: PlanId) => p.plans.find((x) => x.id === id)?.name ?? id;

export const limits: DocPage = {
  slug: "limits",
  title: "Limits",
  description: `Rate limits, daily request caps, size limits and file limits in the ${p.name} API, and the errors they return.`,
  sections: [
    {
      heading: "Request rates",
      body: [
        `Each API key can make ${n(p.abuse.keyPerMinute)} requests per minute. Each source IP address can make ${n(p.abuse.ipPerMinute)} requests per minute across all keys. Ten bad keys is the limit: after ${p.abuse.badKeysPerMinute} invalid API keys in a minute from one address, the rest of that minute returns 429. Beyond a limit the API returns 429 with the error code rate_limited. All behaviour on this page is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.`,
      ],
    },
    {
      heading: "Daily request cap",
      body: [
        "Each organization has a fair-use cap on API requests per UTC day. Test and production keys count together, and the counter resets at 00:00 UTC. The cap by plan:",
        ...(Object.keys(p.abuse.dailyRequests) as PlanId[]).map((id) => `${planName(id)}: ${n(p.abuse.dailyRequests[id])} requests per day.`),
        "Past the cap the API returns 429 with daily_cap_reached and a Retry-After header with the seconds until 00:00 UTC. Webhook usage.threshold_reached fires at 80% and 100% of the cap. Caching reads on your side is the cheapest way to stay under it.",
      ],
    },
    {
      heading: "Size and time limits",
      body: [
        "A request body can be up to 1 MB. A larger body returns 413 payload_too_large. Split the work, for example one invoice per request.",
        `Pagination cursors last 10 minutes. After that the API returns 410 cursor_expired and you start again without a cursor. limit is 1 to 100.`,
        `A request waits ${p.abuse.syncWaitMs / 1000} seconds for QuickBooks (SYNC_WAIT_MS on the server), then answers 202 with a request id. Send Prefer: respond-async to skip the wait. Only one request is in flight per company file, and the rest queue in order.`,
      ],
    },
    {
      heading: "Company files",
      body: [
        `The ${planName("free")} plan includes ${p.billing.developerFiles} active company files per month. QuickBooks sample company files are free and unlimited, with test or production keys; a real company file counts whichever key you use. Starting a ${p.billing.developerFiles + 1}th real company file returns 402 file_limit_reached. See Plans and billing.`,
      ],
    },
    {
      heading: "Response headers",
      body: [
        "A 429 from a rate limit carries Retry-After (seconds to wait), X-RateLimit-Limit, X-RateLimit-Remaining (0) and X-RateLimit-Reset (seconds). A daily cap 429 carries Retry-After, X-RateLimit-Limit (the cap) and X-RateLimit-Remaining (0). Wait for Retry-After, then retry with exponential backoff. The SDKs do this for you.",
      ],
    },
    {
      heading: "Errors",
      body: [
        "rate_limited (429): see /errors/rate-limited.",
        "daily_cap_reached (429): see /errors/daily-cap-reached.",
        "org_suspended (403): we suspended the organization, see /errors/org-suspended.",
        "key_suspended (403): we suspended this key, see /errors/key-suspended.",
        "file_limit_reached (402): see /errors/file-limit-reached.",
        "payload_too_large (413): see /errors/payload-too-large.",
      ],
    },
  ],
};
