// Free species photos from Wikimedia Commons: name handling and credits (no network here).

export type PhotoCredit = {
  /** Photographer as plain text, e.g. "Dinkum". */
  author: string | null;
  /** Short licence name, e.g. "CC BY-SA 4.0" or "Public domain". */
  license: string | null;
  /** The file's page on Wikimedia Commons, with full licence details. */
  sourceUrl: string;
};

/** Commons file titles look like "File:Monstera deliciosa2.jpg". */
export const FILE_TITLE = /^File:[^\n/\\]{1,240}\.(jpe?g|png|webp)$/i;

/**
 * Names to search for, most specific first:
 * "Goeppertia lancifolia (syn. Calathea lancifolia)" → ["Goeppertia lancifolia", "Calathea lancifolia"].
 */
export function speciesSearchNames(speciesName: string): string[] {
  const names: string[] = [];
  const add = (s: string) => {
    const name = s.replace(/\b(syn|aka|also)\.?\s*/gi, "").replace(/\s+/g, " ").trim();
    if (name.length >= 3 && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  };
  add(speciesName.replace(/\(.*?\)/g, ""));
  for (const m of speciesName.matchAll(/\(([^)]*)\)/g)) m[1].split(/[,;/]/).forEach(add);
  return names.slice(0, 3);
}

/** Commons metadata is HTML ("<a href=…>Cary Bass</a>"); the app shows plain text. */
export function plainText(html: string | null | undefined, max = 80): string | null {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\(\s*talk\s*\)/gi, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** "Photo: Dinkum · CC0" */
export function creditLine(credit: PhotoCredit): string {
  return ["Photo", credit.author ? `: ${credit.author}` : "", credit.license ? ` · ${credit.license}` : ""].join("");
}
