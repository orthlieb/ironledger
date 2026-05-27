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

## 2. Push and open the PR

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

## 3. Squash-merge

Call `mcp__github__merge_pull_request` with:
- `owner`, `repo`, `pullNumber` from step 2.
- `merge_method`: `"squash"`.
- `commit_title`: same as the PR title.
- `commit_message`: empty (the squash message will use the PR body).

If the merge call fails (status conflict, required checks pending, etc.),
report the failure verbatim. Do **not** try to force-merge or skip checks.

## 4. Local cleanup

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

## 5. Report

End with a one-line summary: PR number, merge SHA on main, branch name
that was shipped. Example:

> Shipped `claude/fix-foo` via PR #42 → `a1b2c3d` on main. Remote + local branches deleted.
