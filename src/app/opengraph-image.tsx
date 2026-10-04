import { ImageResponse } from "next/og";
import { LogoMark, PALETTE } from "@/components/brand/marks";

export const alt = "Love My Plants: snap a photo, know what your plant needs.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The card shown when someone shares a link to the app.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 72,
          padding: "0 96px",
          background: PALETTE.cream,
          color: PALETTE.ink,
        }}
      >
        <LogoMark size={360} title={null} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>Love My Plants</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, marginTop: 20, letterSpacing: -2 }}>
            Snap a photo. Know what your plant needs.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
