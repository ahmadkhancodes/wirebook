import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const connectFlow: DocPage = {
  slug: "connect-flow",
  title: "Connect flow",
  description: `How your customer connects their QuickBooks Desktop company file to ${p.name} without your help.`,
  sections: [
    {
      heading: "What your customer does",
      body: [
        "You create an end user and send them a connect link. The link is valid for 7 days. They open it on the PC where QuickBooks Desktop runs and follow four steps. Each step turns green only when our server saw it happen, so nobody is told they are done when they are not.",
      ],
    },
    {
      heading: "The four steps",
      body: [
        "1. Download the .qwc file, the connector definition for the Intuit Web Connector.",
        "2. Add it to the Web Connector, and in QuickBooks choose Yes, always allow access even if QuickBooks isn't running.",
        "3. Paste the one time password shown on the page into the Web Connector.",
        "4. The status turns Connected when the first poll reaches our server.",
      ],
    },
    {
      heading: "Polling, not real time",
      body: [
        "The Web Connector calls us on a schedule. Your requests run when QuickBooks next checks in. If the connector is not running you get a 202 queued response, and a guide that explains why after 30 seconds.",
      ],
    },
    {
      heading: "Requirements",
      body: [
        "QuickBooks Desktop 2024 is fully supported. Version 2023 and older is best effort. Pro, Premier and Enterprise on Windows are supported. QuickBooks for Mac and UK QuickBooks Desktop are not.",
      ],
    },
  ],
};
