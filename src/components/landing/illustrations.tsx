// Hand-painted style scenes for the landing page: flat colour washes a little off the ink lines,
// and the lines run through a light displacement filter so they look brushed. All decorative.
import type { ReactNode } from "react";
import { PALETTE as C } from "@/components/brand/marks";

const line = { fill: "none", stroke: C.ink, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Filters shared by every scene on the page. Render once. */
export function PaintDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.4" />
        </filter>
        <filter id="wash" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="5" />
        </filter>
      </defs>
    </svg>
  );
}

function Scene({ viewBox = "0 0 200 150", paint, ink }: { viewBox?: string; paint: ReactNode; ink: ReactNode }) {
  return (
    <svg viewBox={viewBox} aria-hidden className="h-full w-full">
      <Painted paint={paint} ink={ink} />
    </svg>
  );
}

const leaf = (d: string) => <path d={d} fill={C.sage} />;

/** Paint and ink for one part of a scene, so parts can move independently. */
function Painted({ paint, ink }: { paint: ReactNode; ink: ReactNode }) {
  return (
    <>
      <g filter="url(#wash)" transform="translate(2.5 2)">{paint}</g>
      <g filter="url(#ink)" {...line}>{ink}</g>
    </>
  );
}

/** A pepper plant in a terracotta pot (Sunny Spice, the first plant in the app), swaying gently. */
export function HeroPlant() {
  return (
    <svg viewBox="0 0 320 320" aria-hidden className="h-full w-full">
      <Painted paint={<circle cx="212" cy="112" r="74" fill={C.butter} />} ink={null} />
      <g className="anim-sway">
        <Painted
          paint={
            <>
              {leaf("M140 120 C120 118 100 100 98 80 C118 80 136 96 140 120 Z")}
              {leaf("M210 100 C214 80 232 64 254 62 C252 84 232 100 210 100 Z")}
              {leaf("M166 192 C148 196 128 192 118 180 C138 172 158 178 166 192 Z")}
              {leaf("M174 190 C192 194 212 188 222 176 C204 168 184 174 174 190 Z")}
              <path d="M202 122 C212 126 218 140 214 156 C206 148 200 136 202 122 Z" fill={C.pepper} />
              <path d="M152 138 C143 144 139 156 142 168 C150 161 154 150 152 138 Z" fill={C.pepper} />
            </>
          }
          ink={
            <>
              <path d="M170 198 C168 170 160 150 140 120 M170 198 C172 162 186 132 210 100 M170 198 C170 170 172 140 168 92" />
              <path d="M140 120 C120 118 100 100 98 80 C118 80 136 96 140 120 Z M140 120 C128 108 112 94 100 82" />
              <path d="M210 100 C214 80 232 64 254 62 C252 84 232 100 210 100 Z M210 100 C222 86 238 72 252 64" />
              <path d="M166 192 C148 196 128 192 118 180 C138 172 158 178 166 192 Z M166 192 C150 186 134 182 122 180" />
              <path d="M174 190 C192 194 212 188 222 176 C204 168 184 174 174 190 Z M174 190 C190 184 206 180 218 177" />
              <path d="M200 120 C210 124 216 138 212 154 C204 146 198 134 200 120 Z M200 120 L196 113" />
              <path d="M150 136 C141 142 137 154 140 166 C148 159 152 148 150 136 Z M150 136 L155 129" />
            </>
          }
        />
        {/* the heart-shaped top leaf nods a little on its own */}
        <g className="anim-nod">
          <Painted
            paint={leaf("M168 92 C150 82 140 64 146 50 C152 40 164 42 168 54 C172 42 184 40 190 50 C196 64 186 82 168 92 Z")}
            ink={<path d="M168 92 C150 82 140 64 146 50 C152 40 164 42 168 54 C172 42 184 40 190 50 C196 64 186 82 168 92 Z M168 90 V60" />}
          />
        </g>
      </g>
      <Painted
        paint={
          <>
            <path d="M116 216 L224 216 L210 300 L130 300 Z" fill={C.terracotta} />
            <path d="M106 198 H234 V218 H106 Z" fill={C.terracotta} />
          </>
        }
        ink={
          <>
            <path d="M106 198 C150 196 192 196 234 198 L233 217 C190 219 150 219 107 217 Z" />
            <path d="M116 218 L130 300 C156 302 186 302 210 300 L224 218" />
            <path d="M140 250 C152 254 164 248 174 254 C186 260 196 252 206 256" strokeWidth={1.8} />
          </>
        }
      />
      <g className="anim-heart">
        <Painted
          paint={<path d="M268 42 C262 36 256 38 256 44 C256 50 264 54 268 60 C272 54 280 50 280 44 C280 38 274 36 268 42 Z" fill={C.pepper} />}
          ink={<path d="M268 42 C262 36 256 38 256 44 C256 50 264 54 268 60 C272 54 280 50 280 44 C280 38 274 36 268 42 Z" />}
        />
      </g>
    </svg>
  );
}

/** A big painted heart that beats softly (closing call to action). */
export function BeatingHeart({ className = "" }: { className?: string }) {
  const d = "M60 100 C34 84 14 66 16 44 C18 28 32 20 44 24 C52 27 57 33 60 40 C63 33 69 26 78 24 C90 21 104 30 104 46 C104 68 84 84 60 100 Z";
  return (
    <svg viewBox="0 0 120 116" aria-hidden className={className}>
      <g className="anim-beat">
        <Painted
          paint={<path d={d} fill={C.pepper} />}
          ink={
            <>
              <path d={d} strokeWidth={3.2} />
              <path d="M34 40 C36 34 40 31 45 31" strokeWidth={3} stroke={C.paper} />
            </>
          }
        />
      </g>
    </svg>
  );
}

/** Photo health check: a phone framing a leaf. */
export function SnapScene() {
  return (
    <Scene
      viewBox="22 4 156 132"
      paint={
        <>
          <rect x="68" y="16" width="64" height="116" rx="12" fill={C.paper} />
          {leaf("M100 104 C82 100 74 80 82 58 C100 64 108 84 100 104 Z")}
        </>
      }
      ink={
        <>
          <rect x="66" y="14" width="64" height="116" rx="12" />
          <circle cx="98" cy="25" r="2" />
          <path d="M80 42 V36 H86 M110 36 H116 V42 M116 108 V114 H110 M86 114 H80 V108" strokeWidth={2} />
          <path d="M98 102 C80 98 72 78 80 56 C98 62 106 82 98 102 Z M98 102 C92 88 86 72 81 58" />
          <path d="M150 26 V44 M141 35 H159 M144 29 L156 41 M156 29 L144 41" strokeWidth={2.2} />
          <path d="M40 104 V116 M34 110 H46" strokeWidth={2} />
        </>
      }
    />
  );
}

/** Watering that learns: a can tipping drops onto a sprout, with a little sun. */
export function WaterScene() {
  return (
    <Scene
      paint={
        <>
          <circle cx="40" cy="34" r="15" fill={C.butter} />
          <path d="M56 74 L118 74 L112 124 L62 124 Z" fill={C.terracotta} />
          <path d="M164 84 C167 90 167 94 164 96 C161 94 161 90 164 84 Z" fill={C.lavender} />
          <path d="M174 98 C177 104 177 108 174 110 C171 108 171 104 174 98 Z" fill={C.lavender} />
          <path d="M160 104 C163 110 163 114 160 116 C157 114 157 110 160 104 Z" fill={C.lavender} />
          {leaf("M168 128 C160 128 154 122 154 116 C162 116 168 122 168 128 Z")}
          {leaf("M168 124 C176 124 182 118 182 112 C174 112 168 118 168 124 Z")}
        </>
      }
      ink={
        <>
          <circle cx="38" cy="32" r="14" />
          <path d="M38 8 V12 M38 52 V56 M14 32 H18 M58 32 H62 M21 15 L24 18 M52 46 L55 49 M55 15 L52 18" strokeWidth={2} />
          <path d="M54 72 C74 70 96 70 116 72 L110 122 C94 124 78 124 60 122 Z" />
          <path d="M60 80 C36 80 34 116 60 114" />
          <path d="M114 92 L150 70 M146 64 L158 78" strokeWidth={3} />
          <path d="M162 82 C165 88 165 92 162 94 C159 92 159 88 162 82 Z M172 96 C175 102 175 106 172 108 C169 106 169 102 172 96 Z M158 102 C161 108 161 112 158 114 C155 112 155 108 158 102 Z" strokeWidth={1.8} />
          <path d="M166 140 V118 M166 128 C158 128 152 122 152 116 C160 116 166 122 166 128 M166 124 C174 124 180 118 180 112 C172 112 166 118 166 124" />
          <path d="M136 140 H196" strokeWidth={2} />
        </>
      }
    />
  );
}

/** Repot plan and time-lapse: three pots, each plant a little bigger. */
export function GrowScene() {
  const pot = (x: number, w: number, h: number) => `M${x} ${130 - h} L${x + w} ${130 - h} L${x + w - w * 0.14} 130 L${x + w * 0.14} 130 Z`;
  return (
    <Scene
      paint={
        <>
          <path d={pot(22, 30, 24)} fill={C.terracotta} />
          <path d={pot(74, 42, 32)} fill={C.terracotta} />
          <path d={pot(136, 54, 42)} fill={C.terracotta} />
          {leaf("M37 104 C30 102 27 96 28 90 C34 92 37 98 37 104 Z")}
          {leaf("M95 96 C84 94 78 84 80 74 C90 78 95 86 95 96 Z")}
          {leaf("M96 92 C104 88 110 78 108 68 C100 72 96 82 96 92 Z")}
          {leaf("M163 86 C148 84 138 70 140 54 C154 58 163 72 163 86 Z")}
          {leaf("M164 80 C176 74 186 60 184 44 C172 50 164 64 164 80 Z")}
          {leaf("M163 66 C160 52 162 38 170 28 C176 40 172 56 163 66 Z")}
        </>
      }
      ink={
        <>
          <path d={pot(20, 30, 24)} />
          <path d={pot(72, 42, 32)} />
          <path d={pot(134, 54, 42)} />
          <path d="M35 106 V94 M35 104 C28 102 25 96 26 90 C32 92 35 98 35 104" />
          <path d="M93 98 V70 M93 96 C82 94 76 84 78 74 C88 78 93 86 93 96 M94 92 C102 88 108 78 106 68 C98 72 94 82 94 92" />
          <path d="M161 88 V34 M161 86 C146 84 136 70 138 54 C152 58 161 72 161 86 M162 80 C174 74 184 60 182 44 C170 50 162 64 162 80 M161 66 C158 52 160 38 168 28 C174 40 170 56 161 66" />
          <path d="M8 132 H194" strokeWidth={2} />
          <path d="M56 22 C76 14 100 14 120 22 M114 16 L120 22 L113 27" strokeWidth={2} strokeDasharray="1 6" />
        </>
      }
    />
  );
}

/** Plant ER: a drooping plant with a plaster, and a first-aid cross. */
export function RescueScene() {
  return (
    <Scene
      paint={
        <>
          <path d="M34 28 H46 V16 H58 V28 H70 V40 H58 V52 H46 V40 H34 Z" fill={C.paper} />
          <path d="M80 96 L136 96 L128 134 L88 134 Z" fill={C.paper} />
          {leaf("M128 62 C142 66 146 84 140 100 C130 90 125 76 128 62 Z")}
          {leaf("M106 80 C92 82 82 94 82 108 C96 104 104 94 106 80 Z")}
          <rect x="94" y="104" width="34" height="12" rx="6" transform="rotate(-18 111 110)" fill={C.butter} />
        </>
      }
      ink={
        <>
          <path d="M32 26 H44 V14 H56 V26 H68 V38 H56 V50 H44 V38 H32 Z" />
          <path d="M78 94 C96 92 116 92 134 94 L126 132 C112 134 100 134 86 132 Z" />
          <path d="M106 94 C104 78 108 64 126 60" />
          <path d="M126 60 C140 64 144 82 138 98 C128 88 123 74 126 60 Z M126 62 C132 72 135 84 137 94" />
          <path d="M106 80 C92 82 82 94 82 108 C96 104 104 94 106 80 Z" />
          <rect x="92" y="102" width="34" height="12" rx="6" transform="rotate(-18 109 108)" />
          <path d="M106 106 L106.5 106.5 M110 104.5 L110.5 105 M112 109 L112.5 109.5" strokeWidth={2.4} />
          <path d="M150 112 C152 118 156 120 158 120 M164 98 C166 104 170 106 172 106" strokeWidth={2} />
        </>
      }
    />
  );
}

/** Vacation prep and sitter link: a suitcase, a waiting plant, a paper plane on its way. */
export function AwayScene() {
  return (
    <Scene
      paint={
        <>
          <rect x="34" y="62" width="88" height="66" rx="9" fill={C.terracotta} />
          <path d="M140 108 L176 108 L172 132 L144 132 Z" fill={C.paper} />
          {leaf("M158 102 C148 100 142 92 142 82 C152 84 158 92 158 102 Z")}
          {leaf("M159 96 C168 94 174 86 174 76 C165 78 159 86 159 96 Z")}
          <path d="M150 30 L182 18 L170 46 L164 36 Z" fill={C.paper} />
        </>
      }
      ink={
        <>
          <rect x="32" y="60" width="88" height="66" rx="9" />
          <path d="M62 60 V48 C62 44 64 42 68 42 H84 C88 42 90 44 90 48 V60" />
          <path d="M54 62 V124 M98 62 V124" strokeWidth={2} />
          <path d="M138 106 C150 105 164 105 176 106 L170 130 C160 131 152 131 142 130 Z" />
          <path d="M157 106 V80 M157 100 C147 98 141 90 141 80 C151 82 157 90 157 100 M158 94 C167 92 173 84 173 74 C164 76 158 84 158 94" />
          <path d="M148 28 L180 16 L168 44 L162 34 Z M162 34 L180 16" />
          <path d="M146 32 C120 40 104 30 88 36" strokeWidth={2} strokeDasharray="1 6" />
          <path d="M20 128 H190" strokeWidth={2} />
        </>
      }
    />
  );
}

/** Plant Buddy on Telegram: a chat bubble with a leaf, and a reply on its way. */
export function BuddyScene() {
  return (
    <Scene
      paint={
        <>
          <path d="M28 24 H132 C140 24 144 28 144 36 V82 C144 90 140 94 132 94 H72 L50 112 L54 94 H40 C32 94 28 90 28 82 Z" fill={C.sage} />
          <path d="M112 102 H166 C172 102 176 106 176 112 V128 C176 134 172 138 166 138 H158 L162 148 L146 138 H112 C106 138 102 134 102 128 V112 C102 106 106 102 112 102 Z" fill={C.lavender} />
          <path d="M62 80 C52 74 50 58 58 46 C68 54 70 70 62 80 Z" fill={C.paper} />
        </>
      }
      ink={
        <>
          <path d="M26 22 H130 C138 22 142 26 142 34 V80 C142 88 138 92 130 92 H70 L48 110 L52 92 H38 C30 92 26 88 26 80 Z" />
          <path d="M60 78 C50 72 48 56 56 44 C66 52 68 68 60 78 Z M60 78 C58 66 58 56 56 46" />
          <path d="M80 44 H124 M80 58 H116 M80 72 H104" strokeWidth={2.2} />
          <path d="M110 100 H164 C170 100 174 104 174 110 V126 C174 132 170 136 164 136 H156 L160 146 L144 136 H110 C104 136 100 132 100 126 V110 C100 104 104 100 110 100 Z" />
          <path d="M122 118 L122.5 118.5 M137 118 L137.5 118.5 M152 118 L152.5 118.5" strokeWidth={4} />
        </>
      }
    />
  );
}
