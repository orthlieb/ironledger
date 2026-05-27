#!/usr/bin/env bash
# delete-stale-branches.sh — delete remote branches with no commits in N days.
#
# Lists candidate remote branches first; only deletes after explicit y/N
# confirmation. Excludes main, HEAD, and any branches named in KEEP.
#
# Usage:
#   ./scripts/delete-stale-branches.sh           # 21-day cutoff
#   ./scripts/delete-stale-branches.sh 30        # custom cutoff in days
#   ./scripts/delete-stale-branches.sh 21 main feat/x   # extra keep-list
#
# Restore a deleted branch within ~30 days via GitHub's "Settings → Branches
# → Restore deleted branches" screen, or `git push origin <sha>:<branch>`
# locally if you still have it in your reflog.

set -euo pipefail

DAYS="${1:-21}"; shift || true
KEEP=("main" "HEAD" "$@")

# Bash 3 (default on macOS) doesn't have GNU date — fall back to BSD form.
if cutoff=$(date -d "${DAYS} days ago" +%Y-%m-%d 2>/dev/null); then
  : # GNU date worked
else
  cutoff=$(date -v "-${DAYS}d" +%Y-%m-%d)
fi

echo "Pruning remote-tracking refs first…"
git fetch --prune --quiet

echo "Cutoff: $cutoff (anything older is a deletion candidate)"
echo "Keeping: ${KEEP[*]}"
echo

# Build the candidate list — older than cutoff AND not in KEEP.
mapfile -t candidates < <(
  git for-each-ref --format='%(committerdate:short) %(refname:short)' refs/remotes/origin/ \
    | awk -v cutoff="$cutoff" '$1 < cutoff { sub(/^origin\//, "", $2); print $2 }' \
    | grep -vxFf <(printf '%s\n' "${KEEP[@]}")
)

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "Nothing to delete. ✓"
  exit 0
fi

echo "Will delete ${#candidates[@]} branch(es) from origin:"
printf '  %s\n' "${candidates[@]}"
echo

read -rp "Type 'yes' to proceed: " ans
[[ "$ans" == "yes" ]] || { echo "Aborted."; exit 1; }

# One push, many --delete args. Faster than a loop and gives a single
# success/failure summary.
git push origin "${candidates[@]/#/:}"
