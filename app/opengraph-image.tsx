import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand-image";

// Share preview for pages without their own image (home, account). Listing pages use their cover photo.
// English only: the image renderer does not shape Arabic text correctly.
export const alt = "Sakani — places to rent across Egypt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(150deg, #2b7a5e 0%, #174d3d 75%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <BrandMark size={84} radius={22} inverted />
          <span style={{ fontSize: 52, fontWeight: 800 }}>Sakani</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>Places to rent across Egypt</span>
          <span style={{ fontSize: 34, color: "rgba(255,255,255,0.82)" }}>
            Reviewed listings · Every host checked · Book with confidence
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
