# Git Worktrees for trips-app

This repo uses `git worktree` to let multiple concurrent workers (agents or
developers) operate on separate branches/checkouts without colliding on the
same working directory or git index.

## Location & naming convention

- All worktrees live under `.worktrees/<feature-name>/` inside the repo root
  (ignored by git via `.gitignore`, so worktree contents never get committed
  to `main`).
- Each worktree directory name matches its branch name:
  `.worktrees/<feature-name>` checks out branch `<feature-name>`.
  Example: `.worktrees/flight-search` -> branch `flight-search`.

## Creating a worktree

From the main repo root:

```bash
# New branch off main, isolated in its own worktree
git worktree add .worktrees/<feature-name> -b <feature-name>

# Attach a worktree to an existing branch
git worktree add .worktrees/<feature-name> <feature-name>
```

Each worktree has its own working directory and its own index, so edits,
staged changes, and commits in one worktree are completely invisible to
every other worktree (including the main repo) until you explicitly
push/merge/fetch between branches.

## Listing worktrees

```bash
git worktree list
```

## Removing a worktree

```bash
# after merging/pushing the branch, or to discard the workstream
git worktree remove .worktrees/<feature-name>

# if the worktree has uncommitted changes you want to discard anyway
git worktree remove --force .worktrees/<feature-name>

# optionally delete the branch too, once merged
git branch -d <feature-name>
```

## Workflow for concurrent agents/workers

1. Pick a short, descriptive feature name (kebab-case).
2. `git worktree add .worktrees/<feature-name> -b <feature-name>`
3. `cd .worktrees/<feature-name>` and do all work for that task there.
4. Commit as usual within the worktree.
5. Push the branch (`git push -u origin <feature-name>`) and open a PR, or
   merge locally into `main` from the main repo root.
6. Once merged/no longer needed, remove the worktree (see above) to keep
   `.worktrees/` tidy.

This keeps every worker's changes isolated until they are explicitly
integrated, which avoids clobbering another worker's uncommitted state in
the shared main checkout.
