/**
 * True if `origin` is a local development origin.
 * Accepts `null` for convenience so callers don't have to nullcheck.
 */
export function isLocalhost(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1]?|0\.0\.0\.0)(:|\/|$)/i.test(
    origin
  );
}
