import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a5c3c",
          color: "#f1f7f2",
          fontSize: 120,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          borderRadius: 0,
        }}
      >
        {product.name.charAt(0)}
      </div>
    ),
    { ...size },
  );
}
