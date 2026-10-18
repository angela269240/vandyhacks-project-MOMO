# Team setup: `.env.local`

Everyone on the team shares one backend: an OCI Autonomous Database, two Object Storage buckets and OCI Generative AI in
`us-chicago-1`, plus the LiveKit Cloud project **orbit**. Production runs on the Vercel project `vandyhacks-project-momo`.

## Get running (teammates)

1. Pull the latest code. The Oracle schema and bind-variable fixes are required before the database works:
   ```bash
   git pull
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Get `.env.local` from the project owner through a **private, expiring** channel such as a Bitwarden Send or a
   1Password share link. Never paste it into Slack, Discord, GitHub, email, or an AI chat: it contains the OCI private
   key and database password.
4. Save it as `.env.local` in the repo root, then make it readable only by you:
   ```bash
   chmod 600 .env.local
   ```
5. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. You're on the shared cloud data, not the in-memory demo world.

## Rules for the shared database

- **Don't run `npm run db:migrate -- --reset`.** It drops every table for the whole team.
- `npm run db:seed` deletes and recreates only the seeded demo rows (`seed-*` users and the seed groups). Check with the
  team before running it.
- Schema changes go in `db/schema.sql` with a PR, and one person applies them.

## What's in `.env.local`

| Variable | What it is | Where it comes from |
|---|---|---|
| `ORACLE_USER`, `ORACLE_PASSWORD` | Autonomous Database login (`ADMIN`) | Set when the database was created |
| `ORACLE_CONNECT_STRING` | TLS connect string for the `momo_low` service | OCI Console → Autonomous Database `momo` → Database connection |
| `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY` | API signing key for Object Storage and Generative AI; the PEM is on one line with `\n` escapes | OCI Console → User settings → API keys |
| `OCI_REGION` | `us-chicago-1`, where every resource and the Cohere model live | |
| `OCI_COMPARTMENT_OCID` | Compartment for Generative AI calls (the tenancy root) | |
| `OCI_OS_NAMESPACE` | Object Storage namespace | `oci os ns get` |
| `OCI_OS_BUCKET` | `social-mapper`: private bucket for `chat-archive/` | |
| `OCI_OS_AVATAR_BUCKET` | `social-mapper-avatars`: public-read bucket (no listing) for `avatars/` | |
| `OCI_GENAI_MODEL_ID` | `cohere.command-a-03-2025` | OCI Console → Generative AI → Playground |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud project **orbit** | cloud.livekit.io → Settings → API Keys |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/expire-groups` | Random string |
| `FAST_CLOCK`, `DEMO_WELCOME_REQUESTS` | Demo toggles (see README) | Leave empty normally |
| `VERCEL_OIDC_TOKEN` | Added by `vercel link`; only on the owner's machine | Not needed by teammates |

## For the project owner

- **Share the file:** use an expiring secure link that allows one view, and send the password for that link separately.
- **Change a value:** update `.env.local`, then the Vercel project (`vercel env add NAME production --force`, and the
  same for `preview` and `development`), then send the team the new value.
- **If the file leaks:** delete the API key in OCI Console → User settings → API keys and add a new one; reset the
  `ADMIN` password (Autonomous Database → More actions → Administrator password); regenerate the LiveKit key; then
  redistribute the file.
- **Teammates on Vercel:** the `EL's projects` team is on the Hobby plan, which allows only one member. Teammates can't
  run `vercel env pull` unless the team is upgraded to Pro.
