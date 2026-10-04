// "How it works" as a short looping animation: a hand photographs a plant, the app checks it,
// shows the report with three steps, then a watering nudge arrives. Timing lives in globals.css
// (.demo-*); with reduced motion it rests on the report.
import { PALETTE as C } from "@/components/brand/marks";

const SKIN = "#eab896";
const ink = { fill: "none", stroke: C.ink, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const text = { fill: C.ink, fontFamily: "inherit" } as const;

function MiniPlant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 22 L14 22 L10 44 L-10 44 Z" fill={C.terracotta} />
      <path d="M0 22 C-2 10 -6 2 -16 -6 C-18 4 -10 14 0 22 Z M0 18 C4 6 10 -2 20 -6 C20 6 12 14 0 18 Z M0 22 V-14 M0 -14 C-8 -18 -10 -26 -6 -32 C-2 -28 0 -22 0 -14 C2 -22 6 -28 10 -30 C12 -24 8 -16 0 -14" fill={C.sage} stroke={C.ink} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M-14 22 L14 22 L10 44 L-10 44 Z" {...ink} strokeWidth={1.8} />
    </g>
  );
}

function Check({ y, color, label, n }: { y: number; color: string; label: string; n: number }) {
  return (
    <g className={`demo-row demo-row${n}`}>
      <circle cx="222" cy={y} r="8" fill={color} />
      <path d={`M218 ${y} L221 ${y + 3} L227 ${y - 4}`} {...ink} strokeWidth={2} />
      <text x="236" y={y + 3.5} fontSize="10.5" {...text}>
        {label}
      </text>
    </g>
  );
}

export function CareDemo() {
  return (
    <svg
      viewBox="0 0 400 320"
      role="img"
      aria-label="A hand takes a photo of a plant with a phone. The app checks the plant, shows a health score and three care steps, then sends a reminder to water it."
      className="h-full w-full"
    >
      {/* the plant on the windowsill */}
      <g filter="url(#wash)" transform="translate(2.5 2)">
        <rect x="18" y="292" width="170" height="10" rx="4" fill={C.paper} />
      </g>
      <g className="anim-sway">
        <MiniPlant x={100} y={200} s={2.1} />
      </g>
      <path d="M14 292 H192" {...ink} filter="url(#ink)" />

      {/* hand + phone */}
      <g className="demo-phone">
        <path d="M188 200 C176 244 196 296 236 320 L352 320 L374 252 C376 214 368 190 356 180 Z" fill={SKIN} />
        <path d="M224 306 L360 294 L366 320 L220 320 Z" fill={C.lavender} />
        <path d="M224 306 L360 294" {...ink} />

        <rect x="192" y="20" width="172" height="280" rx="22" fill={C.paper} />
        <g filter="url(#ink)">
          <rect x="190" y="18" width="172" height="280" rx="22" {...ink} />
          <path d="M262 30 H290" {...ink} strokeWidth={3} />
        </g>

        {/* fingers round the right edge, thumb over the left */}
        <path d="M356 112 C374 110 378 132 358 134 M356 140 C376 138 380 160 358 162 M356 168 C374 167 376 188 356 190" fill={SKIN} stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M200 226 C180 220 172 242 186 254 C196 262 214 258 222 248 C214 240 208 232 200 226 Z" fill={SKIN} stroke={C.ink} strokeWidth={2.4} strokeLinejoin="round" />

        {/* 1 · viewfinder */}
        <g className="demo-a">
          <path d="M216 74 V62 H228 M322 62 H334 V74 M334 202 V214 H322 M228 214 H216 V202" {...ink} strokeWidth={2.2} />
          <MiniPlant x={275} y={130} s={1.6} />
          <circle cx="275" cy="256" r="14" fill={C.terracotta} />
          <circle cx="275" cy="256" r="14" {...ink} />
        </g>

        {/* 2 · checking */}
        <g className="demo-b">
          <rect x="214" y="56" width="122" height="104" rx="10" fill={C.sand} />
          <MiniPlant x={275} y={92} s={1.05} />
          <rect className="demo-scan" x="214" y="58" width="122" height="4" rx="2" fill={C.sageDeep} />
          <text x="275" y="190" fontSize="12" textAnchor="middle" fontWeight="600" {...text}>
            Checking your plant…
          </text>
          <text x="275" y="208" fontSize="10" textAnchor="middle" {...text} opacity={0.6}>
            leaves · soil · light · pests
          </text>
        </g>

        {/* 3 · report */}
        <g className="demo-c">
          <text x="212" y="64" fontSize="14" fontWeight="700" {...text}>
            Sunny Spice
          </text>
          <text x="212" y="84" fontSize="10" {...text} opacity={0.6}>
            Health
          </text>
          <rect x="212" y="90" width="128" height="9" rx="4.5" fill={C.sand} />
          <rect className="demo-bar" x="212" y="90" width="102" height="9" rx="4.5" fill={C.sage} />
          <text x="212" y="116" fontSize="10.5" fontWeight="600" {...text}>
            Good · 8/10
          </text>
          <text x="212" y="142" fontSize="10" {...text} opacity={0.6}>
            Today
          </text>
          <Check n={1} y={160} color={C.lavender} label="Water in 2 days" />
          <Check n={2} y={188} color={C.butter} label="Move closer to light" />
          <Check n={3} y={216} color={C.sage} label="Trim the yellow leaf" />
        </g>

        {/* 4 · nudge */}
        <g className="demo-d">
          <rect x="198" y="36" width="160" height="38" rx="12" fill={C.butter} />
          <rect x="198" y="36" width="160" height="38" rx="12" {...ink} strokeWidth={2.2} />
          <path d="M214 46 C218 52 220 56 214 62 C208 56 210 52 214 46 Z" fill={C.lavender} stroke={C.ink} strokeWidth={1.6} />
          <text x="226" y="52" fontSize="10.5" fontWeight="700" {...text}>
            Time to water
          </text>
          <text x="226" y="65" fontSize="10" {...text}>
            Sunny Spice is thirsty
          </text>
        </g>
      </g>

      <rect className="demo-flash" x="0" y="0" width="400" height="320" fill="#fff" />
    </svg>
  );
}
