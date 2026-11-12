import { beforeEach, describe, expect, it } from "vitest";
import { planById, product } from "@/config/product";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { clearPriceCache } from "@/lib/billing/catalog";
import { checkoutUrls, createCheckoutSession, createPortalSession } from "@/lib/billing/checkout";
import { effectivePlan } from "@/lib/billing/entitlement";
import { canActivateFile, recordActiveFile } from "@/lib/billing/metering";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { event, fakeStripe } from "./fakes";

// The upgrade journey end to end, as far as Stripe test mode goes without a card: a Developer org at its 3 file
// limit picks a plan, gets the right Checkout Session, the webhook lifts the limit, the portal opens, and a
// cancellation puts the Developer limit back.

const ORG = "org_buyer";
const PROD = `${ORG}__production`;
const subject = { orgId: ORG, email: "priya@trades.test", userId: "u_priya" };

let db: Db;
let f: ReturnType<typeof fakeStripe>;
beforeEach(() => {
  db = createMemoryDb("wirebook");
  f = fakeStripe();
  clearPriceCache();
});
const hook = (type: string, obj: Record<string, unknown>, id?: string) => handleStripeWebhook(event(type, obj, id), "good", { stripe: f.stripe, db, secret: "whsec_x" });

describe("checkout return URLs", () => {
  it("send the buyer back to billing with a success or canceled notice", () => {
    expect(checkoutUrls("https://wirebook.test/")).toEqual({ success: "https://wirebook.test/app/billing?checkout=success", cancel: "https://wirebook.test/app/billing?checkout=canceled" });
  });
});

describe("upgrade journey", () => {
  for (const [plan, interval] of [["production", "month"], ["production", "year"], ["starter_pack", "month"], ["starter_pack", "year"], ["volume", "month"]] as const) {
    it(`${plan} ${interval}: the session uses the ${product.slug}_ lookup key, carries metadata.app and both return URLs`, async () => {
      await createCheckoutSession(f.stripe, db, subject, plan, interval, checkoutUrls("https://wirebook.test"));
      const call = f.calls.find((c) => c.method === "checkout.sessions.create")!.args as Record<string, any>;
      const lookupKey = planById(plan)!.prices.find((p) => p.interval === interval)!.lookupKey;
      expect(lookupKey.startsWith(`${product.slug}_`)).toBe(true);
      const [price] = (await f.stripe.prices.list({ lookup_keys: [lookupKey] })).data;
      expect(call.line_items).toEqual([{ price: price!.id, quantity: 1 }]);
      expect(call.metadata).toMatchObject({ app: "wirebook", plan, interval, org_id: ORG });
      expect(call.subscription_data.metadata).toMatchObject({ app: "wirebook", plan, interval, org_id: ORG });
      expect(call.success_url).toBe("https://wirebook.test/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
      expect(call.cancel_url).toBe("https://wirebook.test/app/billing?checkout=canceled");
      const cus = f.customers.get((await db.getBillingAccount(ORG))!.stripeCustomerId!) as { metadata: Record<string, string> };
      expect(cus.metadata.app).toBe("wirebook");
    });
  }

  it("the Developer limit is lifted by the webhook, the portal opens, and cancelling puts the limit back", async () => {
    const now = new Date();
    for (const id of ["end_a", "end_b", "end_c"]) expect(await recordActiveFile(db, PROD, id, now)).toBe(true);
    expect(await canActivateFile(db, PROD, "end_d", now)).toBe(false); // 4th real file refused on Developer

    await createCheckoutSession(f.stripe, db, subject, "production", "month", checkoutUrls("https://wirebook.test"));
    const cus = (await db.getBillingAccount(ORG))!.stripeCustomerId!;
    // Stripe creates the subscription when the buyer pays; the webhook is how we learn about it.
    const sub = f.addSub(cus, "wirebook_production_monthly");
    expect((await hook("checkout.session.completed", { customer: cus, metadata: { app: "wirebook" } })).status).toBe(200);
    const ent = await db.getEntitlement(ORG);
    expect(effectivePlan(ent, now.getTime()).id).toBe("production");
    expect(await canActivateFile(db, PROD, "end_d", now)).toBe(true);
    expect(await recordActiveFile(db, PROD, "end_d", now)).toBe(true);

    const portal = await createPortalSession(f.stripe, db, ORG, "https://wirebook.test/app/billing");
    expect(portal.url).toBe(`https://billing.stripe.test/${cus}`);

    sub.status = "canceled";
    expect((await hook("customer.subscription.deleted", { customer: cus })).status).toBe(200);
    expect(effectivePlan(await db.getEntitlement(ORG), now.getTime()).id).toBe("free");
    expect(await canActivateFile(db, PROD, "end_e", now)).toBe(false);
    // files already active this month keep working
    expect(await canActivateFile(db, PROD, "end_d", now)).toBe(true);
  });
});
