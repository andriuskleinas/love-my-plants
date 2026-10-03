// One-time connect codes for linking a messenger chat to an account.

// No 0/O, 1/I/L: the code may be typed by hand. 31^8 ≈ 8.5e11 combinations, single-use, 15 minutes.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** "k7mp-3xq2 " → "K7MP3XQ2"; null if it can't be a code. */
export function normalizeLinkCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** "K7MP3XQ2" → "K7MP-3XQ2" for display. */
export const formatLinkCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
