# Hearback

A Next.js app where students can ask questions and share honest feedback inside
professor-run communities, with anonymous replies and email-verified accounts.

## Features

- **Anonymous classroom communities** — students join with an invite code and
  post under a generated nickname. Nothing in the UI ever shows a real name.
- **Two community types**:
  - **Normal communities** — anyone with an account and the invite code can
    join. Fully anonymous, no AI moderation.
  - **Educational communities** — only students with a verified school email
    matching the community's format (for example `nitk.edu.in` or `edu.in`) can
    see and join. These get a profanity filter, optional AI moderation, and
    anonymous teacher controls.
- **AI helpers** (needs `GEMINI_API_KEY`) — "Fix my English", "Translate to
  English", and auto-summarising an uploaded lecture-notes PDF into a post
  description. The buttons hide themselves when no key is set.
- **Moderation without identity reveal** — faculty can hide content or ban an
  author from a report without ever seeing who they are, and students can appeal
  a ban in-app. See [Moderation and community safety](#moderation-and-community-safety).
- **Invite codes** with rotation and an optional expiry.
- **Teacher dashboard** — members, reports, review queue, join requests, ban
  appeals, settings and a full moderation log.

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (only if you want to run MongoDB locally)
- A MongoDB URI — either a local Docker container (below) or MongoDB Atlas

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy the sample file and fill in your values:

```bash
cp .env_sample .env
```

At minimum set `MONGODB_URI`, `AUTH_SECRET` (generate with
`openssl rand -base64 32`), and the email settings. See `.env_sample` for every
option, including the AI-moderation tuning flags.

## 3. Run MongoDB

You can use **either** a local Docker container **or** MongoDB Atlas — one at a
time. The app picks whichever `MONGODB_URI` resolves first.

### Option A — Local MongoDB via Docker (recommended for demos)

No Atlas login and no IP allow-list needed.

**Step 1 — Start the container** (run from the project root):

```bash
docker compose up -d
```

This starts a `mongo:7` container named `hearback-mongo` on
`localhost:27017`, storing data in the `hearback_mongo_data` volume.

**Step 2 — Point the app at the container.** Create a `.env.local` file
(gitignored) in the project root with:

```bash
MONGODB_URI=mongodb://localhost:27017/hearback
```

Next.js loads `.env.local` before `.env`, so this overrides the Atlas URI
without changing `.env`.

**Step 3 — Seed demo data into the local container.** The seed script reads
`.env` (Atlas) by default, so pass the Docker URI inline:

```bash
MONGODB_URI=mongodb://localhost:27017/hearback npm run seed
```

**Step 4 — Start the app:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Useful Docker commands:**

```bash
docker compose ps          # check the container is running
docker compose logs -f     # follow Mongo logs
docker compose stop        # stop (keeps data)
docker compose down        # stop and remove container (keeps data volume)
docker compose down -v     # stop and wipe all local data
```

> Start the container **before** the app. If a request hits while the container
> is down, the dev server exits on a failed DB connection.

### Option B — MongoDB Atlas

Use your Atlas connection string in `.env`:

```bash
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hearback
```

Make sure your current IP is allowed in Atlas (Network Access), then:

```bash
npm run seed   # optional: seed demo data into Atlas
npm run dev
```

### Switching between Docker and Atlas

- **Use Docker:** keep `.env.local` present (Option A).
- **Use Atlas:** delete or rename `.env.local` and run `npm run dev`.

Because `.env.local` is gitignored, your Atlas config in `.env` is never
modified and is safe to commit as a template.

## Email verification

Account sign-up sends a one-time code by email, chosen with `EMAIL_PROVIDER`:

- `gmail` — Gmail SMTP via Nodemailer (see `.env_sample` for App Password setup).
- `resend` — Resend, which requires a verified domain for real recipients.

For a live demo where email may be slow or land in Spam, set
`DEMO_OTP_MODE=true` in `.env`. The OTP is then shown directly on the
`/verify/[username]` page instead of being emailed.

## Moderation and community safety

### Content filters

- **Local profanity filter** runs on usernames, nicknames, community names,
  descriptions, topic titles/bodies, comments and DMs. It normalises leetspeak,
  repeated letters and spaced-out letters (`f.u.c.k`, `f u c k`) before matching.
  Offensive submissions are rejected with a clear message and add a strike.
- After **3 blocked attempts** (configurable via `STRIKE_MUTE_THRESHOLD`) a
  member is auto-muted for 24 hours, and the rejection message says so.

### AI moderation and the review queue

- Educational communities have optional AI moderation (per-community toggle,
  default on). Posts and comments are checked with Gemini before they are saved.
- Verdicts are cached in **MongoDB** — a SHA-256 hash of the normalised text plus
  a boolean only, never the raw content — so the cache is shared across every
  server instance and expires after 24 hours.
- The AI call is bounded by an `AbortController` timeout and a per-minute request
  budget (`AI_MODERATION_RPM`). On API errors, timeouts, malformed verdicts or
  when the budget is exhausted, the content is **allowed but flagged
  `needsReview`** so a slow or broken AI never blocks the class.
- Flagged content appears in the teacher's **Review** tab, where it can be
  hidden, deleted or marked reviewed.
- Set `AI_MODERATION_FORCE_REVIEW=true` in dev to route every educational post to
  the review queue without a Gemini key.

### Anonymous moderation, bans and appeals

- **No identity reveal.** Faculty moderate by nickname only; there is no "reveal
  author" action anywhere in the UI or API.
- From a report, a teacher can **ban the author anonymously**. The server bans
  the reporting account, hides the reported content and resolves the report —
  without ever telling the teacher who the author was.
- A ban records **two blocks**: the account, and a one-way SHA-256 hash of the
  student's verified school email. A fresh account with the same school email is
  rejected on join, so someone cannot simply sign up again.
- A banned student who tries to rejoin is offered an **in-app appeal**. The
  teacher sees the appeal under the **same nickname the student posted with**
  plus their message (never an identity), and can **let them back in** or deny
  it.
- Approving an appeal, or the manual "Unban" action, lifts **both** blocks and
  re-admits the student immediately with a **fresh random nickname**, so their
  old identity is gone. Registration of the school email is freed up again.
- The seed script leaves one **pending ban appeal** in the Software Engineering
  community so the flow can be demoed.

### Hidden content

- A teacher can hide a post or comment. Hidden content is invisible to other
  members: the API returns `403` and the topic page redirects back to the
  community.
- The **author** of a hidden post/comment can still open it and see a banner, but
  it is read-only — no replies and no doubt marks. Teachers see everything.

### Invite codes

- Codes are 6 characters, unique, and can be rotated at any time.
- Each community has an **expiry** (24 hours / 7 days / 30 days / never) set at
  creation and changeable from Teacher controls → Settings. An expired code is
  rejected with a `410`.
- Already-joined members are unaffected by rotation or expiry.

### Rate limits

| Action                        | Limit             |
| ----------------------------- | ----------------- |
| New posts                     | 3 / hour / member |
| Comments                      | 10 / hour / member|
| Reports                       | 10 / hour / user  |
| Join attempts                 | 10 / 10 min / user|
| Ban appeals                   | 3 / hour / user   |
| School-email send (OTP)       | 3 / 10 min / user |
| School-email verify attempts  | 5 / 10 min / user |
| AI moderation                 | `AI_MODERATION_RPM` / minute (global) |

Limits are enforced with a single atomic MongoDB update, so a burst of parallel
requests cannot slip past them.

### School email

Open registration for any email, but joining an educational community requires
adding and verifying a school email from the dashboard (one account per student
email). Teachers never see member emails in the member list — only nicknames.

## Try the demo

After `npm run seed`, every demo account shares the password
`DemoPass123#` (or `SEED_DEMO_PASSWORD`).

- **Professors:** `prof_rajesh`, `prof_anita`, `prof_divya`, `prof_meera`,
  `prof_arjun`
- **Students (VIT, `@vit.edu.in`):** `stud_aarav`, `stud_isha`, `stud_rohan`, …
  (12 in total)
- **Students (other colleges):** `stud_nithin` · `@nitk.edu.in`,
  `stud_aditya` · `@iitb.ac.in`, …
- **Communities:**
  - `VITDBMS` — VIT DBMS Doubt Corner (`@vit.edu.in`, open)
  - `VITJOBS` — VIT Placements Discussion (`@vit.edu.in`, open)
  - `VITSE26` — VIT Software Engineering Q&A (`@vit.edu.in`, approval)
  - `NITKDBMS` — NITK DBMS Doubt Corner (`@nitk.edu.in`, open)
  - `IITBSE26` — IITB Software Engineering Q&A (`@iitb.ac.in`, approval)
  - `LOUNGE1` — Campus Lounge (open to every college)

Sign in as a professor to see Teacher controls, or as a student to post
anonymously. The VIT Software Engineering community also ships with a pending
join request and a pending ban appeal.

To demo the school-email gate with your own VIT address: verify
`you@vit.edu.in` from the dashboard, then join a `@vit.edu.in` community. The
`NITK` and `IITB` communities appear under Discover → **Other colleges** and will
refuse the join, showing that another institution's community is off-limits.

## Known limitations

- A classmate from the same institution can still join with a shared invite code.
  Moderation there is reactive: report → anonymous ban, plus code rotation and
  code expiry.
- A determined student with a *second* verified school email could rejoin after a
  ban; the school-email block only prevents reuse of the same address.
- Anonymity is a UI guarantee. Anyone with database access can map accounts.
- Removing identity reveal means there is no in-app escalation beyond a
  per-community ban (for example, to a dean) for serious cases.
- Free-tier Gemini prompts may be used to improve Google products; check the
  AI Studio rate limits page for current quotas.
- The `/api/verify` account-signup OTP endpoint is not rate-limited (out of
  scope for this change).

## Key API routes

| Method(s)             | Route                                                        | Purpose |
| --------------------- | ------------------------------------------------------------ | ------- |
| `POST`                | `/api/communities`                                           | Create a community |
| `GET`                 | `/api/communities`                                           | List your + discoverable communities |
| `GET`/`PATCH`         | `/api/communities/[slug]`                                    | Summary / admin settings (rotate invite, expiry, approval, AI, domains) |
| `GET`/`POST`          | `/api/communities/[slug]/topics`                             | List / create topics |
| `GET`                 | `/api/communities/[slug]/needs-review`                       | Admin review queue |
| `GET`                 | `/api/communities/[slug]/reports`                            | Admin reports list |
| `POST`                | `/api/communities/[slug]/reports/[reportId]/ban`             | Ban the reported author anonymously |
| `GET`/`POST`          | `/api/communities/[slug]/appeals`                            | List (admin) / submit a ban appeal |
| `PATCH`               | `/api/communities/[slug]/appeals/[appealId]`                 | Approve or deny an appeal |
| `GET`                 | `/api/communities/[slug]/members`                            | Admin member + ban list |
| `PATCH`               | `/api/communities/[slug]/members/[userId]`                   | Mute / remove / ban / unban |
| `POST`                | `/api/join-community`                                        | Join with an invite code |
| `GET`/`POST`          | `/api/topics/[topicId]/responses`                            | List / create comments |
| `PATCH`/`DELETE`      | `/api/topics/[topicId]`, `/api/responses/[responseId]`       | Moderator actions (`isHidden`, `isClosed`, `needsReview`) |
| `POST`                | `/api/doubts`                                                | Toggle a "same doubt" mark |
| `POST`                | `/api/reports`                                               | Report content |
| `POST`                | `/api/school-email`, `/api/school-email/verify`              | Send / verify a school email OTP |

## Scripts

| Command        | Description                                  |
| -------------- | -------------------------------------------- |
| `npm run dev`  | Start the development server                 |
| `npm run build`| Create a production build                    |
| `npm start`    | Run the production build                     |
| `npm run seed` | Seed demo accounts, communities and topics   |
| `npm run lint` | Run ESLint with autofix                      |
| `npm run format` | Format the codebase with Prettier          |

## Deploying

This app deploys to the [Vercel Platform](https://vercel.com/new). A local
Docker container is not reachable from Vercel, so production must use a hosted
database such as MongoDB Atlas. Set `MONGODB_URI` (and the email variables) in
your Vercel project's environment settings.

On first connection the app syncs the indexes it relies on in production, so no
manual migration is needed for the unique pending-report index or the
moderation-verdict TTL index.
