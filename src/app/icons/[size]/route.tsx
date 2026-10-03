import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

// App icons rendered on demand: a leaf on a green tile.
export async function GET(request: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Number((await ctx.params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  const leaf = Math.round(size * (maskable ? 0.5 : 0.62));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2f6b3f",
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        <svg width={leaf} height={leaf} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z"
            fill="#f7f5ef"
          />
          <path d="M5 19 14 10" stroke="#2f6b3f" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
