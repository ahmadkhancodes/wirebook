import { ImageResponse } from "next/og";
import { product } from "@/config/product";

export const size = { width: 32, height: 32 };
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
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          borderRadius: 3,
        }}
      >
        {product.name.charAt(0)}
      </div>
    ),
    { ...size },
  );
}
