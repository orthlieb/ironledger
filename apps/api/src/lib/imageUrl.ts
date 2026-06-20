/**
 * Image-URL validation — narrows the attack surface on user-supplied portraits
 * (Community / NPC / Expedition `imageUrl`, Character `data.portrait`).
 *
 * These fields live inside free-form `z.record(z.unknown())` payloads, so they
 * are untyped at the schema layer. A malicious client could post javascript:,
 * file://, or massive base64 strings with SVG+<script>. Images render via
 * <img src=...> so script execution is largely blocked by browsers, but
 * defense-in-depth says we should still refuse anything that isn't a recognised
 * image URL.
 *
 * Accept:
 *   data:image/(png|jpeg|webp|gif);base64,<chars>   up to ~1MB encoded
 *   https://<host>/<path>                           external URL
 * Reject everything else.
 */

export const MAX_IMAGE_DATA_URL_LEN = 1_200_000; // ~900KB decoded
const IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const HTTPS_URL_RE = /^https:\/\/[^\s<>"']+$/;

/** True when `s` is unset, a valid image data URL, or a bounded https URL. */
export function isValidImageUrl(s: unknown): boolean {
  if (typeof s !== 'string' || s.length === 0) return true; // unset is fine
  if (s.length > MAX_IMAGE_DATA_URL_LEN) return false;
  if (IMAGE_DATA_URL_RE.test(s)) return true;
  if (HTTPS_URL_RE.test(s) && s.length <= 2048) return true;
  return false;
}

/** Validate the `imageUrl` field on each item; returns an error string naming
 *  the first offender, or null when every item is clean. */
export function assertImageUrls(
  items: Array<Record<string, unknown>>,
  kind: string,
): string | null {
  for (let i = 0; i < items.length; i++) {
    const url = items[i]?.imageUrl;
    if (url === undefined || url === null) continue;
    if (!isValidImageUrl(url)) {
      return `${kind}[${i}].imageUrl is not a valid image data URL or https URL (or exceeds size cap)`;
    }
  }
  return null;
}
