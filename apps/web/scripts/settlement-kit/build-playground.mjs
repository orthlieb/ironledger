// =============================================================================
// Builds the settlement playground: a standalone, self-contained HTML tool.
//
//   npm run build:settlement-playground -w apps/web
//   (or: node apps/web/scripts/settlement-kit/build-playground.mjs [out.html])
//
// Bundles playground.mjs (+ pieces, layouts, renderer and clipper-lib) with
// esbuild into one HTML file — no network, no external assets — written to
// tools/settlement-playground.html by default. The generator runs in the
// page, so every knob re-renders live, and each icon exports as SVG / PNG.
// The culture plugins (cultures/*.json in the base game and every
// extension) are baked in as presets; Import culture loads a plugin file to
// tweak, and Export culture writes the current knobs + colours as one.
// =============================================================================

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCultures } from './loadCultures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const out =
	process.argv[2] ?? join(HERE, '..', '..', '..', '..', 'tools', 'settlement-playground.html');

const { outputFiles } = await build({
	entryPoints: [join(HERE, 'playground.mjs')],
	bundle: true,
	minify: true,
	format: 'iife',
	platform: 'browser',
	// Downcompile to a baseline the oldest in-support iOS Safari can run; the
	// playground otherwise lands blank on iPhones running iOS 15.3 or older.
	target: ['safari14', 'chrome90', 'firefox90'],
	write: false,
	// The culture plugins (dev-only sample included) become the presets.
	banner: {
		js: `globalThis.__SETTLEMENT_CULTURES__=${JSON.stringify(loadCultures({ includeDev: true }))};`,
	},
});
// Thin probes bracketing the IIFE: if the main script never parses or
// executes at all, the status bar still updates to "Script started" / stays
// on "Loading…" and we can tell which end failed.
const js =
	`try{document.getElementById('status').textContent='Script started';}catch(e){}\n` +
	outputFiles[0].text.replace(/<\/script/gi, '<\\/script') +
	`\ntry{if(document.getElementById('status').textContent==='Script started')document.getElementById('status').textContent='Script loaded, init pending';}catch(e){}`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Settlement Playground</title>
<style>
:root{--bg:#f4efe4;--fg:#3a2c1c;--muted:#7a6a58;--card:#fffdf8;--line:#d9cfbd;--accent:#7a2e1c;
 --wall:#EFEADF;--roof:#D9776B;--wood:#C9A97C;--earth:#8E9A6A;--water:#8FB0B8;--ink:#3B2F28;--flag:#4A3B32;--halo:#F4EFE4}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
header h1{font-size:16px;margin:0 6px 0 0}
#status{font-size:12px;color:var(--muted)}
#note{flex-basis:100%;font-size:12.5px;color:var(--fg);font-style:italic}#note:empty{display:none}
button,select{font:inherit;padding:4px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.layout{display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px;padding:12px 16px 40px;align-items:start}
#knobs{position:sticky;top:60px;max-height:calc(100dvh - 72px);overflow:auto;overscroll-behavior:contain;padding-right:4px}
fieldset{border:1px solid var(--line);border-radius:8px;margin:0 0 10px;padding:6px 10px 8px;background:var(--card)}
legend{font-weight:600;font-size:13px;padding:0 4px}
.row{display:grid;grid-template-columns:110px 1fr 36px;gap:6px;align-items:center;font-size:12.5px;padding:2px 0}
.row select{grid-column:2/4;padding:2px 6px}
.row input[type=checkbox],.row input[type=color]{justify-self:start}
.row input[type=color]{width:40px;height:24px;border:1px solid var(--line);border-radius:5px;padding:0;background:none}
.row input[type=range]{width:100%}
output{font-size:11.5px;color:var(--muted);text-align:right;font-variant-numeric:tabular-nums}
.grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;text-align:center;width:170px}
figure.big{flex:1 1 260px;width:auto}
figure .ic{width:100%;height:110px}figure.big .ic{height:240px}
figcaption{font-size:13px;display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap}
.dl{display:inline-flex;gap:4px}.dl button{font-size:11px;padding:1px 6px}
#map{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;padding:14px 16px;margin-bottom:12px;border-radius:8px;border:1px solid var(--line);
 background:radial-gradient(circle at 20% 30%,#cdbf96 0,transparent 40%),radial-gradient(circle at 80% 70%,#a9b48a 0,transparent 45%),#d8cba5}
#map .ic{width:34px;height:34px}#map span{margin-left:auto;font-size:12px;color:#5d5140}
.ic .sil{fill:var(--halo);stroke:var(--halo);stroke-width:3;stroke-linejoin:round}
.ic [data-role=wall]{fill:var(--wall)}
.ic [data-role=wall-shade]{fill:color-mix(in srgb,var(--wall) 80%,var(--ink))}
.ic [data-role=wood]{fill:var(--wood)}
.ic [data-role=wood-shade]{fill:color-mix(in srgb,var(--wood) 75%,var(--ink))}
.ic [data-role=water]{fill:var(--water)}
.ic [data-role=water-shade]{fill:color-mix(in srgb,var(--water) 80%,var(--ink))}
.ic [data-role=earth]{fill:var(--earth)}
.ic [data-role=earth-shade]{fill:color-mix(in srgb,var(--earth) 75%,var(--ink))}
.ic [data-role=roof]{fill:var(--roof)}
.ic [data-role=roof-shade]{fill:color-mix(in srgb,var(--roof) 70%,var(--ink))}
.ic [data-role=flag]{fill:var(--flag)}
.ic [data-role=ink]{fill:var(--ink)}
@media (max-width:760px){.layout{grid-template-columns:1fr}#knobs{position:static;max-height:none}figure{width:calc(50% - 6px)}}
</style></head><body>
<header><h1>Settlement playground</h1>
<select id="preset" autocomplete="off" aria-label="Culture preset"></select>
<button class="primary" id="culture" title="Shift-click for the default culture">Culture ⟳</button>
<button id="reset">Reset drawing</button>
<button id="copy">Copy settings</button>
<button id="import" title="Load a cultures/*.json plugin to tweak">Import culture</button>
<input type="file" id="importFile" accept=".json,application/json" hidden>
<button id="export" title="Download the current culture as a cultures/*.json plugin">Export culture</button>
<span id="status">Loading…</span><span id="note"></span></header>
<script>
window.addEventListener('error',e=>{var s=document.getElementById('status');if(s)s.textContent='⚠ '+(e.message||'script error')+(e.lineno?' @ '+e.lineno:'');},true);
window.addEventListener('unhandledrejection',e=>{var s=document.getElementById('status');if(s)s.textContent='⚠ rejected: '+(e.reason&&e.reason.message||e.reason||'unknown');});
</script>
<div class="layout"><aside id="knobs"></aside>
<main><div class="grid" id="towns"></div><div id="map"></div><div class="grid" id="pieces"></div></main></div>
<script>${js}</script></body></html>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
