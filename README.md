# Orbit

Redefining social media, for learning. A live map of people (glowing circles) and their friendships (lines), grouped into
interest-group blobs. Click a blob to zoom into its virtual room for text chat, voice, and screen share; click outside it, use Exit,
or scroll up to zoom back out.

See [PLAN.md](PLAN.md) for the full design.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no env vars it runs entirely locally:

| Piece | Without config | With config |
|---|---|---|
| Data | In-memory demo world (30 people, 6 groups), resets on restart | OCI Autonomous Database (`ORACLE_*`) |
| Realtime map + chat | Server-Sent Events (single process only) | LiveKit data messages (`LIVEKIT_*`) |
| Voice / screen share | Your own mic level + local screen preview | LiveKit Cloud rooms |
| Avatars | Process memory | OCI Object Storage via pre-authenticated URLs (`OCI_*`) |

Copy `.env.example` to `.env.local` and fill in what you have.

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

`npm run db:migrate -- --reset` drops and recreates everything.

### LiveKit

Create a LiveKit Cloud project, set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, and add a webhook pointing to
`https://<your-deployment>/api/livekit/webhook` so closed tabs leave their rooms.

### Deploying to Vercel

Set the same env vars in the Vercel project. `vercel.json` schedules `/api/cron/expire-groups` once a day (Hobby plans only allow daily
crons), which archives then deletes groups that have been empty for 24 hours. On Vercel, use LiveKit for realtime: the SSE fallback only works in a single process.

## Demo tips

- `FAST_CLOCK=1` shrinks the 24-hour linger to 2 minutes; leave a group, wait, then call `/api/cron/expire-groups` to watch it fade.
- New profiles get two friend requests from seeded classmates so the bell has something in it (`DEMO_WELCOME_REQUESTS=0` turns this off).
- Open two browser windows (one private) to see moves, new friendships and chat appear live.

## Code map

- `app/(map)/layout.tsx` keeps the map mounted; `app/(map)/g/[name]` renders the room as an overlay on top of it.
- `components/map/SocialGraph.tsx` handles the force graph, blobs, bobbing, glow, hover and focus highlighting.
- `components/room/RoomView.tsx` handles join/leave, the reveal and scroll-out transitions, the dock, chat and media.
- `lib/store/` has the `Store` interface with `oracle.ts` and `memory.ts` implementations.
- `lib/events.ts` fans out lobby and room events through LiveKit or the SSE bus.
