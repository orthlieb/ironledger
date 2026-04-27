/**
 * futhark.ts — English to Elder Futhark transliterator.
 *
 * Strategy:
 *   1. Uppercase the input.
 *   2. Replace multi-character sounds (TH, NG, EI, …) with their single rune.
 *   3. Replace remaining Latin letters one-for-one.
 *   4. Leave spaces, digits, and punctuation unchanged.
 *
 * Elder Futhark Unicode block: U+16A0 – U+16FF.
 */

// ── Multi-character sounds (checked first, left-to-right) ─────────────────────
//   Order matters: longer / more specific patterns before their substrings.
const DIGRAPHS: [string, string][] = [
	['TH', 'ᚦ'],  // Thurisaz  — the "th" sound (þ)
	['NG', 'ᛜ'],  // Ingwaz    — the "ng" sound (ŋ)
	['EI', 'ᛇ'],  // Iwaz      — the "ei / ī" sound
	['AE', 'ᚨ'],  // Ansuz     — æ approximated as A-rune
	['OE', 'ᛟ'],  // Othalan   — œ approximated as O-rune
];

// ── Single-character map ───────────────────────────────────────────────────────
const RUNES: Record<string, string> = {
	A: 'ᚨ',  // Ansuz
	B: 'ᛒ',  // Berkanan
	C: 'ᚲ',  // Kaunan  (hard C = K sound)
	D: 'ᛞ',  // Dagaz
	E: 'ᛖ',  // Ehwaz
	F: 'ᚠ',  // Fehu
	G: 'ᚷ',  // Gebo
	H: 'ᚺ',  // Hagalaz
	I: 'ᛁ',  // Isa
	J: 'ᛃ',  // Jera    (J / consonantal Y)
	K: 'ᚲ',  // Kaunan
	L: 'ᛚ',  // Laguz
	M: 'ᛗ',  // Mannaz
	N: 'ᚾ',  // Naudiz
	O: 'ᛟ',  // Othalan
	P: 'ᛈ',  // Pertho
	Q: 'ᚲ',  // Kaunan  (QU → K sound)
	R: 'ᚱ',  // Raidho
	S: 'ᛊ',  // Sowilo
	T: 'ᛏ',  // Tiwaz
	U: 'ᚢ',  // Uruz
	V: 'ᚹ',  // Wunjo   (V/W shared in Elder Futhark)
	W: 'ᚹ',  // Wunjo
	X: 'ᛉ',  // Algiz   (X approximated as Z/Algiz)
	Y: 'ᛃ',  // Jera    (consonantal / vocalic Y)
	Z: 'ᛉ',  // Algiz
};

// Reverse map: rune → latin letter(s), built from RUNES + DIGRAPHS.
// Used only for round-tripping; ambiguous runes map to the most common letter.
const RUNE_TO_LATIN: Record<string, string> = {};
for (const [lat, run] of DIGRAPHS) {
	RUNE_TO_LATIN[run] = lat;
}
for (const [lat, run] of Object.entries(RUNES)) {
	if (!(run in RUNE_TO_LATIN)) RUNE_TO_LATIN[run] = lat;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Transliterate an English string into Elder Futhark Unicode runes. */
export function toFuthark(text: string): string {
	let s = text.toUpperCase();
	for (const [lat, run] of DIGRAPHS) {
		s = s.replaceAll(lat, run);
	}
	return s.split('').map((ch) => RUNES[ch] ?? ch).join('');
}

/** Convert a Futhark-transliterated string back to approximate English (uppercase).
 *  Useful for restoring editable text when switching fonts. */
export function fromFuthark(text: string): string {
	return text.split('').map((ch) => RUNE_TO_LATIN[ch] ?? ch).join('');
}
