import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/layout";
import { CATALOGUE, entryBySlug } from "@/lib/errors/catalogue";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

/** One guide page per catalogue entry, so every `guideUrl` in an API error resolves. */
export function generateStaticParams() {
  return CATALOGUE.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = entryBySlug(slug);
  if (!e) return {};
  return pageMetadata({ title: e.title, description: e.userFacingMessage, path: `/errors/${e.slug}` });
}

export default async function ErrorGuide({ params }: Props) {
  const { slug } = await params;
  const e = entryBySlug(slug);
  if (!e) notFound();
  return (
    <Container className="py-12 md:py-20">
      <article className="flex max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="caption-2 text-text-muted">
            <Link href="/errors" className="underline underline-offset-4 hover:text-text focus-visible:focus-ring">Error guides</Link>
          </p>
          <h1 className="heading-4 text-text">{e.title}</h1>
          <p className="body-3 text-text-subtle">{e.userFacingMessage}</p>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-md border border-border bg-surface-raised p-4 body-6">
          <dt className="text-text-subtle">Code</dt><dd className="figures text-text">{e.code}</dd>
          <dt className="text-text-subtle">HTTP status</dt><dd className="figures text-text">{e.httpStatusCode}</dd>
          <dt className="text-text-subtle">Type</dt><dd className="figures text-text">{e.type}</dd>
          <dt className="text-text-subtle">Safe to retry</dt><dd className="text-text">{e.retryable ? "Yes, with the same Idempotency-Key" : "No, change the request first"}</dd>
        </dl>
        <section className="flex flex-col gap-2" aria-labelledby="cause-h">
          <h2 id="cause-h" className="heading-6 text-text">What it means</h2>
          <p className="body-3 text-text-subtle">{e.cause}</p>
          <p className="body-3 text-text-subtle">API message: <code>{e.message}</code></p>
        </section>
        <section className="flex flex-col gap-2" aria-labelledby="fix-h">
          <h2 id="fix-h" className="heading-6 text-text">How to fix it</h2>
          <p className="body-3 text-text-subtle">{e.fix}</p>
        </section>
        <p className="body-6 text-text-subtle">Every error response carries a <code>guideUrl</code> that points at this page and a <code>requestId</code> you can find in the request log.</p>
      </article>
    </Container>
  );
}
