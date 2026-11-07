import { createHash, timingSafeEqual } from "node:crypto";

/** Bandingkan header Authorization dengan Bearer secret tanpa membocorkan panjangnya. */
export function bearerMatches(header: string | null, secret: string) {
  const actual = createHash("sha256").update(header ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(actual, expected);
}
