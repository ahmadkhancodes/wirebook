import { api } from "./api";
import { authentication } from "./authentication";
import { billing } from "./billing";
import { connectFlow } from "./connect-flow";
import { errors } from "./errors";
import { gettingStarted } from "./getting-started";
import type { DocPage } from "./types";

export type { DocPage, DocSection } from "./types";

export interface DocGroup {
  title: string;
  docs: DocPage[];
}

export const docs: DocPage[] = [gettingStarted, connectFlow, authentication, api, errors, billing];

export const docGroups: DocGroup[] = [
  { title: "Start here", docs: [gettingStarted, connectFlow, authentication] },
  { title: "Build", docs: [api, errors] },
  { title: "Account", docs: [billing] },
];

export const getDoc = (slug: string): DocPage | undefined => docs.find((d) => d.slug === slug);

export const sectionId = (heading: string): string =>
  heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
