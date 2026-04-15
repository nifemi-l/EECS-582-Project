/* PROLOGUE
File name: hexColor.ts
Description: Normalize and validate CSS hex colors for room band accents.
Programmer: Nifemi Lawal
Creation date: 4/14/26
*/

/** Strip and expand #RGB → #RRGGBB; returns null if invalid. */
export function normalizeHexColor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let body = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]+$/.test(body)) return null;
  if (body.length === 3) {
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (body.length !== 6) return null;
  return `#${body.toLowerCase()}`;
}

function channelToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** sRGB relative luminance in [0, 1]. */
export function hexRelativeLuminance(hex: string): number {
  const n = normalizeHexColor(hex);
  if (!n) return 0;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  const R = channelToLinear(r);
  const G = channelToLinear(g);
  const B = channelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG relative contrast between two sRGB hex colors (normalized). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = normalizeHexColor(hexA);
  const b = normalizeHexColor(hexB);
  if (!a || !b) return 1;
  const la = hexRelativeLuminance(a);
  const lb = hexRelativeLuminance(b);
  const Lmax = Math.max(la, lb);
  const Lmin = Math.min(la, lb);
  return (Lmax + 0.05) / (Lmin + 0.05);
}

const PROBE_NEAR_WHITE = "#ffffff";
const PROBE_NEAR_BLACK = "#0f172a";

/**
 * True when the band should use a light (white-ish) header foreground for readability.
 * Picks by contrast vs. white and vs. dark body text; favors white on saturated mid/dark colors.
 */
export function prefersLightForegroundOnBand(hex: string): boolean {
  const n = normalizeHexColor(hex);
  if (!n) return true;
  const rw = contrastRatio(PROBE_NEAR_WHITE, n);
  const rd = contrastRatio(PROBE_NEAR_BLACK, n);
  if (rw >= 4.5 && rd < 4.5) return true;
  if (rd >= 4.5 && rw < 4.5) return false;
  return rw >= rd;
}

/** @deprecated Prefer prefersLightForegroundOnBand for UI; kept for simple luminance checks. */
export function isLightBandHex(hex: string): boolean {
  return hexRelativeLuminance(hex) > 0.62;
}
