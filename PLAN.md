# Social Mapper — Build Plan

> Redefining social media, for learning.
> Audience: Claude Code (and the humans driving it). Scope: **hackathon demo**: polished visuals plus a working happy path. Optimize for the demo, not for scale.

---

## 0. Decisions already made

| Topic | Decision |
|---|---|
| Scope | Hackathon demo. Seeded data, no hardening. |
| Auth | **None.** Users create a profile. The server returns `userId` + `deviceKey`, both stored in `localStorage`, and the key is sent as a header on writes. This prevents casual impersonation, not real attacks. |
| Hosting | Vercel (Next.js App Router; React). |
| Database | **OCI Autonomous Database (Oracle 23ai)** via `node-oracledb` in **Thin mode** (no Instant Client; works in Vercel functions) over one-way TLS. |
| Other OCI | **OCI Generative AI** (hourly chat recaps) + **OCI Object Storage** (avatars, chat archives of expired groups). |
| Realtime | **LiveKit Cloud** for voice, screen share, room data messages, speaking detection, and a data-only `lobby` room for live home-graph updates. |
| Friendships | Request → accept. Edges are mutual and undirected. |
| Interests | 20 hardcoded rows in the DB. Users pick 3–6 during profile creation. These are the "mutual interest tags". |
| Groups | Anyone can create one, and names are unique (case-insensitive). A user is in **exactly one group at a time.** |

### Interpretations of the spec (flag these if wrong)
- **"Four circle buttons" but only three are listed.** The fourth button is **Leave group**: Text chat · Voice · Share screen · Leave.
- **Exit vs. 24h stay.** In the **room view**, a leaving user's circle slides out of the room ring and their edges fade. On the **home graph**, the user's circle stays attached to that group's blob (dimmed, "away") for 24h, or until they join another group.
- **Group expiry.** A group is deleted 24h after its last active member leaves. Before deletion, its chat is archived to Object Storage.
- **Mutual connections.** When you open someone's card, the edges between *them* and people who are *also your friends* are highlighted.

---

## 1. Tech stack (use libraries, customize them)

| Need | Library | Notes |
|---|---|---|
| Framework | `next` (App Router, TypeScript), `react` | API routes live in `app/api/**/route.ts` (Node runtime, not Edge, because oracledb needs Node). |
| UI primitives | **shadcn/ui** (Radix) + Tailwind | Dialog, Popover, Sheet, Tooltip, Badge, Button, Input, Textarea, Select, ScrollArea, Toggle, Sonner (toasts). Restyle them through theme tokens and don't write new primitives. |
| Icons | `lucide-react` | Line icons: `MessageSquare`, `Mic`/`MicOff`, `MonitorUp`, `LogOut`, `UserPlus`, `Bell`, `Linkedin`. |
| Graph | **`react-force-graph-2d`** (canvas + d3-force + d3-zoom) | Custom `nodeCanvasObject`, `linkCanvasObject`, `onRenderFramePre` for group blobs. Use `autoPauseRedraw={false}` so nodes can bob continuously. |
| Geometry | `d3-polygon` (`polygonHull`), `d3-shape` (`line` + `curveCatmullRomClosed`) | Smooth blob outlines around group members. |
| Motion | `motion` (Framer Motion) | Page transitions, profile card, dock, room-view node animations. |
| Background | Custom canvas (`components/ambient/NeonParticles.tsx`) | Floating neon lights with blur and glow. Cap at about 40 particles and respect `prefers-reduced-motion`. tsParticles v4 dropped the glow options this needed, so a small sprite-based canvas replaces it. |
| Realtime | `@livekit/components-react`, `livekit-client`, `livekit-server-sdk` | Tokens, RoomServiceClient.sendData, webhooks. |
| Data fetching | `swr` | `/api/graph` with revalidation triggered by lobby events. Fallback poll every 10s. |
| DB | `oracledb` (Thin mode) | Small pool per function instance (`poolMax: 4`). |
| OCI SDK | `oci-common`, `oci-generativeaiinference`, `oci-objectstorage` | API-key auth from env vars. |
| Validation | `zod` | Every API route body. |

---

## 2. Data model (Oracle 23ai)

```sql
CREATE TABLE interests (
  id        NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      VARCHAR2(60) NOT NULL UNIQUE,
  color     VARCHAR2(9)  NOT NULL           -- neon hex used for the tag glow
);

CREATE TABLE users (
  id               VARCHAR2(36) PRIMARY KEY,           -- uuid
  device_key_hash  VARCHAR2(64) NOT NULL,              -- sha256 of deviceKey
  name             VARCHAR2(80)  NOT NULL,
  linkedin         VARCHAR2(300),
  bio              VARCHAR2(280),
  avatar_url       VARCHAR2(500),                      -- OCI Object Storage URL
  current_group_id NUMBER,                             -- FK groups.id, nullable
  in_room          NUMBER(1) DEFAULT 0 NOT NULL,       -- 1 = connected to the LiveKit room now
  left_group_at    TIMESTAMP WITH TIME ZONE,           -- for the 24h "stay" rule
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

CREATE TABLE user_interests (
  user_id     VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  interest_id NUMBER       REFERENCES interests(id),
  PRIMARY KEY (user_id, interest_id)
);

CREATE TABLE interest_groups (
  id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR2(60) NOT NULL,
  name_key      VARCHAR2(60) GENERATED ALWAYS AS (LOWER(TRIM(name))) VIRTUAL,
  color         VARCHAR2(9) NOT NULL,                  -- derived from hash(name)
  created_by    VARCHAR2(36) REFERENCES users(id),
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  last_exit_at  TIMESTAMP WITH TIME ZONE,              -- set when active count hits 0
  CONSTRAINT uq_group_name UNIQUE (name_key)
);
ALTER TABLE users ADD CONSTRAINT fk_user_group
  FOREIGN KEY (current_group_id) REFERENCES interest_groups(id) ON DELETE SET NULL;

-- Chat stored in hourly buckets: one row per group per hour, messages as a JSON array
CREATE TABLE group_chat_hours (
  group_id    NUMBER REFERENCES interest_groups(id) ON DELETE CASCADE,
  hour_start  TIMESTAMP WITH TIME ZONE,                -- TRUNC(ts, 'HH24')
  messages    JSON NOT NULL,                           -- [{ "ts": iso, "userId": "...", "text": "..." }]
  summary     VARCHAR2(1000),                          -- OCI GenAI recap, filled by cron
  PRIMARY KEY (group_id, hour_start)
);

CREATE TABLE friendships (
  user_a      VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,  -- always user_a < user_b
  user_b      VARCHAR2(36) REFERENCES users(id) ON DELETE CASCADE,
  requested_by VARCHAR2(36) NOT NULL,
  status      VARCHAR2(10) DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT ck_order CHECK (user_a < user_b)
);
```

**Appending a chat message** (single statement, no read-modify-write):
```sql
MERGE INTO group_chat_hours t
USING (SELECT :gid g, TRUNC(SYSTIMESTAMP,'HH24') h FROM dual) s
ON (t.group_id = s.g AND t.hour_start = s.h)
WHEN MATCHED THEN UPDATE SET t.messages = JSON_TRANSFORM(t.messages, APPEND '$' = JSON(:msg))
WHEN NOT MATCHED THEN INSERT (group_id, hour_start, messages) VALUES (s.g, s.h, JSON_ARRAY(JSON(:msg)));
```

### Seed: the 20 interests
`CS3251` · `Badminton` · `Baby Bio` · `Machine Learning` · `Startups` · `Pre-Med` · `Linear Algebra` · `Hackathons` · `Robotics` · `Game Dev` · `Photography` · `Film` · `Jazz` · `Chess` · `Debate` · `Philosophy` · `Rock Climbing` · `Running` · `Cooking` · `Spanish`

Assign each interest a color from the neon palette (§4), cycling through it.

### Seed: demo world (`scripts/seed.ts`)
- About 30 users with realistic names and bios. Each has 3–6 interests.
- 6 groups: e.g. "CS3251 Exam Cram", "Badminton Sunday", "Baby Bio Study Hall", "Startup Ideas", "ML Paper Club", "Late Night Chess".
- About 45 accepted friendships (cross-group edges matter for visuals) and 3 pending requests addressed to the demo user.
- 2 groups have pre-filled chat with summaries, so the GenAI recap is visible right away.

---

## 3. API surface (`app/api/**`)

All writes require the `x-user-id` + `x-device-key` headers, which are checked against `device_key_hash`. After each state change, the server broadcasts an event to the LiveKit `lobby` room so every home graph updates live.

| Route | Purpose |
|---|---|
| `GET /api/interests` | The 20 interests. |
| `POST /api/users` | Create profile → `{ userId, deviceKey }`. |
| `GET/PATCH /api/users/[id]` | Profile read/edit. |
| `POST /api/avatars/upload-url` | Returns an OCI Object Storage **pre-authenticated request** URL for a direct PUT from the browser. |
| `GET /api/graph` | `{ users, groups, edges }` with visible groups only (§5 lifecycle), each user's `groupId`, `inRoom`, and `away`. |
| `POST /api/groups` | Create with a unique name. Returns `409` and "Name taken" on conflict. |
| `POST /api/groups/[name]/join` | Moves the user. If their old group's active count hits 0, sets `last_exit_at`. Broadcasts `user_moved`. |
| `POST /api/groups/[name]/leave` | Sets `in_room=0` and `left_group_at`, keeps `current_group_id`, updates `last_exit_at` if needed. Broadcasts `user_left_room`. |
| `GET /api/groups/[name]/chat?before=` | Paged hourly buckets + summaries. |
| `POST /api/groups/[name]/chat` | Persists the message (MERGE above), then `sendData` to that group's LiveKit room. |
| `POST /api/friends/request` · `/accept` · `/decline` | Broadcasts `friend_accepted` on accept. |
| `GET /api/friends/pending` | Requests addressed to me. |
| `POST /api/livekit/token` | `{ room }`. Rooms are `lobby` (data-only, `canPublish:false`) or `g:<groupId>` (full). |
| `POST /api/livekit/webhook` | On `participant_left`, sets `in_room=0`. This covers closed tabs. |
| `GET /api/cron/hourly` | Vercel Cron, protected by `CRON_SECRET`. Generates GenAI summaries and expires groups (§5). |

**Lobby event shape:** `{ type: 'user_moved' | 'user_left_room' | 'user_created' | 'friend_accepted' | 'group_created' | 'group_expired', payload }`. The client applies it optimistically to the graph state, then lets SWR revalidate.

---

## 4. Design system

### Tokens (Tailwind theme + CSS variables)
| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#03050C` | Page base |
| `--bg-1` | `#0A1230` | Radial gradient center (deep blue) |
| `--surface` | `rgba(14, 22, 52, 0.72)` + `backdrop-blur-xl` | Cards, dock, sheets |
| `--border` | `rgba(120, 150, 255, 0.14)` | Hairlines |
| `--text` / `--text-dim` | `#E6ECFF` / `#8A96C2` | |
| Neon palette | `#22D3EE` cyan · `#A78BFA` violet · `#F472B6` pink · `#34D399` mint · `#FBBF24` amber · `#60A5FA` blue · `#FB7185` coral · `#A3E635` lime | Groups, tags, particles |

Font: **Inter** for UI and **Space Grotesk** for headings and group names (via `next/font`).

### Ambient layer (always on, behind everything)
1. Body background: `radial-gradient(ellipse at 50% 40%, var(--bg-1), var(--bg-0) 70%)`.
2. **tsParticles**: about 40 dots, radius 1–3px, random neon colors, `shadow.blur 12`, opacity 0.3–0.8 with a slow twinkle, speed 0.2, no links.
3. 3–4 huge blurred color "auras" (`div`s, `blur-3xl`, 8% opacity) that drift slowly via CSS keyframes (60s+).

### Node (user circle) rendering, in `nodeCanvasObject`
- Radius 7 (world units). Fill is the user's primary interest color at 85%. 1px white ring at 30%. Initials when zoomed in (`globalScale > 2.5`) and avatar image when `> 4`.
- Glow: `ctx.shadowBlur = 14`, `shadowColor = color`.
- **Bob:** render-time offset only (doesn't touch physics): `y += sin(t/1400 + phase) * 1.5`, `x += cos(t/1900 + phase) * 0.8`, with a random `phase` per node. Edges are drawn to the *rendered* positions in `linkCanvasObject`, so lines shift along with the nodes.
- Away users (left the room <24h ago) render at 45% opacity with no glow.
- **Hover:** scale to 1.25, `shadowBlur 28`. All other nodes and edges dim to 35% except the hovered node's friends. Cursor becomes a pointer.

### Edge rendering
- Default: `rgba(160,180,255,0.18)`, width 0.6.
- Highlighted (hover or mutual): gradient between the two endpoint colors, alpha 0.9, width 1.6, plus a soft glow.
- New friendship: animate a dash offset to "draw" the line in over 800ms.

### Group blobs, in `onRenderFramePre`
- For each group, take member *rendered* positions and add 8 padding points on a circle of radius 22 around each one. Compute `polygonHull`, then draw it with `curveCatmullRomClosed(0.6)`.
- Fill is a radial gradient (group color at 14% in the center → 4% at the edge). Stroke is the group color at 25% with `shadowBlur 30`.
- The group name sits above the blob in Space Grotesk, at 70% opacity, and is hidden when `globalScale < 0.6`.
- Groups with 1–2 members get a padded circle instead of a hull.
- On hover, the blob fill rises to 22% and the name to 100%.

### Profile mini window (click a user)
- A shadcn `Popover`, anchored at the node's screen position via `graph2ScreenCoords`, and wrapped in `motion.div` (scale 0.92→1, fade, 180ms spring).
- Contents: avatar, name, bio, LinkedIn button, **interest tags** (shadcn `Badge`), then **Add friend** / **Pending** / **Friends ✓**.
- **Mutual interest tags glow:** tags you share with the viewer get the interest color border, `box-shadow: 0 0 12px color`, and a slow pulse. The others are dim outlines.
- **Mutual connection lines become vivid** while the card is open: edges from the clicked user to the viewer's friends switch to the highlighted style, and those friend nodes get a faint ring.

### Motion principles
- Durations: 150–250ms for UI and 500–800ms for camera moves. Easing: `[0.22, 1, 0.36, 1]`.
- `prefers-reduced-motion` disables bobbing, particles and the tremble effect. Camera moves become instant cuts.

---

## 5. Pages and behaviors

### 5.1 `/` Home (the map)
- Full-viewport `ForceGraph2D`. The top-left wordmark reads "Social Mapper". The top-right has the **Bell** (pending friend requests, Popover list with Accept/Decline), the **"+ New group"** button (Dialog with a name input that shows a live "name taken" error from 409), and **your avatar** (opens the edit-profile Sheet).
- **Clustering forces:** each group gets an *anchor* point. Anchors are laid out on a phyllotaxis spiral (golden angle, radius ∝ √i × 220) so they're stable and spread out. A custom force pulls each node toward its group's anchor (`strength 0.08`). Users with no group drift in an outer ring. Also apply `forceManyBody(-40)`, `forceCollide(12)`, and link distance 60 with low strength (0.05), so friendships pull a little without wrecking clusters.
- **Zoom:** scroll wheel or trackpad through the built-in d3-zoom. Keep its default direction (scroll up zooms in, scroll down zooms out). Do not invert it to match the room. Clamp to `[0.3, 8]`.
- **Live move:** when a `user_moved` lobby event arrives, update that node's `groupId`. Its anchor force pulls it across the map and its edges follow. Reheat the sim with `d3ReheatSimulation()` at low alpha (0.3). Also pulse the destination blob once.
- **First visit with no profile:** the map still renders behind a centered **Create Profile** Dialog.

### 5.2 Zoom into a group → `/g/[name]`
1. Click a blob. `zoomToFit(600, 80, n => n.groupId === g.id)` runs, everything else fades to 0 over 400ms, and the blob fill brightens.
2. At 600ms, `router.push('/g/<name>')`. The room page mounts with a `clip-path: circle()` reveal that expands from screen center, and the background stays continuous because the ambient layer lives in the root layout.
3. Joining calls `POST /join`, then connects to LiveKit room `g:<id>`.

Back (**scroll up**, Esc, browser back or Leave): play the reverse. The room collapses to a circle, the map is restored with the camera on the group, and then it zooms out to the previous transform (kept in a context/store). All four triggers call the same `exitRoom()` function.

**Scroll up to zoom out (required):** scrolling up anywhere in the room zooms you back out to the main map.
- **Detection:** a `wheel` listener on the room stage (`{ passive: false }`).
  - Plain scroll up (`deltaY < 0`) counts toward exiting.
  - A trackpad pinch-out arrives as `wheel` with `ctrlKey` and `deltaY > 0`. It counts too, so both "zoom out" gestures work.
  - Mobile: a two-finger pinch-in on the stage (pointer events) triggers the same flow.
- **Scrubbed, not instant:** accumulate the scroll distance and map it to `progress` 0→1 (threshold about 160px of `deltaY`). As `progress` grows:
  - The room scales down (1 → 0.85).
  - The `clip-path` circle shrinks.
  - The map's blob fades in behind it.
- **Commit or cancel:** at `progress ≥ 1`, call `exitRoom()` and play the rest of the reverse transition. If scrolling stops for 250ms before the threshold, spring back to `progress = 0`. Scrolling down while `progress > 0` also rewinds it.
- **Ignore scrolls inside scrollable panels:** the chat `Sheet` (`ScrollArea`), popovers and the screen-share panel keep their normal scrolling. Skip events whose target is inside `[data-scroll-region]`.
- **Trackpad inertia:** after an exit commits, ignore wheel events for 600ms so momentum doesn't zoom the map as well.
- **Reduced motion:** the same threshold applies but there is no scrubbing. It cuts straight to the map.
- **Hint:** on the first room visit, show a small fading hint above the dock ("Scroll up to zoom out") for 3s. Remember in `localStorage` that it was shown.
- **What exiting does:** scrolling out is the same as Leave. It disconnects LiveKit, calls `POST /leave`, and leaves you shown as away in that group on the map.

### 5.3 Room view
- **Layout:** one large glowing circle (the "room") centered on screen. Members are SVG `motion.circle`s arranged on a ring inside it, larger (radius 28) with avatars and names. Friendship edges are drawn between members. The same bob, hover and click-to-card behavior applies. Small N, so SVG + Motion is fine here.
- **Dock:** four 56px circular glass buttons centered at the bottom (shadcn `Button` `size="icon"` + `rounded-full`, with Tooltips):
  1. **Text chat** (`MessageSquare`) opens a right-side shadcn `Sheet`. It shows the hourly buckets from the API, each with an hour divider and the **OCI GenAI recap** ("While you were away…") as a collapsible card. New messages arrive through the LiveKit data channel. The composer posts to `/api/groups/[name]/chat`.
  2. **Voice** (`Mic`/`MicOff`) toggles `localParticipant.setMicrophoneEnabled`. Active state shows a neon ring.
  3. **Share screen** (`MonitorUp`) calls `setScreenShareEnabled`. The shared screen appears as a floating, draggable, resizable panel (`motion` drag) above the room using LiveKit's `VideoTrack`.
  4. **Leave** (`LogOut`, coral) runs the exit flow below.
- **Trembling speaker:** subscribe to each participant's `audioLevel` (via `useParticipants` + `ParticipantEvent.IsSpeakingChanged`, sampled with requestAnimationFrame). While speaking, apply a jitter transform `translate(rand(-a,a), rand(-a,a))` with `a = 1 + audioLevel * 5` px every frame, plus an outer ring whose radius scales with the level.
- **Someone exits:** their node animates radially outward past the room ring (500ms) and fades. Their edges fade over 400ms and then the node is removed. **Someone joins:** the reverse, sliding in from the edge.

### 5.4 Group lifecycle
- Active members = users with `current_group_id = g` and `in_room = 1`.
- When the count goes to 0, set `last_exit_at = now`.
- **Home visibility:**
  - A group is visible if it has active members or `last_exit_at > now - 24h`.
  - A user is shown in their group if `in_room = 1`, or as "away" if `left_group_at > now - 24h`. Otherwise they're ungrouped.
- **Hourly cron:**
  - For groups with `last_exit_at < now - 24h` and no active members, write all `group_chat_hours` as JSON to Object Storage `chat-archive/<group>/<date>.json`, delete the group, and broadcast `group_expired`. The blob fades out on clients.
  - For every completed hour bucket with ≥5 messages and no summary, call OCI GenAI and save a 1–2 sentence `summary`.
- Demo affordance: the `FAST_CLOCK=1` env var shrinks 24h to 2 minutes so expiry can be shown live.

### 5.5 Create / edit profile
- Dialog on first visit, Sheet for editing. Built from shadcn `Form` + `zod`.
- Fields: **Name\***, **LinkedIn** (URL validated to `linkedin.com/in/`), **Short bio** (Textarea, 280 chars with a counter), **Interests** (toggle chips for the 20, pick 3–6), and **Avatar** (optional upload through a PAR URL, falling back to initials).
- On submit, save `{ userId, deviceKey }` to localStorage. Your new circle **pops into the map** (scale 0→1 with a glow burst) in the ungrouped ring.

---

## 6. OCI integration details

- **Autonomous DB:** Enable **TLS without wallet** (mTLS not required) and set the ACL to allow Vercel egress (for a hackathon, `0.0.0.0/0` with a strong password). Connect string: the `_low` service TLS descriptor. Module `lib/db.ts` exports a lazily created pool plus a `query<T>()` helper. Add `scripts/migrate.ts` (runs `db/schema.sql`) and `scripts/seed.ts`.
- **Generative AI:** `lib/genai.ts` exposes `summarizeHour(messages): Promise<string>` using `GenerativeAiInferenceClient.chat` with a current Cohere Command or Meta Llama chat model available in the tenancy region. Prompt: *"Summarize this study-group chat in ≤2 friendly sentences for someone who missed it. Mention topics, not people's private info."* Timeout 8s. On failure, skip silently.
- **Object Storage:** One bucket `social-mapper` with prefixes `avatars/` and `chat-archive/`. Avatars use a short-lived write PAR per upload plus a bucket-level read PAR (or a public bucket for the demo) for display.

---

## 7. Project structure

```
app/
  layout.tsx                 # fonts, ambient background, providers (SWR, Lobby, Toaster)
  page.tsx                   # Home map
  g/[name]/page.tsx          # Room
  api/...                    # §3
components/
  ambient/NeonParticles.tsx, Auras.tsx
  map/SocialGraph.tsx        # ForceGraph2D wrapper (dynamic import, ssr:false)
  map/draw.ts                # nodeCanvasObject, linkCanvasObject, drawBlobs
  map/forces.ts              # group anchor force, phyllotaxis
  room/RoomStage.tsx, RoomMember.tsx, Dock.tsx, ChatSheet.tsx, ScreenSharePanel.tsx
  profile/ProfileCard.tsx, ProfileForm.tsx, InterestChips.tsx
  friends/RequestsBell.tsx
  ui/                        # shadcn generated
lib/
  db.ts, genai.ts, storage.ts, livekit.ts, auth.ts (device key check), events.ts (lobby broadcast), colors.ts
hooks/
  useMe.ts, useGraph.ts, useLobby.ts, useSpeakingLevel.ts, useReducedMotion.ts
db/schema.sql
scripts/migrate.ts, seed.ts
vercel.json                  # crons: [{ path: "/api/cron/hourly", schedule: "0 * * * *" }]
```

### Environment variables
`ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`, `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY` (PEM, `\n`-escaped), `OCI_REGION`, `OCI_COMPARTMENT_OCID`, `OCI_GENAI_MODEL_ID`, `OCI_OS_NAMESPACE`, `OCI_OS_BUCKET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CRON_SECRET`. Provide `.env.example`.

---

## 8. Build phases (in order, each ends demoable)

**Phase 1 — Skeleton and ambience**
Next.js + Tailwind + shadcn init, design tokens, fonts, ambient particles + auras, empty map page.
✅ Dark deep-blue page with drifting neon lights. Lighthouse shows no layout shift.

**Phase 2 — Database and seed**
`schema.sql`, `lib/db.ts`, migrate and seed scripts, `GET /api/interests`, `GET /api/graph`.
✅ `curl /api/graph` returns 30 users, 6 groups and about 45 edges from OCI.

**Phase 3 — The map**
ForceGraph2D with anchor forces, custom node, edge and blob drawing, bobbing, hover dimming, zoom clamp.
✅ Six glowing blobs of bobbing circles with shifting edges. Hover highlights and scroll zoom are smooth at 60fps with 30 nodes.

**Phase 4 — Profiles and friends**
Create-profile Dialog, ProfileCard popover with mutual-tag glow and mutual-edge highlight, friend request/accept, Bell.
✅ A new user appears on the map. Clicking a seeded user shows glowing shared tags. Accepting a request draws a new edge.

**Phase 5 — Lobby realtime and group moves**
LiveKit token route, `useLobby`, server broadcasts, create/join group, live node migration.
✅ With two browsers open, joining a group in A makes A's circle glide to that blob in B within about 1s.

**Phase 6 — Rooms**
Zoom-in transition, RoomStage, Dock, voice with trembling, screen share panel, chat Sheet (persist + data channel), Leave flow with slide-out and edge fade, scroll-up-to-exit gesture, webhook.
✅ Two people talk and the speaker's circle trembles. Screen share shows up. Chat persists across reloads in hourly buckets. Scrolling up in a room scrubs back out to the map, while scrolling inside the chat panel does not.

**Phase 7 — Lifecycle and OCI extras**
Cron route (GenAI summaries + expiry + archive), avatar upload via PAR, `FAST_CLOCK` demo mode.
✅ Recap cards show up in chat. With `FAST_CLOCK=1`, an emptied group fades from the map and its archive JSON appears in the bucket.

**Phase 8 — Polish**
Reduced-motion handling, empty states, toasts, loading shimmer on the map, mobile check (map pinch-zoom works, dock fits at 375px), favicon and OG image.

---

## 9. Demo script (3 minutes)
1. Land on the map: ambient lights and bobbing clusters. Scroll-zoom.
2. Hover a node, then click it. Shared tags glow (CS3251, Badminton) and mutual lines light up. Send a friend request.
3. Second laptop: accept the request, and the edge draws in live on both screens.
4. Click "CS3251 Exam Cram". Zoom in and the room reveals itself. Read the GenAI recap in chat.
5. Turn on voice and talk: your circle trembles. Share screen.
6. Scroll up to zoom back out: your circle slides out and the edges fade. Back on the map you're dimmed in that group.
7. Use `FAST_CLOCK=1` to show an empty group expiring and archived to OCI Object Storage.

---

## 10. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Oracle cold connections from serverless are slow (1–2s) | Reuse the pool across invocations (module-level singleton). Keep the `/api/graph` payload small and cache it 2s at the edge (`s-maxage=2`). |
| Canvas perf with glow (`shadowBlur` is expensive) | Pre-render node sprites per color to an offscreen canvas once and `drawImage` them. Only use live `shadowBlur` for hovered or selected nodes. |
| Hull flicker as nodes bob | Compute hulls from *physics* positions (not bobbed ones) and smooth them with a lerp each frame. |
| LiveKit free-tier limits | Fine for a demo. Lobby participants are data-only and don't publish tracks. |
| No auth | Clearly labeled demo. Keep the device key hash check so random curl requests can't impersonate users. |
| Mic/screen permissions in the demo browser | Pre-grant on the demo machines. Test on Chrome. |

---

## 11. Revision 2 (implemented)

| Change | How it works |
|---|---|
| Drag nodes | Only your own circle can be dragged. Dropping it inside another bubble joins that community and makes it your active room. Dropping it in open space parks it there. |
| 2x nodes | Map nodes have a 14-unit radius (was 7), with spacing, collision and blob padding scaled up to match. |
| Exiting a room | Your node stays in the bubble (shown as "away"). The view zooms back out around it. |
| Rooms keep the map layout | Entering a bubble zooms the live map into it, so people and edges stay exactly where they were. The room is just controls layered on top: header, dock, chat and screen shares. Speakers tremble in place on the map, and there is no separate ring layout any more. |
| You at the center | Your current bubble (or you, if you're in none) takes the center slot. Other focused bubbles spiral out around it. |
| Focused bubbles | A bubble is focused if it passes the filter bar and the search box, and (under a finite degrees setting) has someone visible in it. Focused bubbles glow, are full size and fit in view. Unfocused ones are smaller, don't glow, and line up in a strip to the right that you reach by panning sideways. |
| Bookmarks | `users.bookmarks` is a JSON array of `{ id, name, groupIds }`, returned only to the owner. The bookmark icon at the upper left slides in a translucent pane with your lists. The ＋ at the bottom adds a list. Clicking a list focuses just its bubbles. Double-clicking a bubble opens an "Add to: …" mini window. |
| Category tags | `interest_groups.category` is one of 10 tags, picked when the group is created: Academics, Tech, Science, Health & Pre-Med, Arts & Media, Sports & Fitness, Games, Career & Startups, Languages & Culture, Social. |
| Filter bar | A translucent rounded bar holds Select all, Select none, a chip for each bookmark and tag, and a search box. Chips cycle on → off → ✕ exclude → no rule. Excludes win. While any chip is on or off, a bubble must match an "on" chip. Search matches bookmark, tag, username or bubble name. |
| Degrees slider | A bottom bar reading "SHOW N DEGREES OF CONNECTION" (1–5 or ∞), measured from you. People further away are hidden. |
| Many communities | A new `group_members` table records every community someone joins. Their node appears in only one active room (`users.current_group_id`). Memberships stay when they leave and are listed on the profile card. |
| White mode | A switch at the upper right sets light or dark CSS tokens. The choice is saved in localStorage and applied before paint. Canvas colors and ambient lights adapt too. |
| Cumulative notes document | Deferred (WIP). |

Schema changes: `interest_groups.category`, `users.bookmarks`, and a new `group_members` table. Run `npm run db:migrate -- --reset` and then `npm run db:seed` on an existing database.
