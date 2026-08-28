---
name: merge-voxel-bot-prs
description: >-
  Merges open Grok/Voxel-bro prop PRs into main only after explicit user
  approval. Use when the user says «всё ок», «можно мержить», «мержи ботов»,
  «пропы ок», or asks to merge grok/voxel kit/env pull requests.
---

# Merge voxel-bot PRs after OK

This **replaces clicking Merge in the GitHub UI**. Grok/Voxel-bro bots only open PRs; they do not merge. Do not send the user to the browser. Do **not** merge until an explicit OK.

## What counts as a voxel-bot PR

Open PRs into `main` whose head branch matches:

- `cursor/ember-fantasy-env*`
- `cursor/ember-kit*`

Also include a PR if `gh pr diff --name-only` is only under `content/ember/voxels/models/` (optional `scripts/gen-ember-*.mjs`). Skip PRs that touch `src/`, maps, or characters (`cursor/ember-chr-*`) unless the user named the number.

## On explicit OK

1. `gh pr list --state open --json number,title,headRefName,isDraft,mergeable,url`
2. Filter to voxel-bot PRs.
3. **Do not merge drafts.** Report them and leave them open. Never reopen or merge closed `#5` / `#6` (auburn character experiments the user rejected).
4. For each ready PR: `gh pr merge <n> --merge --delete-branch=false` (repo history uses merge commits). If GitHub says the branch is behind, rebase that PR onto `origin/main` first, then merge. Never force-push `main`.
5. After merges: `git fetch origin main`. If local `main` is checked out, `git pull --rebase origin main`.
6. Reply with merged numbers/URLs and any leftover drafts.

If nothing matches, say so. Do not merge unrelated PRs.
