import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { CATALOGUE } from "@/lib/errors/catalogue";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Error guides", description: "Every error code Wirebook returns, what it means and how to fix it.", path: "/errors" });

export default function ErrorsIndex() {
  return (
    <Container className="py-12 md:py-20">
      <div className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="heading-4 text-text">Error guides</h1>
          <p className="body-3 text-text-subtle">Every error carries a code, a plain message, a retry hint and a link to one of these pages.</p>
        </header>
        <ul className="flex flex-col border-t border-border">
          {CATALOGUE.map((c) => (
            <li key={c.slug} className="border-b border-border">
              <Link href={`/errors/${c.slug}`} className="grid min-h-11 gap-1 py-3 focus-visible:focus-ring sm:grid-cols-[10rem_1fr] sm:gap-6">
                <span className="figures text-text">{c.code}</span>
                <span className="body-6 text-text-subtle">{c.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
