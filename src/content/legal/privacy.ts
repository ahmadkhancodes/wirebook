import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  description: `How ${p.name} collects, uses and protects personal data, and the rights you have over it.`,
  sections: [
    {
      id: "who-we-are",
      title: "Who we are",
      body: [
        `${p.name} is operated by ${p.legal.entity}, ${p.legal.address}. This policy explains what personal data we handle when you visit ${p.host}, create an account or use the service. End users, meaning your customers who connect their QuickBooks Desktop company file through a link you send them, are covered below.`,
        `For account and billing data we are the controller. For QuickBooks data that flows through the API on behalf of your customers, you are the controller and we are your processor. The data processing addendum covers that second case.`,
      ],
    },
    {
      id: "data-we-collect",
      title: "Data we collect",
      body: [
        "We collect only what we need to run the service.",
        {
          list: [
            "Account data: your email address, name if you give one, and sign in credentials such as passkeys or two factor settings.",
            "Organization data: workspace name, members, roles, API keys (stored hashed) and the settings you configure.",
            "Billing data: your plan and subscription status. Card details go straight to Stripe and never touch our servers.",
            "QuickBooks data: the request and response payloads that pass between your application and a connected QuickBooks Desktop company file through the Intuit Web Connector. We keep these payloads only for the retention period described under Retention below.",
            "Request metadata: request id, operation, state, timestamps and error codes for each API call, plus idempotency keys, which are replayed for 7 days.",
            "End user connection data: the details an end user gives when they connect a company file through a connect link, such as the company file name and connection status.",
            "Technical data: IP address, browser type and request logs, kept briefly for security, abuse prevention and debugging.",
          ],
        },
        "We do not sell personal data. We do not use QuickBooks data for advertising or to train models, and no AI model and no analytics service sits in the data path.",
      ],
    },
    {
      id: "how-we-use-it",
      title: "How we use it and our legal bases",
      body: [
        "If you are in the European Economic Area or the United Kingdom, we rely on these legal bases under the GDPR and UK GDPR.",
        {
          list: [
            "Contract: to create your account, relay requests to connected company files and bill you per active company file.",
            "Legitimate interests: to secure the service, prevent abuse, and keep records that let us fix problems.",
            "Legal obligation: to keep tax and accounting records.",
            "Consent: for optional communications, which you can withdraw at any time.",
          ],
        },
      ],
    },
    {
      id: "sharing",
      title: "Who we share data with",
      body: [
        "We share data only with the subprocessors listed on our subprocessors page, and only to provide the service. We may also disclose data if a valid legal request requires it, and we will tell you first unless the law forbids it.",
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        {
          list: [
            "Account and organization data is kept while your account is open.",
            "QuickBooks payloads (request bodies, the parsed results we return, and raw qbXML responses) are stored with each request so you can read a late answer and replay it. They are deleted automatically after 14 days, or sooner if you shorten the period under Settings, Data retention. A shorter period applies to what is already stored the moment you save it, and each deletion run is written to your audit log as a count, never as content.",
            "Request metadata (request id, operation, state, timestamps and error codes) is deleted after 90 days.",
            "After you delete your account we remove your data within 30 days, except billing records we must keep by law, which are kept for the period the law requires.",
            "Server logs are kept for up to 30 days.",
            "Backups roll off within 35 days after deletion.",
          ],
        },
      ],
    },
    {
      id: "deletion-export",
      title: "Account deletion and data export",
      body: [
        "You can export or delete your data yourself. In the app, open Settings, then Account. You can also use the API: GET /api/account/export returns a copy of your data, and DELETE /api/account permanently deletes your account and workspace.",
      ],
    },
    {
      id: "your-rights",
      title: "Your rights under GDPR and UK GDPR",
      body: [
        "You can ask us to access, correct, delete, restrict or port your personal data, and you can object to processing based on legitimate interests. Most of these you can do from Settings. For anything else, email us. You also have the right to complain to your data protection authority.",
      ],
    },
    {
      id: "ccpa",
      title: "California rights under CCPA and CPRA",
      body: [
        "If you live in California you can ask what personal information we hold, ask us to delete or correct it, and ask us to stop selling or sharing it. We do not sell or share personal information for cross context advertising. We will not discriminate against you for using these rights.",
      ],
    },
    {
      id: "transfers",
      title: "International transfers",
      body: [
        "Our hosting and database are in the United States (Vercel and MongoDB Atlas). When we transfer personal data from the EEA, UK or Switzerland, we rely on the EU Standard Contractual Clauses and the UK addendum, and on the EU US Data Privacy Framework where a provider is certified.",
      ],
    },
    {
      id: "security",
      title: "Security",
      body: [
        "We encrypt data in transit and at rest and limit access to people who need it. See the security page for details. No system is perfectly secure, and we will notify you of a breach that affects you as the law requires.",
      ],
    },
    {
      id: "children",
      title: "Children",
      body: [`${p.name} is not directed at children under 16 and we do not knowingly collect their data.`],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: ["If we make a material change we will email account owners at least 14 days before it takes effect."],
    },
    {
      id: "contact",
      title: "Contact",
      body: [`Questions or requests: ${p.legalEmail}. For general help, write to ${p.supportEmail}.`],
    },
  ],
};
