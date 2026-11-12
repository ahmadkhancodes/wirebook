import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/product";
import { Wordmark } from "@/components/marketing/wordmark";

/** What happens after sign in, in order. Shown beside the form on wide screens; true for every new account. */
const next = [
  { at: "Step 1", title: "Open the link we email you", body: "No password. Each sign in gets a fresh link." },
  { at: "Step 2", title: "Name your organization", body: "Invite your team later from Settings." },
  { at: "Step 3", title: "Create a test key", body: "Test keys work with QuickBooks sample company files, free and without a card." },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-12">
      <div className="flex flex-col lg:col-span-7">
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-12">
          <Link href="/" aria-label={`${product.fullName} home`} className="inline-flex min-h-11 items-center rounded-sm focus-visible:focus-ring"><Wordmark /></Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-12">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8">{children}</div>
        </main>
        <footer className="px-4 py-6 sm:px-6 lg:px-12">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-sm body-6 text-text-subtle transition-colors duration-300 ease-out-kit hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to {product.name}
          </Link>
        </footer>
      </div>
      <aside aria-label="What happens next" className="hidden flex-col justify-center border-l border-border bg-surface-sunken px-12 py-16 lg:col-span-5 lg:flex">
        <p className="index-label flex items-center gap-2 text-text-subtle"><span aria-hidden className="size-2 bg-action" />What happens next</p>
        <ol className="relative mt-8 flex max-w-sm flex-col gap-8">
          <span aria-hidden className="absolute top-2 bottom-2 left-1 w-0.5 bg-action" />
          {next.map((s, i) => (
            <li key={s.at} className="relative flex flex-col gap-1 pl-8">
              <span aria-hidden className={`absolute top-1 left-0 size-3 border-2 border-action ${i === next.length - 1 ? "bg-action" : "bg-surface-sunken"}`} />
              <span className="figures caption-5 text-text-subtle">{s.at}</span>
              <span className="title-3 font-semibold text-text">{s.title}</span>
              <span className="body-6 text-text-subtle">{s.body}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
