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
        "Every error has a type, a code, a userFacingMessage, a guideUrl, a retryable flag and a requestId. The code is the QuickBooks status or Web Connector code when there is one. Thirty guides are planned for launch; the four below are the first.",
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
