import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const alt = `${product.fullName}: ${product.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f1f7f2",
          color: "#123524",
          padding: 80,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16 }}>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{product.fullName}</div>
            <div style={{ fontSize: 24, color: "#46604f" }}>QuickBooks Desktop API</div>
          </div>
          <div style={{ display: "flex", height: 2, background: "#123524" }} />
          <div style={{ display: "flex", height: 2, marginTop: 4, background: "#123524" }} />
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1, maxWidth: 1000 }}>
          {product.tagline}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#46604f", borderTop: "2px solid #b9cfc0", paddingTop: 20 }}>
          <span>{product.host}</span>
          <span style={{ color: "#1a5c3c" }}>Ledger of every request</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
