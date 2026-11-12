import { Bitter, JetBrains_Mono, Libre_Franklin } from "next/font/google";

// Wirebook "Ledger" type system (docs/design-brief.md section 6): Bitter, a sturdy slab, for headings and every
// amount (lining tabular figures); Libre Franklin, an American gothic from the bookkeeping era, for text and UI;
// JetBrains Mono for IDs, status codes and code. Variable names keep the kit's --font-kit-* wiring.
export const display = Bitter({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-kit-display", display: "swap" });
export const sans = Libre_Franklin({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
// Mono is not preloaded: it never paints the largest element, so the display and text faces get the bandwidth first.
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap", preload: false });
