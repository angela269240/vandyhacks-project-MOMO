# `claude/`: agent handoff protocol

Shared, committed memory for every Claude (or other agent) session and every teammate's instance working on this repo.
It is loaded automatically: `CLAUDE.md` imports this file, and the `SessionStart` hook in `.claude/settings.json` runs
`claude/session-start.mjs`, which prints live git state, active sessions, file-claim overlaps and conflict guidance.

| File | Machine-readable? | Purpose | Who edits |
|---|---|---|---|
| `project.json` | yes | Durable facts: stack, commands, invariants, dangers, code map, design direction, branch notes | Any session, merged by key |
| `conflicts.json` | yes | Merge-conflict playbook: general procedure + per-path rules | Any session that learns a new rule |
| `sessions/*.json` | yes | One file per session: goal, status, claimed files, decisions, verification, next steps | Only the session that created it |
| `schema/session.schema.json` | yes | JSON Schema for session files | Rarely |
| `session-start.mjs` | n/a | Prints the start-of-session briefing (run by the hook; safe to run by hand) | Rarely |
| `new-session.mjs` | n/a | Creates a pre-filled session file for the current branch | Rarely |

## Start of session (agents: do this before editing code)

1. Read the hook briefing. If it didn't run (e.g. another tool, or hooks disabled): `node claude/session-start.mjs`.
2. Read `project.json` (the briefing prints its key parts). Its `invariants` and `danger` lists are binding.
3. Look at **active** sessions in the briefing. If one claims files you are about to touch, either pick other work,
   coordinate through the human, or work on a separate branch and expect a merge (see `conflicts.json`).
4. Create your session file: `node claude/new-session.mjs "<one-line goal>"` → `claude/sessions/<stamp>-<branch>-<id>.json`.
   Fill `claims` with the paths/globs you expect to change. Commit it with your first commit.

## During the session

- Keep `claims` accurate as scope changes. Record non-obvious choices in `decisions` (what + why).
- One instance per branch. Two instances on the same machine: use `git worktree add ../momo-<task> -b <branch>`, never
  two agents editing one working tree.
- Never edit another session's file. Add a new entry to your own file instead (e.g. "superseded X's next_steps[2]").

## End of session (or before context runs out)

Update **your** session file, then commit it with your work:

- `status`: `done` | `paused` (work remains, resumable) | `abandoned` (explain in `summary`).
- `summary`, `commits`, `files_touched`, `verification` (`npm run typecheck`, `npm run lint`, manual checks: real results
  only, `"not run"` if skipped), `next_steps` (ordered, concrete, each one actionable by a cold agent), `open_questions`,
  `conflict_notes` (anything a future merge of this branch needs to know).
- If you learned a durable fact (new invariant, gotcha, command), add it to `project.json` and bump `updated`.
- If you resolved a conflict in a way others will hit again, add a rule to `conflicts.json`.

## Picking up someone else's work

Find the newest session with `status: "paused"` on your branch (the briefing lists it). Start a **new** session file,
set `continues` to the old session's `id`, and work from its `next_steps`. Don't reopen the old file.

## Why one file per session

A single shared log conflicts on every parallel branch. Per-session files are append-only by construction, so merging
`claude/sessions/` never conflicts. Only `project.json` and `conflicts.json` are shared; they are keyed objects so
conflicts are small and resolved by the rules in `conflicts.json` → `rules[path="claude/*.json"]`.

## Resolving merge conflicts

Follow `conflicts.json`. Short version: understand both sides' intent first (their session files + `git log`), never
resolve by blanket `--ours`/`--theirs` on source files, regenerate generated files instead of hand-merging, then run
`npm run typecheck && npm run lint` and record what you did in your session's `conflict_notes`.
