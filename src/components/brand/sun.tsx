import { PALETTE as C } from "./marks";

/** A small painted sun whose rays turn slowly. Decorative. */
export function Sun({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <g className="anim-spin" fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round">
        <path d="M20 2.5 V7 M20 33 V37.5 M2.5 20 H7 M33 20 H37.5 M7.6 7.6 L10.8 10.8 M29.2 29.2 L32.4 32.4 M32.4 7.6 L29.2 10.8 M10.8 29.2 L7.6 32.4" />
      </g>
      <circle cx="21" cy="21" r="9" fill={C.butter} />
      <circle cx="20" cy="20" r="8.6" fill="none" stroke={C.ink} strokeWidth={2.4} />
    </svg>
  );
}
