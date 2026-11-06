import type { Metadata } from "next";
import {
  CompareStrip, Faq, Features, FinalCta, FitSection, Hero, HowItWorks, PricingTeaser, ProblemSection, TaglineReveal,
  type FaqItem, type Feature, type Step,
} from "@/components/marketing";
import { RequestLog, StateLabel, Tick } from "@/components/marketing/ledger/request-log";
import { product } from "@/config/product";
import { money, rates } from "@/lib/pricing";

const title = `${product.fullName}: QuickBooks Desktop API, ${money(rates.perFile)} per file`;
const description = "REST and typed SDKs for QuickBooks Desktop. A connect flow your customers finish alone, a request log with lifecycle states, every price published.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
};

const K = ({ children }: { children: string }) => <span className="text-focus">{children}</span>;
const S = ({ children }: { children: string }) => <span className="text-success">{children}</span>;

const sdkSnippet = (
  <code>
    <K>const</K> invoice = <K>await</K> wirebook.invoices.create({"{"}{"\n"}
    {"  "}customerId: <S>&quot;cust_8F2A&quot;</S>, refNumber: <S>&quot;INV-1042&quot;</S>,{"\n"}
    {"  "}lines: [{"{"} item: <S>&quot;Framing labour&quot;</S>, qty: 12, rate: 107.04 {"}"}]{"\n"}
    {"}"}, {"{"} idempotencyKey: <S>&quot;acme-inv-1042&quot;</S> {"}"}) <span className="text-text-subtle">{"// 201 in 2.1 s"}</span>
  </code>
);

const errors = [
  { code: "QBWC1085", meaning: "The Web Connector could not write its log file, so the update stopped. Fix the log path permissions, then run it again." },
  { code: "0x80040408", meaning: "QuickBooks could not open the company file. Open the file on the PC and leave it open." },
  { code: "3140", meaning: "A reference does not match a record in this company file. Fix the name or pass the ListID." },
  { code: "3100", meaning: "The name is already in use by another record. Use the existing record or pick a new name." },
];

const frag = "flex flex-col gap-2 p-4";

function Replayed() {
  return (
    <div className={`${frag} figures caption-4`}>
      <p className="flex items-center justify-between gap-2 text-text"><span>POST invoices · acme-inv-1042</span><StateLabel state="succeeded" /></p>
      <p className="flex items-center justify-between gap-2 border-t border-border pt-2 text-text"><span>POST invoices · acme-inv-1042</span><span className="rounded-full border border-border-strong px-2 caption-3 text-text">replayed</span></p>
      <p className="border-t border-border pt-2 font-sans caption-5 text-text-subtle">Sample data. Same key, same body: one invoice.</p>
    </div>
  );
}

function ErrorFragment() {
  return (
    <pre tabIndex={0} className="code-block overflow-x-auto p-4 text-text">
      {`{ "type": "invalid_reference",\n  "code": "3140",\n  "userFacingMessage": "CustomerRef does not match a customer.",\n  "guideUrl": "/errors/3140",\n  "retryable": false,\n  "requestId": "req_01JC9P8" }`}
    </pre>
  );
}

function Timeline() {
  const rows: [string, string][] = [
    ["00:00.0", "Queued for Harlan Mechanical"],
    ["00:00.4", "Sent on Web Connector poll"],
    ["00:01.7", "QuickBooks replied, status 0"],
  ];
  return (
    <ol className={`${frag} gap-0`}>
      {rows.map(([t, label]) => (
        <li key={t} className="grid grid-cols-[72px_1fr] gap-3 border-b border-border py-2 caption-4 text-text last:border-b-0">
          <span className="figures text-text-subtle">{t}</span><span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

const rail = ["Download the connector file", "Allow access in QuickBooks", "Paste the password", "Connected"];
function Rail() {
  return (
    <ol className="perf flex flex-col py-2 pr-4 pl-10">
      {rail.map((r, i) => (
        <li key={r} className="flex items-center gap-2 border-b border-border py-2 caption-4 text-text last:border-b-0">
          <span className="text-success"><Tick index={i} /></span>{r}
        </li>
      ))}
      <li className="pt-2 caption-5 text-text-subtle">Mockup. Each step turns green only when our server saw it.</li>
    </ol>
  );
}

function SdkTabs() {
  return (
    <div className={`${frag} figures caption-4 text-text`}>
      <p><span className="text-text-subtle">TypeScript </span>await wirebook.customers.list()</p>
      <p><span className="text-text-subtle">Python </span>wirebook.customers.list()</p>
      <p className="break-all"><span className="text-text-subtle">cURL </span>curl -H &quot;Authorization: Bearer sk_test_…&quot; /v1/qbd/customers</p>
    </div>
  );
}

function KeyPanel() {
  return (
    <div className={`${frag} figures caption-4 text-text`}>
      <p className="flex items-center justify-between gap-2"><span>sk_test_••••••••••••</span><span className="rounded-full border border-success bg-success-surface px-2 caption-3 text-success">Test</span></p>
      <p className="flex items-center justify-between gap-2 border-t border-border pt-2"><span>sk_live_••••••••••••</span><span className="rounded-full border border-danger bg-danger-surface px-2 caption-3 text-danger">Production</span></p>
      <p className="border-t border-border pt-2 font-sans caption-5 text-text-subtle">Mockup. Shown once, stored as a SHA-256 hash.</p>
    </div>
  );
}

const features: Feature[] = [
  { title: "One call, one invoice, never two", body: "Send an Idempotency-Key on every write. We replay it for 7 days. A different body with the same key returns 409.", span: 4, visual: <Replayed /> },
  { title: "Errors that say what to do", body: "One error object: type, code, userFacingMessage, guideUrl, retryable, requestId. Thirty guides at launch. Same input, same message, no AI model.", span: 2, visual: <ErrorFragment /> },
  { title: "A request log with lifecycle states", body: "queued, sent, succeeded, failed, outcome_unknown. If a request times out after it was sent, we reconcile by RefNumber before you retry.", span: 2, visual: <Timeline /> },
  { title: "A connect flow your customer finishes alone", body: "Four steps, and each one turns green only when our server saw it. The link is valid for 7 days.", span: 4, visual: <Rail /> },
  { title: "Typed SDKs and a raw escape hatch", body: "TypeScript with async iterators and retries, and Python with sync and async clients, both generated from OpenAPI 3.1. Any valid qbXML works through passthrough.", span: 3, visual: <SdkTabs /> },
  { title: "Test and Production keys, kept apart", body: "Keys are shown once, stored as SHA-256 hashes and revocable within 5 seconds.", span: 3, visual: <KeyPanel /> },
];

const steps: Step[] = [
  {
    title: "Create a key and an end user",
    body: "Sign up, create an sk_test_ key, add your customer and get a connect link valid for 7 days.",
    visual: <div className="rounded-md border border-border bg-surface-raised p-4 figures caption-4 text-text">POST /v1/end-users<br />{"{ \"name\": \"Acme Builders\" }"}<br /><span className="text-text-subtle">connect link: valid 7 days (sample)</span></div>,
  },
  {
    title: "Your customer connects",
    body: "They open the link on the QuickBooks PC, download a .qwc file, choose Yes, always allow access even if QuickBooks isn't running, and paste the password. The status turns Connected.",
    visual: <div className="rounded-md border border-border bg-surface-raised"><Rail /></div>,
  },
  {
    title: "Call the API",
    body: (
      <>
        <code className="figures">POST /v1/qbd/invoices</code>. Wirebook validates, translates to ordered qbXML, queues it per company file and returns JSON on the next Web Connector poll.
        <span className="mt-3 block border-t border-border pt-3 caption-2">Requests run when QuickBooks next checks in, so this is polling, not real time. If the connector is not running you get a 202 queued, and a guide after 30 seconds.</span>
      </>
    ),
    visual: <pre tabIndex={0} className="code-block overflow-x-auto rounded-md border border-border bg-surface-raised p-4 text-text">{`curl -X POST /v1/qbd/invoices \\\n  -H "Idempotency-Key: acme-inv-1042" \\\n  -d @invoice.json\n\n202 queued  (sample)\n201 succeeded in 2.1 s`}</pre>,
  },
];

const faq: FaqItem[] = [
  { q: "Is half price a sign of half quality?", a: `We cannot prove quality with a price, so we publish what we do: the request lifecycle, the error object, the idempotency rules and the roadmap. We only claim what we have tested, and the first acceptance run against a real QuickBooks is still ahead of us.` },
  { q: "Will a two person vendor be around in three years?", a: `We cannot promise that. What we can do is keep you unlocked: any valid qbXML works through passthrough, every price is published, and your request history is yours to export.` },
  { q: "Is it real time?", a: "No. QuickBooks Desktop only talks to the Web Connector when it polls. Requests run when QuickBooks next checks in. If the connector is not running you get a 202 queued, and a guide after 30 seconds." },
  { q: "What counts as an active file?", a: "A company file counts in a month only if a data request succeeded for it that month. Sample files never count." },
  { q: "How do you stop duplicate writes?", a: "Send an Idempotency-Key on every write. We replay the first result for 7 days. The same key with a different body returns 409. If a request times out after it was sent, we reconcile by RefNumber before you retry." },
  { q: "What do you log, and who sees it?", a: "Request and response bodies are deleted after 14 days, sooner if you set it, and request metadata after 90. No email API, analytics service or AI model is in the data path." },
  { q: "Do you have SOC 2?", a: "No, not at launch. We offer a self attested security pack and a DPA." },
  { q: "Which QuickBooks versions work?", a: "QuickBooks Desktop 2024 is fully supported. Version 2023 and older is best effort. Pro, Premier and Enterprise on Windows are supported." },
  { q: "Does it work with QuickBooks for Mac or UK QuickBooks Desktop?", a: "No. The Web Connector runs on Windows, and we do not support the UK edition." },
  { q: "Can I try it without buying QuickBooks?", a: "Yes. Sample company files are unlimited on the free Developer tier. No card." },
  { q: "What does migration cost?", a: "The first 2 months are $0 for files moved from another QuickBooks Desktop API or a home grown Web Connector server." },
  { q: "Is Intuit involved?", a: product.intuitNotice },
];

export default function HomePage() {
  return (
    <>
      <Hero
        title={<>QuickBooks Desktop,<br />as a normal API</>}
        subtitle={<>REST, typed TypeScript and Python SDKs, and a connect flow your customers can finish alone. <span className="figures text-text">{money(rates.perFile)}</span> per company file.</>}
        primaryCta={product.cta}
        secondaryCta={{ href: "/docs", label: "Read the docs →" }}
        risk="No card. Unlimited sample company files."
        proof={<><strong className="font-semibold text-text">{product.benchmark.name} lists <span className="figures">{money(rates.benchmark)}</span> per company file per month</strong> ({product.benchmark.host}, checked {product.benchmark.checked}). {product.fullName} charges <span className="figures text-text">{money(rates.perFile)}</span>. Every price is published.</>}
        visual={<RequestLog code={sdkSnippet} />}
      />
      <ProblemSection
        title="QuickBooks Desktop has no cloud API"
        intro="To read one invoice you host a SOAP server for the Windows only Web Connector, speak order sensitive qbXML, decode errors like 0x80040400, and support your customers' Windows machines."
        errors={errors}
      />
      <TaglineReveal text="Your app makes a normal API call. Wirebook by BufferSol handles the Web Connector." />
      <Features
        title="What you get"
        intro={<>Coming in v1: webhooks, a C# SDK, and a hosted MCP server with read only mode.</>}
        items={features}
      />
      <HowItWorks title="From sign up to first request" steps={steps} />
      <PricingTeaser />
      <CompareStrip />
      <FitSection
        yes="Vertical SaaS (construction, field service, distribution, logistics, property management, nonprofits) and fintech teams that sync to the ledger of customers who keep books in QuickBooks Desktop on Windows."
        no="QuickBooks for Mac, UK QuickBooks Desktop, on premise only processing, and teams that need SOC 2 Type II or a HIPAA BAA on day one. We have a self attested security pack, a DPA, and request bodies are deleted after 14 days at most."
      />
      <Faq title="Questions, answered" items={faq} />
      <FinalCta
        title="Your first request in about 15 minutes"
        body="That is our target for a developer with a sample company file, not a promise."
        cta={product.cta}
        note="No card. Unlimited sample files."
      />
    </>
  );
}
