// Which photos can be a plant's picture, and which are only pictures (not check-ins).

/** Photo kinds that make a good picture (not soil close-ups or window shots). */
export const PICTURE_KINDS = ["whole", "checkin", "cover", "stock", "cutout"] as const;

/** Photos added only as the plant's picture. They don't count as a weekly check-in. */
export const PICTURE_ONLY_KINDS = ["cover", "stock", "cutout"] as const;

/** The owner's own photos, which can have their background removed. */
export const CUTTABLE_KINDS = ["whole", "checkin", "cover"] as const;

// A cut-out (plant on a transparent background) is drawn whole on a soft backdrop instead of
// filling its frame. Its signed URL carries this marker, so every place that shows a picture
// can tell without passing the photo kind around. The fragment never reaches the server.
const CUTOUT_MARK = "#cutout";

/** The URL to show for a plant's picture. */
export function pictureUrl(signedUrl: string, kind: string): string {
  return kind === "cutout" ? `${signedUrl}${CUTOUT_MARK}` : signedUrl;
}

export function isCutout(url: string): boolean {
  return url.endsWith(CUTOUT_MARK);
}

/** PostgREST filter value for `.not("kind", "in", …)`. */
export const PICTURE_ONLY_FILTER = `(${PICTURE_ONLY_KINDS.join(",")})`;
