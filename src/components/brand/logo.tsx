import { LogoMark } from "./marks";
import { Sun } from "./sun";

const NAME = "I Love My Plants";

/**
 * The 4-square mark, optionally with the name: beside it with a turning sun (header, footer),
 * or centred underneath, also with the sun (sign-in pages).
 */
export function Logo({
  size = 40,
  withName = false,
  stacked = false,
  compactOnPhone = false,
}: {
  size?: number;
  withName?: boolean;
  stacked?: boolean;
  /** Hide the name on narrow phones, where the 4 squares already spell it (busy headers). */
  compactOnPhone?: boolean;
}) {
  if (stacked) {
    return (
      <span className="inline-flex flex-col items-center gap-3">
        <LogoMark size={size} title={null} />
        <span className="inline-flex items-center gap-2">
          <span className="font-display text-2xl font-bold tracking-tight">{NAME}</span>
          <Sun size={30} />
        </span>
      </span>
    );
  }
  if (!withName) return <LogoMark size={size} />;
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} title={null} />
      <span className={`font-display text-xl font-bold tracking-tight ${compactOnPhone ? "hidden sm:inline" : ""}`}>{NAME}</span>
      <Sun size={Math.round(size * 0.7)} />
    </span>
  );
}
