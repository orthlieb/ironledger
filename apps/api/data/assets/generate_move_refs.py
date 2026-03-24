#!/usr/bin/env python3
"""
Generate asset-move-refs.json and decorate Ironsworn/Delve/YRT asset JSON
with move links.

Output:
  - asset-move-refs.json: index of assets → abilities → move IDs
  - assets_ironsworn.json: updated with <a class="move-link"> decorations
  - assets_delve.json: updated with <a class="move-link"> decorations
  - assets_yrt.json: updated (converts <b>Move Name</b> → <a class="move-link">)
"""

import json
import os
import re
import sys
from copy import deepcopy

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
MOVES_DIR = os.path.join(DATA_DIR, '..', 'moves')


# ---------------------------------------------------------------------------
# Step 1: Build name → ID map from all move files
# ---------------------------------------------------------------------------

def build_move_map():
    move_map = {}  # name (original case) → id
    for fname in os.listdir(MOVES_DIR):
        if not fname.endswith('.json'):
            continue
        with open(os.path.join(MOVES_DIR, fname)) as f:
            data = json.load(f)
        for move in data.get('moves', []):
            name = move['name']
            mid = move['id']
            move_map[name] = mid
    return move_map


# ---------------------------------------------------------------------------
# Step 2: Build a regex that matches any move name at word boundaries
# Sorted longest-first to avoid partial matches of shorter substrings
# ---------------------------------------------------------------------------

def build_move_regex(move_map):
    # Sort by length descending so longer names match first
    names_sorted = sorted(move_map.keys(), key=len, reverse=True)
    # Escape each name for regex, then join with |
    pattern = '|'.join(re.escape(name) for name in names_sorted)
    # Case-insensitive, word-boundary anchored
    return re.compile(r'\b(' + pattern + r')\b', re.IGNORECASE)


# ---------------------------------------------------------------------------
# Step 3: Decorate plain-text ability text (Ironsworn / Delve format)
# Skips content inside existing HTML tags to avoid double-wrapping
# ---------------------------------------------------------------------------

def decorate_plain_text(text, move_regex, move_map):
    """
    Replace move name occurrences in plain text with <a class="move-link"> tags.
    Avoids replacing inside existing HTML tags or inside existing <a> elements.
    """
    # Build a case-insensitive lookup
    lower_map = {k.lower(): (k, v) for k, v in move_map.items()}

    def replace_match(m):
        matched = m.group(1)
        orig_name, move_id = lower_map[matched.lower()]
        return f'<a class="move-link" data-id="{move_id}">{matched}</a>'

    # We need to only replace in text nodes that are NOT inside any HTML element.
    # Strategy: split the entire text into alternating [text, tag, text, tag, ...]
    # where "tag" includes both opening and closing tags. We skip anything inside
    # <a ...> ... </a> blocks entirely to avoid double-wrapping.
    #
    # Use a stateful parser: track whether we are inside an <a> element.
    # Split on ANY tag token first, then decide.
    segments = re.split(r'(<[^>]+>)', text)
    result = []
    inside_anchor = 0  # nesting counter for <a> tags
    for seg in segments:
        if seg.startswith('<'):
            # HTML tag — pass through unchanged, track <a> nesting
            tag_lower = seg.lower()
            if re.match(r'<a\b', tag_lower):
                inside_anchor += 1
            elif re.match(r'</a\b', tag_lower):
                inside_anchor = max(0, inside_anchor - 1)
            result.append(seg)
        else:
            if inside_anchor > 0:
                # Inside an existing <a> element — don't touch
                result.append(seg)
            else:
                # Plain text outside any anchor — apply move decorations
                result.append(move_regex.sub(replace_match, seg))
    return ''.join(result)


# ---------------------------------------------------------------------------
# Step 4: Decorate YRT ability text
# YRT already uses <b>Move Name</b> for move names.
# Convert matching <b> tags to <a class="move-link"> tags.
# Non-move <b> tags (like "strong hit", "weak hit", etc.) are left as-is.
# Also run plain-text matching on non-tag segments for any moves not already bold.
# ---------------------------------------------------------------------------

def decorate_yrt_text(text, move_regex, move_map):
    """
    For YRT assets:
    1. Convert <b>Move Name</b> → <a class="move-link" data-id="...">Move Name</a>
       when the bold content is a known move name.
    2. Also apply plain-text matching on non-tag segments (for any remaining bare
       move names not wrapped in <b> or <a>).
    """
    lower_map = {k.lower(): (k, v) for k, v in move_map.items()}

    def replace_bold(m):
        content = m.group(1)
        # Check if this bold content is a known move name
        key = content.lower()
        if key in lower_map:
            orig_name, move_id = lower_map[key]
            return f'<a class="move-link" data-id="{move_id}">{content}</a>'
        # Not a move name, preserve as-is
        return m.group(0)

    # First pass: convert <b>Move Name</b> for known moves
    text = re.sub(r'<b>(.*?)</b>', replace_bold, text)

    # Second pass: find any remaining bare move names in text nodes,
    # skipping content inside existing <a> elements (avoids double-wrapping
    # for YRT assets that already had <a class="move-link"> tags).
    # Reuse the same anchor-aware logic from decorate_plain_text.
    return decorate_plain_text(text, move_regex, move_map)


# ---------------------------------------------------------------------------
# Step 5: Extract move IDs referenced in decorated text
# ---------------------------------------------------------------------------

def extract_move_ids(text):
    """Extract all move IDs from <a class="move-link" data-id="..."> tags."""
    return re.findall(r'<a\s+class="move-link"\s+data-id="([^"]+)"', text)


# ---------------------------------------------------------------------------
# Step 6: Process an asset file
# Returns (updated_data, refs_for_this_file)
# ---------------------------------------------------------------------------

def process_asset_file(filepath, move_regex, move_map, decorate_fn):
    with open(filepath) as f:
        data = json.load(f)

    updated_data = deepcopy(data)
    file_refs = []  # list of asset ref entries

    assets = updated_data.get('assets', [])
    for asset_idx, asset in enumerate(assets):
        asset_move_refs = []  # per-ability refs
        all_moves_set = set()

        for ab_idx, ability in enumerate(asset.get('abilities', [])):
            text = ability.get('text', '')
            if not text:
                continue

            decorated = decorate_fn(text, move_regex, move_map)
            ability['text'] = decorated

            move_ids = extract_move_ids(decorated)
            if move_ids:
                # Deduplicate while preserving order
                seen = set()
                unique_ids = []
                for mid in move_ids:
                    if mid not in seen:
                        seen.add(mid)
                        unique_ids.append(mid)
                asset_move_refs.append({
                    'index': ab_idx,
                    'moves': unique_ids
                })
                all_moves_set.update(unique_ids)

        if asset_move_refs:
            all_moves_list = []
            seen = set()
            for ab_ref in asset_move_refs:
                for mid in ab_ref['moves']:
                    if mid not in seen:
                        seen.add(mid)
                        all_moves_list.append(mid)

            file_refs.append({
                'id': asset['id'],
                'abilities': asset_move_refs,
                'allMoves': all_moves_list
            })

    return updated_data, file_refs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print('Building move map...')
    move_map = build_move_map()
    print(f'  {len(move_map)} moves found.')

    move_regex = build_move_regex(move_map)

    all_refs = []
    stats = {}

    # Process Ironsworn assets (plain text)
    print('\nProcessing assets_ironsworn.json (plain text)...')
    fpath = os.path.join(DATA_DIR, 'assets_ironsworn.json')
    updated, refs = process_asset_file(fpath, move_regex, move_map, decorate_plain_text)
    all_refs.extend(refs)
    stats['ironsworn'] = len(refs)
    with open(fpath, 'w') as f:
        json.dump(updated, f, indent=2, ensure_ascii=False)
    print(f'  {len(refs)} assets with move refs. Written.')

    # Process Delve assets (plain text)
    print('\nProcessing assets_delve.json (plain text)...')
    fpath = os.path.join(DATA_DIR, 'assets_delve.json')
    updated, refs = process_asset_file(fpath, move_regex, move_map, decorate_plain_text)
    all_refs.extend(refs)
    stats['delve'] = len(refs)
    with open(fpath, 'w') as f:
        json.dump(updated, f, indent=2, ensure_ascii=False)
    print(f'  {len(refs)} assets with move refs. Written.')

    # Process YRT assets (<b> tag conversion + plain text fallback)
    print('\nProcessing assets_yrt.json (YRT <b>-tag format)...')
    fpath = os.path.join(DATA_DIR, 'assets_yrt.json')
    updated, refs = process_asset_file(fpath, move_regex, move_map, decorate_yrt_text)
    all_refs.extend(refs)
    stats['yrt'] = len(refs)
    with open(fpath, 'w') as f:
        json.dump(updated, f, indent=2, ensure_ascii=False)
    print(f'  {len(refs)} assets with move refs. Written.')

    # Write asset-move-refs.json
    refs_path = os.path.join(DATA_DIR, 'asset-move-refs.json')
    with open(refs_path, 'w') as f:
        json.dump(all_refs, f, indent=2, ensure_ascii=False)
    print(f'\nWrote asset-move-refs.json with {len(all_refs)} total asset entries.')

    # Summary
    print('\n=== Summary ===')
    for source, count in stats.items():
        print(f'  {source}: {count} assets with move refs')
    print(f'  Total: {len(all_refs)} assets')

    # Detailed breakdown
    print('\n=== Asset → Move Refs ===')
    for entry in all_refs:
        print(f"  {entry['id']}: {entry['allMoves']}")


if __name__ == '__main__':
    main()
