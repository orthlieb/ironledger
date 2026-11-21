/**
 * Parse HTML for reading (text, links, data attributes) without running any of
 * it.
 *
 * Setting `innerHTML` on an element of the live page, even one never attached,
 * loads its images, so `<img src=x onerror=…>` in stored log HTML (which a
 * shared backup can carry) would run. DOMParser builds a separate document
 * with no window: nothing in it loads or runs. Keep the nodes there; moving
 * them into the page would load them.
 *
 * `doc` picks the DOM implementation (tests pass happy-dom's); the result
 * always belongs to a fresh inert document.
 */
export function inertBody(html: string, doc?: Document): HTMLElement {
	const Parser = doc?.defaultView?.DOMParser ?? globalThis.DOMParser;
	return new Parser().parseFromString(html, 'text/html').body;
}
