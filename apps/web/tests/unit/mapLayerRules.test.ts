/**
 * mapLayerRules.test.ts — a map's marker layers as saved in its settings:
 * the cleaned list (default layer first) and which markers show.
 */
import { describe, it, expect } from 'vitest';
import { cleanMapLayers, DEFAULT_LAYER_ID, layerShownTest } from '../../src/lib/mapLayerRules.js';

describe('cleanMapLayers', () => {
	it('puts the default layer first, adding it when the map has none', () => {
		expect(cleanMapLayers(undefined)).toEqual([{ id: DEFAULT_LAYER_ID, name: 'Default' }]);
		expect(
			cleanMapLayers([
				{ id: 'towns', name: 'Towns' },
				{ id: DEFAULT_LAYER_ID, name: 'Base', hidden: true },
			]).map((l) => l.id),
		).toEqual([DEFAULT_LAYER_ID, 'towns']);
	});

	it('drops rows that are not layers and repeated ids, and names a blank one', () => {
		expect(
			cleanMapLayers([null, { id: '' }, { id: 'a', name: '  ' }, { id: 'a', name: 'Again' }, 7]),
		).toEqual([
			{ id: DEFAULT_LAYER_ID, name: 'Default' },
			{ id: 'a', name: 'Layer' },
		]);
	});

	it('keeps hidden only when it is true', () => {
		const [, a, b] = cleanMapLayers([
			{ id: 'a', name: 'A', hidden: true },
			{ id: 'b', name: 'B', hidden: 'yes' as never },
		]);
		expect(a).toEqual({ id: 'a', name: 'A', hidden: true });
		expect(b).toEqual({ id: 'b', name: 'B' });
	});
});

describe('layerShownTest', () => {
	const layers = cleanMapLayers([
		{ id: 'towns', name: 'Towns' },
		{ id: 'secret', name: 'Secret', hidden: true },
	]);
	const shown = layerShownTest(layers);

	it('hides the markers on a hidden layer', () => {
		expect(shown({ layer: 'secret' })).toBe(false);
		expect(shown({ layer: 'towns' })).toBe(true);
	});

	it('reads a marker on no layer, or a deleted one, as on the default layer', () => {
		expect(shown({})).toBe(true);
		expect(shown({ layer: 'gone' })).toBe(true);
		const defaultHidden = layerShownTest(
			cleanMapLayers([{ id: DEFAULT_LAYER_ID, name: 'Default', hidden: true }]),
		);
		expect(defaultHidden({})).toBe(false);
		expect(defaultHidden({ layer: 'gone' })).toBe(false);
	});
});
