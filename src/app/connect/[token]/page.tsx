import Link from "next/link";
import { notFound } from "next/navigation";
import { getBridge } from "@/lib/bridge";
import { derivePassword, loadLink, stepsFor } from "@/lib/connect";
import { connectSecret } from "@/lib/v1/deps";
import { ConnectSteps } from "./connect-steps";

export const dynamic = "force-dynamic";

export default async function ConnectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bridge = await getBridge();
  const loaded = await loadLink(bridge, token);
  if (loaded.state === "unknown") notFound();
  if (loaded.state === "expired" || loaded.state === "used") {
    const used = loaded.state === "used";
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-6" aria-labelledby="gone-h">
        <h1 id="gone-h" className="heading-5 text-text">{used ? "This link was already used" : "This link has expired"}</h1>
        <p className="body-6 text-text-subtle">
          {used
            ? "A connect link works once, and this one finished a connection. Nothing more to do here."
            : "Connect links last 24 hours. Ask the app that sent you for a new one."}
        </p>
        <Link href={used ? "/errors/connect-link-used" : "/errors/connect-link-expired"} className="body-6 text-text underline underline-offset-4">What does this mean?</Link>
      </section>
    );
  }
  const { user } = loaded;
  return (
    <ConnectSteps
      token={token}
      company={user!.companyName ?? null}
      username={user!.qbwcUsername}
      password={await derivePassword(connectSecret(), user!.id)}
      initial={stepsFor(user!)}
    />
  );
}
