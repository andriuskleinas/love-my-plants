import "server-only";
import { FILE_TITLE, plainText, speciesSearchNames, type PhotoCredit } from "./stock-photos";

// Free species photos from Wikimedia Commons, fetched by the server so the owner's
// browser never talks to Wikimedia. Each photo keeps its author and licence for the credit.

const USER_AGENT = "LoveMyPlants/1.0 (https://love-my-plants.vercel.app)";
const IMAGE_HOSTS = new Set(["thumb.wikimedia.org", "upload.wikimedia.org"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** The photo bucket's limit. */
const MAX_BYTES = 5 * 1024 * 1024;
const CANDIDATES = 8;
/** A standard Commons thumbnail width, so it's served from cache. */
const PREVIEW_WIDTH = 330;
const SAVED_WIDTH = 1280;

export type StockCandidate = { file: string; preview: string; credit: PhotoCredit };

type ImageInfo = {
  title: string;
  info: { thumburl?: string; descriptionurl: string; mime: string; extmetadata?: Record<string, { value?: string }> };
};

async function getJson<T>(url: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${url}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`wikimedia ${res.status}`);
  return res.json() as Promise<T>;
}

/** The free lead photo of the species' English Wikipedia article, if it has one. */
async function leadPhoto(name: string): Promise<string | null> {
  const data = await getJson<{ query?: { pages?: { pageimage?: string }[] } }>("https://en.wikipedia.org/w/api.php", {
    action: "query",
    redirects: "1",
    prop: "pageimages",
    piprop: "name",
    pilicense: "free",
    titles: name,
  });
  const file = data.query?.pages?.[0]?.pageimage;
  return file ? `File:${file.replace(/_/g, " ")}` : null;
}

async function searchFiles(name: string): Promise<string[]> {
  const data = await getJson<{ query?: { search?: { title: string }[] } }>("https://commons.wikimedia.org/w/api.php", {
    action: "query",
    list: "search",
    srnamespace: "6",
    srsearch: `"${name.replace(/"/g, "")}" filetype:bitmap`,
    srlimit: String(CANDIDATES),
  });
  return (data.query?.search ?? []).map((s) => s.title);
}

async function imageInfo(titles: string[], width: number): Promise<ImageInfo[]> {
  const data = await getJson<{
    query?: { pages?: { title: string; missing?: boolean; imageinfo?: ImageInfo["info"][] }[] };
  }>("https://commons.wikimedia.org/w/api.php", {
    action: "query",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: String(width),
    iiextmetadatafilter: "Artist|LicenseShortName",
  });
  const byTitle = new Map(
    (data.query?.pages ?? []).filter((p) => !p.missing && p.imageinfo?.[0]).map((p) => [p.title, { title: p.title, info: p.imageinfo![0] }]),
  );
  // Keep the order we asked in: the Wikipedia lead photo first, then search results.
  return titles.map((t) => byTitle.get(t)).filter((x): x is ImageInfo => !!x && IMAGE_TYPES.has(x.info.mime) && !!x.info.thumburl);
}

function creditOf({ info }: ImageInfo): PhotoCredit {
  const meta = info.extmetadata ?? {};
  return {
    author: plainText(meta.Artist?.value),
    license: plainText(meta.LicenseShortName?.value, 40),
    sourceUrl: info.descriptionurl,
  };
}

async function download(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !IMAGE_HOSTS.has(parsed.hostname)) throw new Error(`unexpected image host ${parsed.hostname}`);
  const res = await fetch(parsed, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000), redirect: "error" });
  const contentType = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!res.ok || !IMAGE_TYPES.has(contentType)) throw new Error(`image ${res.status} ${contentType}`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("image too large");
  return { bytes, contentType };
}

/** Up to 8 species photos to choose from, as small inline previews. Empty when nothing was found. */
export async function findStockPhotos(speciesName: string): Promise<StockCandidate[]> {
  const names = speciesSearchNames(speciesName);
  const found = await Promise.all(names.map(async (n) => [await leadPhoto(n).catch(() => null), ...(await searchFiles(n))]));
  const titles = [...new Set(found.flat().filter((t): t is string => !!t && FILE_TITLE.test(t)))].slice(0, CANDIDATES);
  if (!titles.length) return [];

  const infos = await imageInfo(titles, PREVIEW_WIDTH);
  const previews = await Promise.all(
    infos.map(async (i) => {
      try {
        const { bytes, contentType } = await download(i.info.thumburl!);
        return { file: i.title, preview: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`, credit: creditOf(i) };
      } catch {
        return null;
      }
    }),
  );
  return previews.filter((p): p is StockCandidate => !!p);
}

/** The chosen photo at a size fit for the plant page, with a fresh credit from Commons. */
export async function fetchStockPhoto(file: string): Promise<{ bytes: ArrayBuffer; contentType: string; credit: PhotoCredit } | null> {
  if (!FILE_TITLE.test(file)) return null;
  const [info] = await imageInfo([file], SAVED_WIDTH);
  if (!info) return null;
  return { ...(await download(info.info.thumburl!)), credit: creditOf(info) };
}
