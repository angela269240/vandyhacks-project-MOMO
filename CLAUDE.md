# Orbit: agent instructions

@AGENTS.md
@claude/README.md

Start of every session: the `SessionStart` hook prints a briefing from `claude/session-start.mjs` (git state, open
sessions on every branch, claim overlaps, conflicts, project facts). If you don't see it, run
`node claude/session-start.mjs` yourself before editing anything. Then register with `node claude/new-session.mjs`.

Durable facts, invariants and dangerous commands: `claude/project.json`. Merge conflicts: `claude/conflicts.json`.
