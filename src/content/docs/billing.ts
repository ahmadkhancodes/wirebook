import { product as p } from "@/config/product";
import { money, rates } from "@/lib/pricing";
import type { DocPage } from "./types";

export const billing: DocPage = {
  slug: "billing",
  title: "Plans and billing",
  description: `How ${p.name} bills per active company file, and how the free Developer tier works.`,
  sections: [
    {
      heading: "What counts as an active file",
      body: [
        "A company file is billed in a month only if a data request succeeded for it that month. Sample files never count.",
      ],
    },
    {
      heading: "Plans",
      body: [
        `Developer is free, with unlimited sample company files and no card. Production is ${money(rates.perFile)} per active file per month, or ${money(rates.perFileAnnualMonthly)} per file per month billed yearly. The Starter Pack covers up to ${rates.packFiles} files for ${money(rates.packMonthly)} a month (${money(rates.packAnnualMonthly)} billed yearly). Volume is ${money(rates.volumeFile)} per file from file ${rates.volumeFromFiles} upward. Enterprise is custom. See the pricing page for the full list.`,
      ],
    },
    {
      heading: "Change or cancel",
      body: [
        "Open Settings, then Billing, to upgrade, switch interval, update your card or cancel. We use Stripe for payments. A failed payment keeps your plan for 7 days before limits fall back to the Developer tier.",
      ],
    },
    {
      heading: "Migrating from another API",
      body: ["The first 2 months are $0 for files moved from another QuickBooks Desktop API or a home grown Web Connector server."],
    },
  ],
};
