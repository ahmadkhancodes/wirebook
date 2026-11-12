import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { docGroups } from "@/content/docs";
import { product } from "@/config/product";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Documentation",
  description: `Guides and reference for the ${product.name} API, connect flow, errors and billing.`,
  path: "/docs",
});

export default function DocsIndexPage() {
  return (
    <Container className="py-12 md:py-20">
      <header className="mb-12 flex max-w-3xl flex-col gap-4">
        <p className="index-label flex items-center gap-2 text-text-subtle"><span aria-hidden className="size-2 bg-action" />Docs</p>
        <h1 className="heading-4 md:heading-2 text-text">Documentation</h1>
        <p className="body-3 text-text-subtle">Guides and reference for the {product.name} REST API, the TypeScript and Python SDKs, the connect flow and every error code. Start with the quickstart: a sample company file and your first request.</p>
      </header>
      <div className="flex flex-col gap-12">
        {docGroups.map((g, gi) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`} className="grid gap-4 lg:grid-cols-12 lg:gap-8">
            <h2 id={`g-${g.title}`} className="index-label flex gap-2 text-text-subtle lg:col-span-3 lg:pt-4"><span aria-hidden>{String(gi + 1).padStart(2, "0")}</span><span aria-hidden>/</span>{g.title}</h2>
            <ul className="border-t border-border lg:col-span-9">
              {g.docs.map((d) => (
                <li key={d.slug} className="border-b border-border">
                  <Link
                    href={`/docs/${d.slug}`}
                    className="group grid min-h-11 gap-1 rounded-sm py-4 transition-colors duration-300 ease-out-kit hover:bg-surface-sunken focus-visible:focus-ring sm:grid-cols-12 sm:gap-4 sm:px-2"
                  >
                    <span className="title-3 font-semibold text-text underline decoration-transparent underline-offset-4 transition-colors duration-300 ease-out-kit group-hover:decoration-action sm:col-span-4">{d.title}</span>
                    <span className="body-6 text-text-subtle sm:col-span-8">{d.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
