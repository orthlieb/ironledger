#!/usr/bin/env python3
"""
One-shot migration: add 'source' field to moves/assets/foes JSON, and
rename 'group' -> 'source' in oracle JSON with normalized values.

Values: 'base' | 'delve' | 'yrt'.

Idempotent: safe to re-run.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "apps" / "api" / "data"

# ---------------------------------------------------------------------------
# Moves: top-level source + per-move source (file-based mapping)
# ---------------------------------------------------------------------------
MOVES_SOURCE = {
    "adventure.json":    "base",
    "combat.json":       "base",
    "failure.json":      "base",
    "fate.json":         "base",
    "quest.json":        "base",
    "relationship.json": "base",
    "suffer.json":       "base",
    "delve.json":        "delve",
    "rarity.json":       "delve",
    "yrt.json":          "yrt",
}

ASSETS_SOURCE = {
    "assets_ironsworn.json": "base",
    "assets_delve.json":     "delve",
    "assets_yrt.json":       "yrt",
}

FOES_SOURCE = {
    "foes_ironsworn.json": "base",
    "foes_delve.json":     "delve",
    "foes_yrt.json":       "yrt",
}

# Oracle group -> source mapping (after rename)
ORACLE_GROUP_TO_SOURCE = {
    "Core Ironsworn": "base",
    "Delve":          "delve",
    "Yrt":            "yrt",
}


def load(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def save(p: Path, data) -> None:
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def tag_moves():
    moves_dir = DATA / "moves"
    for fname, src in MOVES_SOURCE.items():
        p = moves_dir / fname
        if not p.exists():
            print(f"  [skip] {fname} (missing)")
            continue
        doc = load(p)
        doc["source"] = src
        for m in doc.get("moves", []):
            m["source"] = src
        save(p, doc)
        print(f"  [moves] {fname} -> source={src} ({len(doc.get('moves', []))} moves)")


def tag_assets():
    assets_dir = DATA / "assets"
    for fname, src in ASSETS_SOURCE.items():
        p = assets_dir / fname
        if not p.exists():
            print(f"  [skip] {fname} (missing)")
            continue
        doc = load(p)
        doc["source"] = src
        n_assets = 0
        n_rarities = 0
        for a in doc.get("assets", []):
            a["source"] = src
            n_assets += 1
        for r in doc.get("rarities", []):
            r["source"] = src
            n_rarities += 1
        save(p, doc)
        print(f"  [assets] {fname} -> source={src} ({n_assets} assets, {n_rarities} rarities)")


def tag_foes():
    foes_dir = DATA / "foes"
    for fname, src in FOES_SOURCE.items():
        p = foes_dir / fname
        if not p.exists():
            print(f"  [skip] {fname} (missing)")
            continue
        doc = load(p)
        doc["source"] = src
        for f in doc.get("foes", []):
            f["source"] = src
        save(p, doc)
        print(f"  [foes] {fname} -> source={src} ({len(doc.get('foes', []))} foes)")


def rename_oracle_group():
    oracles_dir = DATA / "oracles"
    for p in sorted(oracles_dir.glob("*.json")):
        doc = load(p)
        # oracle-order.json is a flat key:number map — no group/data fields
        if not isinstance(doc, dict):
            continue
        if "data" not in doc:
            # e.g. oracle-order.json — skip
            continue
        if "source" in doc and "group" not in doc:
            # already migrated
            print(f"  [skip] {p.name} (already has source)")
            continue
        group = doc.pop("group", None)
        source = ORACLE_GROUP_TO_SOURCE.get(group, "base" if group is None else None)
        if source is None:
            print(f"  [WARN] {p.name} unknown group: {group!r} — defaulting to 'base'")
            source = "base"
        # Reinsert as 'source' preserving order (dicts preserve insertion order in Py3.7+)
        new_doc = {}
        for k, v in doc.items():
            if k == "data":
                new_doc["source"] = source
                new_doc["data"] = v
            else:
                new_doc[k] = v
        # If 'data' wasn't found (defensive), append source
        if "source" not in new_doc:
            new_doc["source"] = source
        save(p, new_doc)
        print(f"  [oracle] {p.name}: group={group!r} -> source={source!r}")


def main():
    print("Tagging moves...")
    tag_moves()
    print("\nTagging assets...")
    tag_assets()
    print("\nTagging foes...")
    tag_foes()
    print("\nRenaming oracle group -> source...")
    rename_oracle_group()
    print("\nDone.")


if __name__ == "__main__":
    main()
