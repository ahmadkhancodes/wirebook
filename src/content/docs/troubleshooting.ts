import { product as p } from "@/config/product";
import { CATALOGUE } from "@/lib/errors/catalogue";
import type { DocPage } from "./types";

const hours = (ms: number) => ms / 3_600_000;

/** One line per QuickBooks status code or connection error, built from the catalogue so it cannot drift. */
export function statusTable(): string {
  const rows = CATALOGUE.filter((c) => c.type === "quickbooks" || c.type === "connection");
  const cols = rows.map((c) => [c.code, String(c.httpStatusCode), c.retryable ? "yes" : "no", c.title, `/errors/${c.slug}`]);
  const head = ["code", "http", "retryable", "title", "guide"];
  const w = head.map((h, i) => Math.max(h.length, ...cols.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((x, i) => (i < 4 ? x.padEnd(w[i]!) : x)).join("  ");
  return [line(head), ...cols.map(line)].join("\n");
}

export const troubleshooting: DocPage = {
  slug: "troubleshooting",
  title: "Troubleshooting",
  description: `Symptoms and fixes for ${p.name}: company files that are Asleep or Broken, requests that stay queued, QuickBooks status codes and unknown outcomes.`,
  sections: [
    {
      heading: "Before you start",
      body: [
        "All behaviour in these guides is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step. Real installs can differ in small ways, so report anything that does not match.",
      ],
    },
    {
      heading: "Request stays queued or returns 202",
      body: [
        "QuickBooks Desktop cannot be reached from the internet. The Web Connector on the customer's PC polls us, so a request waits until the next poll. If it has not finished within the wait, the API returns 202 with a request id (the SDKs call this request_pending when you list). Poll GET /v1/requests/{id}, or use requests.wait in the SDKs.",
        "If it stays queued, check that the PC is on, QuickBooks is open or the Web Connector entry is set to Auto-Run, and the file shows Connected in the dashboard.",
      ],
    },
    {
      heading: "File shows Asleep",
      body: [
        `A file is Asleep when the Web Connector has not polled for ${hours(p.health.asleepAfterMs)} hours. The PC may be off or asleep, or the Web Connector may be closed. Requests queue and run when it polls again, and the file returns to Connected by itself.`,
      ],
    },
    {
      heading: "File shows Broken",
      body: [
        `A file is Broken after ${hours(p.health.brokenAfterMs)} hours without a poll, or on a connection error reported by the Web Connector. The status changes the moment you open the dashboard or call the API; the email and the company_file.broken webhook for the incident go out ${p.cadence.within}, once per incident. Fix the cause on the PC, then use Send reconnect link in the dashboard or create a new connect link, and the file recovers on the next poll.`,
      ],
    },
    {
      heading: "QuickBooks must be open or on Auto-Run",
      body: [
        "The Web Connector can start QuickBooks only when the entry is set to Auto-Run and the user is signed in to Windows. Otherwise open QuickBooks with the company file yourself. If QuickBooks is closed and cannot be started you get quickbooks_could_not_start (HRESULT 0x80040408).",
      ],
    },
    {
      heading: "Single user mode and dialogs",
      body: [
        "A file open in single user mode by another person, or a dialog waiting for an answer in QuickBooks (a license prompt, an update or an unsaved window), blocks the Web Connector. Close the dialog, or return the file to multi user mode, and the queued request continues.",
      ],
    },
    {
      heading: "Writes: outcome_unknown",
      body: [
        "If a write was sent and no answer came back, the request ends as outcome_unknown (502). It may or may not have been applied. Never blindly retry it. Query the object by RefNumber (for example GET /v1/qbd/invoices?refNumber=1042). If it exists, the write worked. If not, write again with a new Idempotency-Key.",
      ],
    },
    {
      heading: "Wrong password in the Web Connector",
      body: [
        "The Web Connector password is derived from a server secret. If the secret changes (for example BETTER_AUTH_SECRET is rotated on a self-run deployment), every .qwc file stops working with an authentication failure. Send each customer a reconnect link so they download a new file and enter the new password.",
      ],
    },
    {
      heading: "QuickBooks status codes and connection errors",
      body: [
        "Each line is one code from the error catalogue: the code, the HTTP status we return, whether a retry can help, the title and the guide page.",
      ],
      code: { lang: "text", code: statusTable() },
    },
  ],
};
