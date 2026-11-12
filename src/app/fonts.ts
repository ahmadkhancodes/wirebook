import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

// Wirebook type system (docs/design-brief.md section 6): Archivo semi expanded for display, IBM Plex Sans for text and UI,
// IBM Plex Mono for every figure, ID and code sample. Variable names keep the kit's --font-kit-* wiring.
export const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-kit-display", display: "swap" });
export const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-kit-sans", display: "swap" });
// Mono is not preloaded: it never paints the largest element, so the display and text faces get the bandwidth first.
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-kit-mono", display: "swap", preload: false });
