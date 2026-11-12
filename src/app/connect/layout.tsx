import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/product";
import { Wordmark } from "@/components/marketing/wordmark";

export const metadata = { title: "Connect QuickBooks", robots: { index: false, follow: false } };

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/" aria-label={`${product.fullName} home`} className="inline-flex min-h-11 items-center rounded-sm focus-visible:focus-ring"><Wordmark /></Link>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t border-border bg-surface-sunken px-4 py-6 body-6 text-text-subtle sm:px-6 lg:px-10">
        Wirebook connects your QuickBooks company file through the QuickBooks Web Connector. It is not affiliated with or endorsed by Intuit.
      </footer>
    </div>
  );
}
