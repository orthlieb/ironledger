// =============================================================================
// yrt-md.mjs — lossless converters between YRT game-data JSON and the authoring
// Markdown that lives in the yrt-vault (the canonical source).
//
// Direction of truth: you write Markdown in the Obsidian vault; the forward
// generator (gen-yrt-json.mjs) renders it to the JSON the app consumes. These
// converters are the single definition of that mapping, used by:
//   • gen-yrt-json.mjs        (Markdown → JSON — the permanent forward path)
//   • migrate-yrt-to-md.mjs   (JSON → Markdown — one-time seeding of the vault)
//   • the round-trip unit test (proves fromMarkdown(toMarkdown(x)) deep-equals x)
//
// The round-trip test is the safety contract: as long as it is green, the vault
// Markdown captures every field the committed JSON has, with no loss.
// =============================================================================

import yaml from 'js-yaml';

// ── frontmatter helpers ──────────────────────────────────────────────────────

/** Serialize a frontmatter object + Markdown body into a `.md` string. */
function withFrontmatter(fm, body) {
  // lineWidth:-1 keeps long strings (captions) on one line — parsing is
  // lossless either way, but unwrapped reads better in an editor.
  const head = yaml.dump(fm, { lineWidth: -1, noRefs: true });
  return `---\n${head}---\n\n${body.replace(/\s*$/, '')}\n`;
}

/** Split a `.md` string into { fm, body }. Throws if the frontmatter is absent
 *  or malformed — a loud failure at generation time, never a silent misparse. */
function splitFrontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!m) throw new Error('missing YAML frontmatter (--- … ---) at top of file');
  const fm = yaml.load(m[1]) ?? {};
  const body = md.slice(m[0].length).replace(/^\n+/, '');
  return { fm, body };
}

/** Parse a heading-delimited body (`## Name` sections) into { Name: text }.
 *  Text before the first heading is returned under the '' key. */
function sections(body) {
  const out = {};
  let cur = '';
  out[cur] = [];
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = h[1];
      out[cur] = [];
    } else {
      out[cur].push(line);
    }
  }
  const trimmed = {};
  for (const [k, v] of Object.entries(out)) trimmed[k] = v.join('\n').trim();
  return trimmed;
}

const bulletsOut = (arr) => (arr || []).map((x) => `- ${x}`).join('\n');
const bulletsIn = (text) =>
  (text || '')
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2));

// ── Foes ─────────────────────────────────────────────────────────────────────
// JSON shape: { id, name, images[], rank, nature, features[], drives[],
//   tactics[], description, source, icon?, extras: { yrt: {…} } }
// The extras.yrt map (natureNote/rework/caption/escalates…) is round-tripped
// verbatim under the frontmatter `yrt:` key, so any current or future YRT extra
// survives without this converter needing to know its keys.

export function foeToMarkdown(foe) {
  const fm = {
    id: foe.id,
    name: foe.name,
    rank: foe.rank,
    nature: foe.nature,
    source: foe.source,
    images: foe.images,
  };
  if (foe.icon != null) fm.icon = foe.icon;
  if (foe.extras?.yrt) fm.yrt = foe.extras.yrt;

  const body = [
    '## Features',
    bulletsOut(foe.features),
    '',
    '## Drives',
    bulletsOut(foe.drives),
    '',
    '## Tactics',
    bulletsOut(foe.tactics),
    '',
    '## Description',
    foe.description ?? '',
  ].join('\n');

  return withFrontmatter(fm, body);
}

export function markdownToFoe(md) {
  const { fm, body } = splitFrontmatter(md);
  const s = sections(body);
  const foe = {
    id: fm.id,
    name: fm.name,
    images: fm.images,
    rank: fm.rank,
    nature: fm.nature,
    features: bulletsIn(s.Features),
    drives: bulletsIn(s.Drives),
    tactics: bulletsIn(s.Tactics),
    description: s.Description ?? '',
    source: fm.source,
  };
  if (fm.icon != null) foe.icon = fm.icon;
  if (fm.yrt) foe.extras = { yrt: fm.yrt };
  return foe;
}
