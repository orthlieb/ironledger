/**
 * Foe portrait URL resolver + multi-image discovery.
 *
 * Naming:
 *   <slug>.webp         — the foe's primary portrait (e.g. bear.webp)
 *   <prefix>-<slug>.webp — named alternate     (e.g. azure-locus.webp)
 *   <slug>-<N>.webp      — numbered alternate  (e.g. bear-2.webp)
 *
 * <slug> is the foe's display name in kebab-case (lowercase, spaces → '-').
 * Matching is slug-suffix based, so multi-word foes whose slugs overlap
 * with shorter ones still resolve correctly (the build script prefers the
 * longest match).
 *
 * A build-time script (apps/web/scripts/build-foe-manifest.mjs) scans
 * static/foes/ and writes manifest.json mapping each slug to its list of
 * filenames. At runtime we fetch the manifest once and consult it for
 * every portrait request. If the manifest isn't available (e.g. local dev
 * before first build) we fall back to just <slug>.webp.
 */

function slug(name: string): string {
	return name.toLowerCase().replace(/\s+/g, '-');
}

export const UNKNOWN_FOE_PORTRAIT = '/foes/unknown-foe.webp';

// ---------------------------------------------------------------------------
// Manifest — { slug: [filename, …] }, primary first if it exists
// ---------------------------------------------------------------------------

type Manifest = Record<string, string[]>;

let manifest: Manifest | null = null;
let manifestPromise: Promise<Manifest> | null = null;

function fetchManifest(): Promise<Manifest> {
	if (manifest)        return Promise.resolve(manifest);
	if (manifestPromise) return manifestPromise;

	manifestPromise = (async () => {
		if (typeof fetch === 'undefined') return {} as Manifest;
		try {
			const res = await fetch('/foes/manifest.json', { cache: 'force-cache' });
			if (!res.ok) return {} as Manifest;
			const json = await res.json() as Manifest;
			manifest = json;
			return json;
		} catch {
			// Manifest missing (dev before first build, network error) — fall
			// through to the <slug>.webp convention in the URL helpers.
			manifest = {};
			return {};
		}
	})();
	return manifestPromise;
}

// Best-effort synchronous read after the first fetch has resolved. Callers
// that need guaranteed-resolved data should await `ensureManifest()` first.
function manifestSync(): Manifest | null {
	return manifest;
}

/** Force-load the manifest. Useful in load() functions or test setup. */
export async function ensureManifest(): Promise<void> {
	await fetchManifest();
}

// Kick off the fetch on module import so by the time components render
// the manifest is usually already in memory. No-op on SSR.
if (typeof window !== 'undefined') {
	void fetchManifest();
}

// ---------------------------------------------------------------------------
// Public URL helpers
// ---------------------------------------------------------------------------

/**
 * URL for a specific image in the foe's portrait sequence. `index` is
 * 0-based. If the manifest hasn't loaded yet (or doesn't include this foe)
 * we fall back to "/foes/<slug>.webp" for index 0, and the unknown-foe
 * placeholder for anything else.
 */
export function foePortraitUrl(name: string, index = 0): string {
	const s = slug(name);
	const m = manifestSync();
	const files = m?.[s];
	if (files && files.length > 0) {
		const file = files[Math.min(Math.max(index, 0), files.length - 1)];
		return `/foes/${file}`;
	}
	// Fallback — manifest not yet loaded or no entry. The image component
	// will 404 to UNKNOWN_FOE_PORTRAIT via onerror if the file doesn't exist.
	return index <= 0 ? `/foes/${s}.webp` : UNKNOWN_FOE_PORTRAIT;
}

/**
 * Discover how many portraits exist for a foe (minimum 1). Resolves against
 * the manifest; returns 1 as a safe default if the manifest is unavailable.
 */
export async function discoverFoePortraitCount(name: string): Promise<number> {
	const m = await fetchManifest();
	const files = m[slug(name)];
	return Math.max(1, files?.length ?? 1);
}
