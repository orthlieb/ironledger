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

## 2. Lint + format-check + typecheck

Run all four from the repo root. CI runs the same commands, so a
local failure is a guaranteed CI failure — better to catch here
than after a PR is open.

```bash
pnpm lint
npm run format:check
# Typecheck gates — CI runs both; `pnpm lint` is just ESLint and
# won't catch TypeScript errors like noUncheckedIndexedAccess,
# missing return types, or wrong signatures across workspaces.
npx tsc --noEmit --project apps/api/tsconfig.json
npm run check --workspace=apps/web   # svelte-check (templates + .ts)
```

The web `check` script depends on `@ironledger/shared` being built;
if it errors with "Cannot find module '@ironledger/shared'", run
`npm run build --workspace=packages/shared` first and re-check. CI
runs that build between the API typecheck and the web check step.

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
CI-pinned version; for lint errors it varies; typecheck errors
usually need a code-level fix. Do NOT auto-run either `--fix` or
`--write` without permission — the fix might touch files the user
didn't intend to commit in this PR.

**Why typecheck locally even though CI will do it:** Deploy is
gated on the same `tsc --noEmit`, so a typecheck failure doesn't
just block the PR — it leaves `main` un-deployed until the fix
PR lands. Catching those three TS18048 errors locally is a 10-second
cost that saves a 15-minute ship-then-recover cycle. The 2026-10-01
`PUT /:kind/batch` ship (PR #454) is the cautionary tale: ESLint
and prettier both passed, but `noUncheckedIndexedAccess` on a
new-handler `entities[i]` tripped tsc and the followup fix PR
had to carry it green.

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

## 7. Spawn post-merge workflow watcher (always)

Every /engage ships to `main`, which triggers three parallel
workflows: **CI** (~2 min: lint, format-check, drift-guard checks,
unit tests + build), **E2E (Web — Playwright)** (~10–15 min: full
UI regression suite), and **Deploy** (~3 min: whatever the deploy
job does — build image, push, roll). Any one of them going red is a
failure of this ship. Immediately after emitting the ship report —
same turn, do not wait — spawn a background worker to watch all
three. The main session ends its turn as soon as the worker is
spawned; when the worker finishes, a task-notification wakes this
session with its report. Never poll for the worker's status.

Call the `Agent` tool with:
- `subagent_type`: `"general-purpose"`
- `run_in_background`: `true`
- `description`: `"Watch CI+E2E+Deploy for PR #<n>"`
- `prompt`: a self-contained brief containing the shipped PR number
  and merge SHA (the worker starts with no session context). Instruct
  it to:

  1. Locate ALL THREE workflow runs on the merge SHA. Use
     `mcp__github__actions_list` with
     `method: "list_workflow_runs"` and
     `workflow_runs_filter: { "branch": "main" }`, then filter the
     result to `head_sha === <merge SHA>`. Expect at least three
     runs named `CI`, `E2E (Web — Playwright)`, and `Deploy` (the
     workflow files are `.github/workflows/{ci.yml,e2e-web.yml,deploy.yml}` —
     list them on fresh `main` if the names are ambiguous). If any
     of the three is not yet present, sleep 30 s and retry —
     GitHub can lag scheduling a run after a squash-merge.
  2. Poll `mcp__github__actions_get` every ~60 s for each still-
     running workflow until it reaches a terminal `conclusion`
     (`success`, `failure`, `cancelled`, `timed_out`,
     `action_required`). Use plain Bash `sleep` between polls —
     that's fine inside a background agent. CI usually terminates
     first (~2 min), then Deploy (~3 min), then E2E (~12 min).
  3. **Report each workflow's result AS IT LANDS**, don't wait for
     all three. When a run reaches a terminal conclusion, emit one
     line for it right then ("CI on `<sha>` (PR #<n>) passed in
     <t>" or "CI on `<sha>` (PR #<n>) FAILED after <t> — <one-line
     summary of the failing job / step>"), then keep polling
     whatever's still running. Each of these lines becomes its own
     task-notification the main session will surface to the user;
     staggered reports beat a single end-of-run summary because
     the user can start reacting to a CI red before E2E's 12-min
     run even finishes.
  4. **On CI or Deploy failing**, STOP polling E2E and cancel it
     from your outstanding work. E2E's result on the same head no
     longer matters — a red CI or Deploy already means main isn't
     shippable, and any E2E regression will re-surface on the fix
     PR's own workflow runs. Skipping the ~12-min E2E wait gets
     the fix landed sooner. (An E2E failure with CI + Deploy both
     green does NOT trigger the same short-circuit — E2E is the
     only remaining signal in that case, so keep it and triage
     it.)
  5. **On all three green**: after the third success line has
     been reported, no summary needed — the per-workflow lines are
     the report.
  6. **On any non-success terminal conclusion (on any of the
     three)**: triage and fix.
     - Fetch failing job logs with `mcp__github__get_job_logs`
       (pass `failed_only: true` and `return_content: true`) to
       identify the failing step. If the tail is just docker
       teardown, bump `tail_lines` to 300+ to reach the real error.
     - **CI**-typical failures — drift-guard counts in
       `apps/api/tests/unit/extensionsManifest.test.ts` (see
       `CLAUDE.md` → "Standing order — bump catalogue count tests"),
       stale `gen:*-ref:check` / `gen:manifest:check` output (run
       the corresponding generator + commit), format-check drift,
       unit-test regressions.
     - **E2E**-typical failures — stale Playwright selectors after
       a UI move, a count-of-cards assertion changed by content, a
       timing/retry bump on a known-flaky race, cursor / focus
       assertions that don't match a new interaction pattern.
     - **Deploy**-typical failures — usually infrastructure
       (docker registry auth, deploy secret rotated, target
       runtime down); rarely code-caused. Report the specific
       failure verbatim rather than guessing a fix.
     - If the root cause is tractable and small:
         * Create branch `claude/fix-ci-e2e-<pr#>` from fresh
           `origin/main` (never reuse the merged branch).
         * Apply the minimal fix. Never disable, skip, or
           `test.fixme` a test to get green.
         * Run `pnpm lint`, `./node_modules/.bin/prettier --check .`
           (use the locally-installed pinned versions — `npx prettier`
           may resolve a newer plugin patch that gives a different
           opinion; the pinned pair is prettier@3.8.3 +
           prettier-plugin-svelte@3.5.2), the unit test for the
           failing area if it's a `--check` script (e.g. `node
           scripts/gen-yrt-reference.mjs --check`), and (when the
           sandbox has Postgres+Redis + a Playwright browser) the
           single failing E2E spec locally.
         * Commit, `git push -u origin <branch>`, open a
           `fix(ci): …` PR via `mcp__github__create_pull_request`
           referencing the failing PR (`Fixes CI/E2E regression
           from #<n>`).
         * Do NOT squash-merge it yourself — leave the PR open for
           the user to review the fix, since a speculative CI-fix
           merge that lands red is expensive. Report back with the
           fix PR link and a one-paragraph triage that names WHICH
           workflow(s) failed and what the fix does.
     - If the fix would need larger judgment (unclear test intent,
       multi-file refactor implied, real product regression, or
       apparent infra flake with no repro — Deploy failures are
       almost always in this bucket), do NOT push a speculative fix.
       Report back a triage: failing workflow + job + step + line,
       root-cause hypothesis, and the proposed patch as a diff so
       the user can decide.

Do not include the watcher status in the step 6 ship report — its
outcome arrives later as its own notification. When that
notification wakes the session, relay the worker's report to the
user then.
