# Orbit

Redefining social media, for learning. A live map of people (glowing circles) and their friendships (lines), grouped into
interest-group blobs. Click a blob to zoom into its virtual room for text chat, voice, and screen share; click outside it, use Exit,
or scroll up to zoom back out.

See [PLAN.md](PLAN.md) for the full design.

## Local setup

Requirements: Node.js 20.9 or newer and npm. Run commands from this directory—the one that contains this `README.md` and
`package.json`—rather than from the parent directory that holds the other `momo-*` working copies.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). All environment variables are optional for local development:

| Piece | Without config | With config |
|---|---|---|
| Data | In-memory demo world (30 people, 6 groups), resets on restart | OCI Autonomous Database (`ORACLE_*`) |
| Realtime map + chat | Server-Sent Events (single process only) | LiveKit data messages (`LIVEKIT_*`) |
| Voice / screen share | Your own mic level + local screen preview | LiveKit Cloud rooms |
| Avatars | Process memory | OCI Object Storage via pre-authenticated URLs (`OCI_*`) |
| Verification emails | Six-digit codes are printed in the server log | Any SMTP provider (`SMTP_*`) |
| AI features + moderation | Deterministic fallbacks and keyword moderation | OCI Generative AI (`OCI_GENAI_MODEL_ID`) |

Fill in only the sections of `.env.local` you want to enable. New accounts require a `.edu` address; without SMTP, read the
verification code from the terminal running `npm run dev`.

Useful checks before committing or deploying:

```bash
npm run typecheck
npm run lint
npm run build
```

### OCI Autonomous Database

1. In the DB console, enable **TLS (mTLS not required)** and add an access-control list entry (for a hackathon, `0.0.0.0/0`).
2. Put the `_low` TLS connect string and credentials in `.env.local`.
3. Create tables and seed the demo world:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

`npm run db:migrate -- --reset` drops and recreates everything. A database created before the screen-share slot
was added needs `npm run db:migrate -- --upgrade` (adds `interest_groups.screen_sharer_id`; safe to re-run).

### LiveKit

Create a LiveKit Cloud project, set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, and add a webhook pointing to
`https://<your-deployment>/api/livekit/webhook` so closed tabs leave their rooms and an abandoned screen share frees the
room's share slot. Without LiveKit, rooms still work for presence and chat, but voice and screen sharing are a local preview
that only you see.

### Email verification and admin access

Orbit uses six-digit, ten-minute codes for `.edu` signup and admin sign-in. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`, and optionally `EMAIL_FROM`. `EMAIL_FROM` must be an approved sender when using OCI Email Delivery.

Set `AUTH_SECRET` to a long random value in deployed environments; it signs verified-email tokens and the admin session
cookie. Set `ADMIN_EMAILS` to a comma-separated allowlist, then open `/admin` to sign in and review moderation reports.

Email is sent by the server through `nodemailer`; it must remain in `dependencies`, not `devDependencies`.

### OCI Generative AI and moderation

Set `OCI_GENAI_MODEL_ID` together with the OCI identity, region, and compartment variables to enable AI onboarding
suggestions, room-note assistance, chat summaries, and moderation. The daily moderation job reviews usernames, group names,
the last 24 hours of chat, and recently edited room notes. It archives the review input and stores deduplicated flags for
the `/admin` dashboard. Without GenAI, a small keyword-based fallback runs instead.

### Deploying to Vercel

Set the same environment variables in the Vercel project. `vercel.json` runs moderation daily at 04:00 UTC and group expiry
daily at 09:00 UTC. The expiry job archives and then deletes groups that have been empty for 30 days. Set `CRON_SECRET` so
the cron routes require Vercel's bearer token. On Vercel, use LiveKit for realtime: the SSE fallback only works in a single
process.

## Troubleshooting

### `Can't resolve 'nodemailer'`

Install dependencies inside this application directory:

```bash
pwd                    # should end in /momo-deploy
npm ci
npm ls nodemailer
node -p "require.resolve('nodemailer')"
```

If this fails only on another computer, pull the same branch and confirm that both `package.json` and `package-lock.json` are
present before running `npm ci`. Do not install from the parent `oraclehackathon26` directory; it has no root `package.json`.
If the editor still shows a stale error after those commands succeed, restart its TypeScript language server or reopen this
folder as the workspace root.

## Demo tips

- `FAST_CLOCK=1` shrinks the 24-hour linger to 2 minutes; leave a group, wait, then call `/api/cron/expire-groups` to watch it fade.
- New profiles get two friend requests from seeded classmates so the bell has something in it (`DEMO_WELCOME_REQUESTS=0` turns this off).
- Open two browser windows (one private) to see moves, new friendships and chat appear live.

## Working with Claude / AI agents

[`claude/`](claude/README.md) is shared, machine-readable handoff memory for every agent session and every teammate's
instance. Claude Code loads it automatically at session start:

- `CLAUDE.md` (read by Claude Code every session) imports `AGENTS.md` and the protocol in `claude/README.md`.
- `.claude/settings.json` has a `SessionStart` hook that runs `node claude/session-start.mjs`. It prints the branch,
  ahead/behind counts against main, any conflicts in progress with their resolution rules, open sessions on **every**
  branch (with the files they claim), overlaps with your changes, and the project's invariants. Accept the hook the
  first time Claude Code asks. Personal settings go in `.claude/settings.local.json` (ignored).

| File | What |
|---|---|
| `claude/project.json` | Stack, commands, invariants, dangerous commands, design direction, code map, gotchas |
| `claude/conflicts.json` | Merge-conflict procedure plus a rule for each conflict-prone path (lockfile, `globals.css`, `lib/colors.ts`, schema, store parity, …) |
| `claude/sessions/*.json` | One record per session: goal, status, claimed files, decisions, verification, next steps. One file per session means they never conflict. |
| `claude/schema/session.schema.json` | Schema for session records |

Start a session record with `node claude/new-session.mjs "<goal>" --claim <path>`, update it before you stop, and commit
it with your work. If you run two agents at once, give each its own branch and `git worktree`.

## Code map

- `app/(map)/layout.tsx` keeps the map mounted; `app/(map)/g/[name]` renders the room as an overlay on top of it.
- `components/map/SocialGraph.tsx` handles the force graph, blobs, bobbing, glow, hover and focus highlighting.
- `components/room/RoomConnection.tsx` owns the live room (join, LiveKit or local media, chat, screen-share claim). It sits in
  the `(map)` layout, so **Minimize** (or browser back) returns to the map without disconnecting; only **Leave** ends it.
- `components/room/RoomView.tsx` is the room screen: header, stage, dock, chat column, and the enter/minimize/leave transitions.
  `RoomStage.tsx` draws the bubble (`RoomBubble`), friendship lines (`RoomFriendshipEdges`) and people (`RoomMember`) from one
  animation loop; `ScreenShareStage.tsx` and `ParticipantCarousel.tsx` take over while someone is sharing.
- `lib/store/` has the `Store` interface with `oracle.ts` and `memory.ts` implementations.
- `lib/events.ts` fans out lobby and room events through LiveKit or the SSE bus.
