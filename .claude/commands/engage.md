---
description: Open a PR for the current branch and squash-merge it to main.
---

# /engage — ship the current branch via squash-merge PR

When the user runs `/engage`, do the following steps. Stop and report any
failure rather than continuing to the next step.

## 1. Pre-flight

Run these in parallel:

```bash
git rev-parse --abbrev-ref HEAD          # current branch
git status --porcelain                   # uncommitted changes?
git log --format=%s -1                   # latest commit subject for PR title
git log --format='%s' origin/main..HEAD  # all subjects on the branch
git remote get-url origin                # extract owner/repo
```

**Refuse and stop if:**
- Current branch is `main`, `master`, or `develop` — you can't /engage a
  protected branch.
- `git status --porcelain` shows uncommitted changes — ask the user to
  commit or stash first; do not auto-commit.
- The branch has zero commits ahead of `origin/main` — nothing to ship.

## 2. Lint + format-check

Run both from the repo root. CI runs the same commands, so a local
failure is a guaranteed CI failure — better to catch here than after
a PR is open.

```bash
pnpm lint
npm run format:check
```

**Prettier version:** `format:check` is prettier version-sensitive.
CI installs via `npm ci` which pins the exact `package-lock.json`
version (currently prettier@3.8.3); your local sandbox may have a
newer prettier resolved from `^3.8.3` at the root, and different
patch versions disagree on multi-line union types and similar edge
cases. If your local `prettier --version` differs from the pinned
version, run `format:check` with the pinned version explicitly:

```bash
npx --package=prettier@<pinned> --package=prettier-plugin-svelte@<pinned> \
    -y prettier --check .
```

Pinned versions live in `package-lock.json` under
`packages.node_modules/prettier.version` and
`packages.node_modules/prettier-plugin-svelte.version`.

**Pre-commit hook gotcha:** `.githooks/pre-commit` auto-runs
`npx prettier --write` on staged files and re-stages them. It uses
`npx prettier` (not the pinned version), so if your local prettier
resolves to a newer patch, the hook will silently *undo* the
pinned-version format on commit. When fixing formatting for CI,
stage the pinned-prettier output and commit with `--no-verify` so
the hook doesn't re-flatten the union types. Verify the actual
committed content with `git show HEAD:<path>` before pushing.

**On failure:** stop. Report the offending output verbatim, ask the
user whether to fix it (default) or ship anyway. If they say ship
anyway, that's an explicit override — otherwise do not proceed. For
formatting failures the fix is `prettier --write <files>` with the
CI-pinned version; for lint errors it varies. Do NOT auto-run either
`--fix` or `--write` without permission — the fix might touch files
the user didn't intend to commit in this PR.

**On warnings only:** proceed. CI treats warnings as informational
unless someone flips `--max-warnings=0` in the lint script.

## 3. Push and open the PR

Push first (so the PR can be created against the remote ref):

```bash
git push -u origin <branch>
```

Then create the PR via `mcp__github__create_pull_request`. Use:

- **owner / repo**: parse from `git remote get-url origin` (the URL is
  `…/orthlieb/ironledger`; owner is `orthlieb`, repo is `ironledger`).
- **head**: the current branch name.
- **base**: `main`.
- **title**: the latest commit subject (`%s` from step 1), trimmed to ≤70 chars.
- **body**: a short summary built from the branch's commit subjects:
  ```
  ## Summary
  - <subject 1>
  - <subject 2>
  …

  ## Test plan
  - [ ] (fill in if needed)
  ```
  Do not append a Claude session-link footer or generated-by tag.

Save the returned PR number.

## 4. Squash-merge

Call `mcp__github__merge_pull_request` with:
- `owner`, `repo`, `pullNumber` from step 3.
- `merge_method`: `"squash"`.
- `commit_title`: same as the PR title.
- `commit_message`: empty (the squash message will use the PR body).

If the merge call fails (status conflict, required checks pending, etc.),
report the failure verbatim. Do **not** try to force-merge or skip checks.

## 5. Local cleanup

After a successful merge:

```bash
git checkout main
git pull --ff-only
git branch -d <branch>                   # safe delete — fails if unmerged
```

If the local `git branch -d` reports "not fully merged" because the squash
landed under a different SHA, switch to `git branch -D <branch>` only after
verifying via `git log --oneline origin/main` that the PR's squash commit is
on `main`. Never `-D` a branch whose work isn't on main.

The remote branch deletes itself if the repo has
"Automatically delete head branches" enabled (Settings → General → Pull
Requests). If you see the remote branch still exists after merge, run:

```bash
git push origin --delete <branch>
```

## 6. Report

End with a one-line summary: PR number, merge SHA on main, branch name
that was shipped. Example:

> Shipped `claude/fix-foo` via PR #42 → `a1b2c3d` on main. Remote + local branches deleted.

## 7. Spawn E2E watcher (always)

Every /engage ships to `main`, which triggers the long-running E2E
workflow (~15–30 min). Lint + format-check catch static issues but the
E2E is where real regressions surface. Immediately after emitting the
ship report — same turn, do not wait — spawn a background worker to
watch that run. The main session ends its turn as soon as the worker
is spawned; when the worker finishes, a task-notification wakes this
session with its report. Never poll for the worker's status.

Call the `Agent` tool with:
- `subagent_type`: `"general-purpose"`
- `run_in_background`: `true`
- `description`: `"Watch E2E for PR #<n>"`
- `prompt`: a self-contained brief containing the shipped PR number
  and merge SHA (the worker starts with no session context). Instruct
  it to:

  1. Locate the E2E workflow run on the merge SHA. Use
     `mcp__github__actions_list` with `head_sha=<merge SHA>`; the
     workflow is named `E2E` (double-check by listing
     `.github/workflows/*.yml` on fresh `main` if the id is
     ambiguous). If the run is not yet present, sleep 30 s and
     retry — workflow_dispatch after a squash-merge can lag.
  2. Poll `mcp__github__actions_get` every ~90 s until the run
     reaches a terminal `conclusion` (`success`, `failure`,
     `cancelled`, `timed_out`, `action_required`). Use plain Bash
     `sleep` between calls — that's fine inside a background agent.
  3. On `success`: report back one line ("E2E on `<sha>` (PR #<n>)
     passed in <duration>") and exit.
  4. On any non-success terminal conclusion: triage and fix.
     - Fetch failing job logs with `mcp__github__get_job_logs`
       (pass `failed_only: true`) to identify the failing spec and
       assertion.
     - If the root cause is tractable and small — a drift-guard
       count in `apps/api/tests/unit/extensionsManifest.test.ts` (see
       `CLAUDE.md` → "Standing order — bump catalogue count tests"),
       a stale Playwright selector after a UI move, a
       count-of-cards assertion changed by content, a
       timing/retry bump on a known-flaky race — build the fix:
         * Create branch `claude/fix-ci-e2e-<pr#>` from fresh
           `origin/main` (never reuse the merged branch).
         * Apply the minimal fix. Never disable, skip, or
           `test.fixme` a test to get green.
         * Run `pnpm lint`, `npm run format:check`, and (when the
           sandbox has Postgres+Redis + a Playwright browser) the
           single failing spec locally to verify green before
           pushing: `pnpm --filter @ironledger/web exec playwright
           test <spec> --project=<project>`.
         * Commit, `git push -u origin <branch>`, open a
           `fix(ci): …` PR via `mcp__github__create_pull_request`
           referencing the failing PR (`Fixes E2E regression from
           #<n>`).
         * Do NOT squash-merge it yourself — leave the PR open for
           the user to review the fix, since a speculative CI-fix
           merge that lands red is expensive. Report back with the
           fix PR link and a one-paragraph triage.
     - If the fix would need larger judgment (unclear test intent,
       multi-file refactor implied, real product regression, or
       apparent infra flake with no repro), do NOT push a
       speculative fix. Report back a triage: failing job + step +
       line, root-cause hypothesis, and the proposed patch as a
       diff so the user can decide.

Do not include the E2E-watcher status in the step 6 ship report —
its outcome arrives later as its own notification. When that
notification wakes the session, relay the worker's report to the
user then.
