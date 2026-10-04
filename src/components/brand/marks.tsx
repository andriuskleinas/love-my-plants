// The 4-square logo (I · heart / My · plant) as plain SVG: no filters, no fonts, no CSS classes,
// so the same markup renders in the browser and in next/og icons and previews.

export const PALETTE = {
  cream: "#f6f1e4",
  paper: "#fffaf0",
  sand: "#e9dcc0",
  sage: "#8fa877",
  sageDeep: "#6f8c5a",
  terracotta: "#d9805f",
  pepper: "#c94f3d",
  lavender: "#a9a6ee",
  butter: "#f2d98b",
  ink: "#1d1d1b",
} as const;

const ink = { fill: "none", stroke: PALETTE.ink, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// A slightly uneven rounded square (46×46 at the origin) so the tiles look cut from paper.
const TILE =
  "M7 1 C19 -0.5 33 0.5 40 1 C44.5 1.4 46.4 4 46 9 C45.4 20 46.5 33 45.6 40 C45.2 44.6 42.3 46.4 37 46 C26 45.2 13 46.5 6 45.6 C1.6 45.1 -0.3 42 0.4 37 C1 26 -0.4 14 0.5 7 C1 3 3.4 1.2 7 1 Z";

export function LogoMark({ size = 40, title = "Love My Plants" }: { size?: number; title?: string | null }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
    >
      <path d={TILE} transform="translate(2 2)" fill={PALETTE.sage} />
      <path d={TILE} transform="translate(52 2)" fill={PALETTE.terracotta} />
      <path d={TILE} transform="translate(2 52)" fill={PALETTE.sand} />
      <path d={TILE} transform="translate(52 52)" fill={PALETTE.butter} />

      {/* I */}
      <path d="M17.5 13.8 Q25 12.6 32.5 14.2 M25.2 14 Q24.4 25 25.4 36.4 M17 36.6 Q25 35.4 33 37" strokeWidth={4.2} {...ink} />

      {/* heart: a cream wash a little off the ink line, like paint missing the outline */}
      <path
        d="M76.5 38.5 C67 32.5 60.5 26 61.5 19 C62.5 14 67.5 12 71.5 14 C74 15 75.5 17 76.5 19 C77.5 17 79.5 14.5 82.5 13.8 C87 13 91.5 16 91.5 21 C91.5 28 84.5 33 76.5 38.5 Z"
        fill={PALETTE.cream}
      />
      <path
        d="M75 37 C66 31 59 25 60 18 C61 13 66 11 70 13 C72.5 14 74 16 75 18 C76 16 78 13.5 81 12.8 C85.5 12 90 15 90 20 C90 27 83 32 75 37 Z"
        strokeWidth={3.2}
        {...ink}
      />

      {/* My */}
      <path d="M10 85.5 L12.2 66.5 L18.4 79 L24.4 66.2 L26.2 85.8" strokeWidth={3.8} {...ink} />
      <path d="M30.2 71.8 Q32.4 78 34.6 81.4 M39.8 71.4 Q36 82 33.4 89.4 Q31.6 93.4 28.4 92" strokeWidth={3.6} {...ink} />

      {/* potted plant */}
      <path d="M64.5 75.5 C71 74.6 79 74.8 86.5 75.6 L83.8 93 C78 93.8 72 93.6 67.2 92.8 Z" fill={PALETTE.terracotta} />
      <path d="M63.5 74.5 C71 73.6 79 73.8 87 74.6 M65 75 L67.6 92.4 C72 93.2 78 93.3 83.4 92.6 L86 75.2" strokeWidth={2.8} {...ink} />
      <path d="M76.4 69.6 C70.6 69.8 65.4 65.6 64.4 59.6 C70.6 58.8 75.4 62.8 76.4 69.6 Z" fill={PALETTE.sage} />
      <path d="M76.4 63.8 C81.6 63.6 87.4 59.6 88.4 53.6 C82.4 53.2 77.6 57.6 76.4 63.8 Z" fill={PALETTE.sage} />
      <path
        d="M75 74 C75.2 68 74.6 63 75.4 57 M75 68 C69 68 64 64 63 58 C69 57 74 61 75 68 Z M75.2 62.6 C80 62.6 86 58.6 87 52.6 C81 52.1 76.2 56.6 75.2 62.6 Z"
        strokeWidth={2.6}
        {...ink}
      />
    </svg>
  );
}
