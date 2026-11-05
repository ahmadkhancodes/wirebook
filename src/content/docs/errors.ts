import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const errors: DocPage = {
  slug: "errors",
  title: "Errors",
  description: `What the common QuickBooks and Web Connector errors mean, and what to do about each in ${p.name}.`,
  sections: [
    {
      heading: "How errors are shaped",
      body: [
        "Every error is one object with a type, a code, a message, a userFacingMessage, a guideUrl, a retryable flag and, when it applies, a path and a requestId. Each code has its own page in the error guides at /errors; the four below are the ones you will see first. More guides arrive with the remaining objects.",
      ],
    },
    {
      heading: "QBWC1085",
      body: ["The Web Connector could not write its log file, so the update stopped. Fix the permissions on the log path, then run the update again."],
    },
    {
      heading: "0x80040408",
      body: ["QuickBooks could not open the company file. Open the file on the PC and leave it open while the Web Connector runs."],
    },
    {
      heading: "3140",
      body: ["A reference does not match a record in this company file. Fix the name or pass the ListID instead."],
    },
    {
      heading: "3100",
      body: ["The name is already in use by another record. Use the existing record or pick a new name."],
    },
  ],
};
