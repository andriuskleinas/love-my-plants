import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/brand/marks";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Browser-tab icon: just the 4-square logo, no background, so the tiles fill the space.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <LogoMark size={64} title={null} />
      </div>
    ),
    size,
  );
}
