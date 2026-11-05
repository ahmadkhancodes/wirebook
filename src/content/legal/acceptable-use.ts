import { product as p } from "@/config/product";
import type { LegalDoc } from "./types";

export const acceptableUse: LegalDoc = {
  slug: "acceptable-use",
  title: "Acceptable use policy",
  description: `What you may and may not do with ${p.name}.`,
  sections: [
    {
      id: "purpose",
      title: "Purpose",
      body: [`This policy keeps ${p.name} safe and reliable for everyone. It is part of the terms of service.`],
    },
    {
      id: "prohibited",
      title: "You must not",
      body: [
        {
          list: [
            "Break the law or help others do so.",
            "Connect a company file without the permission of its owner, or collect data without a lawful basis.",
            "Send phishing or malware, or use the service to relay unsolicited bulk messages.",
            "Use the service to extract payment card numbers, government ID numbers, passwords or health records unless we agree in writing.",
            "Infringe intellectual property or privacy rights.",
            "Probe, scan or attack the service, or bypass rate limits.",
            "Resell the service as your own without written permission.",
            "Publish content that is hateful, threatening or sexually exploits minors.",
          ],
        },
      ],
    },
    {
      id: "enforcement",
      title: "Enforcement",
      body: [
        "We may pause requests, suspend API keys or close accounts that break this policy. Where we can, we warn you first and give you time to fix the problem. For serious abuse we act immediately.",
      ],
    },
    {
      id: "report",
      title: "Report abuse",
      body: [`Email ${p.supportEmail} with the details of what you saw.`],
    },
  ],
};
