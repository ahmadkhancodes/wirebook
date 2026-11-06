import { PageHeader } from "@/components/app/page-header";
import { AbuseClient } from "./abuse-client";

export const metadata = { title: "Abuse controls" };

export default function AbusePage() {
  return (
    <>
      <PageHeader title="Abuse controls" description="Suspend an organization (every API request answers 403 org_suspended) or a single API key (403 key_suspended). Each action is written to the audit log with your id." />
      <AbuseClient />
    </>
  );
}
