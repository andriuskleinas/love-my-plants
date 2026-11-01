import { isCutout } from "@/lib/plants/pictures";

/**
 * A plant's picture. Photos fill the frame; a cut-out (plant without its background) is shown
 * whole on a soft backdrop, like a catalog photo. `className` sets the size and rounding.
 */
export function PlantPicture({ url, className = "", alt = "" }: { url: string; className?: string; alt?: string }) {
  if (!isCutout(url)) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
    return <img src={url} alt={alt} className={`object-cover ${className}`} />;
  }
  return (
    <span className={`block overflow-hidden bg-leaf-soft ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      <img src={url} alt={alt} className="h-full w-full object-contain p-[7%] drop-shadow-[0_6px_8px_rgb(0_0_0/0.18)]" />
    </span>
  );
}
