import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme";
import { product } from "@/config/product";

export const metadata = { title: "Connect QuickBooks", robots: { index: false, follow: false } };

export default function ConnectLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/" className="heading-6 text-text focus-visible:focus-ring">{product.name}</Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">{children}</main>
      <footer className="border-t border-border px-4 py-6 body-6 text-text-subtle sm:px-6 lg:px-10">
        Wirebook connects your QuickBooks company file through the QuickBooks Web Connector. It is not affiliated with or endorsed by Intuit.
      </footer>
    </div>
  );
}
