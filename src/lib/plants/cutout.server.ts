import "server-only";

// Cuts a plant out of its photo with remove.bg. Kept in one place so another service can
// replace it easily (remove.bg moves to Leonardo.Ai from 1 December 2026).

export type CutoutFailure = "not_configured" | "no_credits" | "no_subject" | "failed";

export class CutoutError extends Error {
  constructor(readonly reason: CutoutFailure, detail: string) {
    super(detail);
  }
}

export const cutoutConfigured = () => !!process.env.REMOVE_BG_API_KEY;

/** A transparent PNG of the plant and pot, cropped to them with a small margin. */
export async function removeBackground(image: Blob): Promise<ArrayBuffer> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) throw new CutoutError("not_configured", "REMOVE_BG_API_KEY is not set");

  const form = new FormData();
  form.set("image_file", image, "plant.jpg");
  // "preview" (up to 0.25 megapixels) is what the free plan covers; plenty for the plant list.
  form.set("size", "preview");
  form.set("format", "png");
  form.set("crop", "true");
  form.set("crop_margin", "4%");

  let res: Response;
  try {
    res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new CutoutError("failed", `remove.bg unreachable: ${error}`);
  }
  if (res.ok && res.headers.get("content-type")?.startsWith("image/png")) return res.arrayBuffer();

  const body = await res.text().catch(() => "");
  const detail = `remove.bg ${res.status}: ${body.slice(0, 300)}`;
  if (res.status === 402) throw new CutoutError("no_credits", detail);
  if (res.status === 400 && /foreground/i.test(body)) throw new CutoutError("no_subject", detail);
  throw new CutoutError("failed", detail);
}
