import { JetBrains_Mono, Public_Sans, Spectral } from "next/font/google";

// Wirebook type system (docs/DESIGN.md section 6): Spectral for H1/H2, Public Sans for UI and body, JetBrains Mono for figures and code.
// Variable names keep the kit's --font-kit-* wiring; --font-kit-display is the serif voice.
export const sans = Public_Sans({ subsets: ["latin"], variable: "--font-kit-sans", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-kit-mono", display: "swap" });
export const display = Spectral({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-kit-display", display: "swap" });
