import { ImageResponse } from "next/og";
import { LogoMark, PALETTE } from "@/components/brand/marks";

const SIZES = new Set([180, 192, 512]);

// App icons rendered on demand: the 4-square logo on cream paper.
export async function GET(request: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  // Maskable icons get cropped to a circle, so keep the logo inside the safe zone.
  const mark = Math.round(size * (maskable ? 0.62 : 0.8));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PALETTE.cream,
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        <LogoMark size={mark} title={null} />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
