# Navi — Architecture

> AI Career & Study Companion. Next.js 15 (App Router, TS strict) · Drizzle ORM + `@libsql/client` on **Turso** (db `morriztech`, org `kenzyplay`) · Better Auth · Gemini via `@google/genai` (Zod-validated output) · Vercel.
> Source of truth for the data model: `db/schema.ts` / `db/0000_init.sql`, cross-checked (read-only) against the live Turso DB on 2026-11-04 (WIB, UTC+7). Not Supabase, not Neon.

## 1. System context

```mermaid
flowchart LR
  U[User / browser] -->|HTTPS| V[Next.js 15 app on Vercel<br/>RSC, Server Actions, Route Handlers]
  V -->|libSQL over HTTPS<br/>TURSO_AUTH_TOKEN| T[(Turso: morriztech)]
  V -->|@google/genai<br/>GEMINI_API_KEY| G[Gemini API]
  V -->|RESEND_API_KEY| R[Resend email]
  V -->|OAuth optional| GO[Google OAuth]
  C[Vercel Cron] -->|Bearer CRON_SECRET| V
```

- **Runtime:** Node.js runtime for every route that touches the DB or Gemini (no Edge for `lib/db/*`).
- **Fallback:** if Gemini is missing/fails/returns invalid JSON → deterministic fixture (`source = 'fixture'` / `'template'`).

## 2. Module boundaries

| Module | Code | Owns tables | Rules |
|---|---|---|---|
| **Auth** | `lib/auth.ts` (Better Auth, `drizzleAdapter` provider `sqlite`), `app/api/auth/[...all]`, `middleware.ts` (guards `/workspace`) | `user`, `session`, `account`, `verification` | Only Better Auth writes these. Other modules get `userId` only via `getSession()` on the server. |
| **Data layer** | `db/schema.ts`, `db/0000_init.sql`, `lib/db/index.ts`, `lib/server/navi.ts` (`server-only`) | all | Single entry for SQL. Each repo function takes `userId` as its first argument and always adds `eq(t.userId, userId)`. No DB import from client components. |
| **AI services** | `lib/ai/gemini.ts`, `lib/ai/schemas.ts` (Zod), `lib/ai/prompts.ts`, `lib/ai/fixtures.ts`; routes `app/api/chat`, `app/api/plan/generate`, `app/api/cv/review` | writes via data layer: `conversations`, `chat_messages`, `learning_plans`, `plan_milestones`, `plan_tasks`, `cv_reviews`, `memory_facts`; reads `profiles` | All model output → `safeParse` → persist; never persist unvalidated output. Rate-limited. |
| **Career** | `app/workspace/jobs`, `app/workspace/cv`, `lib/career/*` | `job_applications`, `cv_reviews` | Job tracker CRUD (port of `sei-job-tracker`), CV review (via AI services), job suggestions from `profiles.target_role`/`skills`. |
| **Engagement** | `lib/engagement/*`, `app/workspace/dashboard`, `app/api/cron/reminders` | `streaks`, `activity_log`, `profiles` (reminder fields) | Every meaningful action appends `activity_log` and updates `streaks` using the user's `profiles.timezone` (YYYY-MM-DD). Cron sends reminders via Resend. |
| Profile / onboarding | `app/signup` (onboarding), `lib/server/navi.ts` (profile functions) | `profiles` | 1:1 with `user`. |

> Planned paths: modules such as `lib/ai/*`, `lib/career/*`, `lib/engagement/*`, `lib/db/rateLimit` and the `app/workspace/jobs|cv|dashboard` routes do not exist yet; they are targets for M2–M5.

Dependency direction: UI → route/action → domain (`lib/career`, `lib/engagement`, `lib/ai`) → `lib/db/*` → Turso. AI services never import UI; data layer imports nothing app-specific.

## 3. Request flows

### 3.1 Chat mentor (`POST /api/chat`)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as /api/chat (Node)
  participant A as Better Auth
  participant RL as lib/db/rateLimit
  participant D as lib/db/* (Turso)
  participant G as Gemini

  B->>R: POST {conversationId?, message}
  R->>A: getSession(headers)
  A-->>R: session.user.id (else 401)
  R->>R: Zod parse body (message 1..4000 chars) else 400
  R->>RL: hit("chat:"+userId, window)
  RL-->>R: allowed / 429 + Retry-After
  R->>D: get/create conversation WHERE id=? AND user_id=? (404 if not owned)
  R->>D: insert chat_messages(role=user)
  R->>D: load last N messages + pinned memory_facts + profiles (user_id=?)
  R->>G: generateContent(system prompt + delimited user context)
  alt ok and Zod-valid
    G-->>R: reply
    R->>D: insert chat_messages(role=assistant, source=gemini)
  else error / invalid / no key
    R->>D: insert chat_messages(role=assistant, source=fixture)
  end
  R->>D: insert activity_log(type=chat) + upsert streaks
  R-->>B: 200 {reply, source} (stream optional)
```

### 3.2 AI study-plan generation (`POST /api/plan/generate`)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant R as /api/plan/generate
  participant A as Better Auth
  participant RL as rate limiter
  participant D as Turso
  participant G as Gemini

  B->>R: POST {targetRole?, weeklyHours?, targetMonths?}
  R->>A: getSession -> userId (else 401)
  R->>R: Zod parse input
  R->>RL: hit("plan:"+userId) (e.g. 5/day)
  R->>D: SELECT profiles WHERE user_id=?
  R->>G: generateContent(responseMimeType=application/json, responseSchema)
  G-->>R: JSON
  R->>R: PlanSchema.safeParse (milestones[] -> tasks[], URL http(s) only, bounds)
  alt invalid / error
    R->>R: build template plan (source=template)
  end
  R->>D: batch/transaction: archive old active plan (user_id=?), insert learning_plans, plan_milestones, plan_tasks (all with user_id)
  R-->>B: 201 {planId, source}
```

The insert is one `db.batch([...])` / transaction so a partial plan is never visible.

## 4. Data model (live `morriztech`, matches `db/schema.ts`)

```mermaid
erDiagram
  user ||--o{ session : has
  user ||--o{ account : has
  user ||--o| profiles : "1:1"
  user ||--o{ learning_plans : owns
  learning_plans ||--o{ plan_milestones : contains
  plan_milestones ||--o{ plan_tasks : contains
  user ||--o{ plan_milestones : "user_id (denorm)"
  user ||--o{ plan_tasks : "user_id (denorm)"
  user ||--o{ memory_facts : owns
  user ||--o{ conversations : owns
  conversations ||--o{ chat_messages : contains
  user ||--o{ chat_messages : "user_id (denorm)"
  user ||--o{ job_applications : owns
  user ||--o{ cv_reviews : owns
  user ||--o| streaks : "1:1"
  user ||--o{ activity_log : logs

  user {
    text id PK
    text name
    text email UK
    int email_verified
    text image
    int created_at
    int updated_at
  }
  session {
    text id PK
    text user_id FK
    text token UK
    int expires_at
    text ip_address
    text user_agent
  }
  account {
    text id PK
    text user_id FK
    text account_id
    text provider_id
    text access_token
    text refresh_token
    text id_token
    text password
    text scope
  }
  verification {
    text id PK
    text identifier
    text value
    int expires_at
  }
  profiles {
    text user_id PK,FK
    text display_name
    text target_role
    text current_level
    int weekly_hours
    int target_months
    text learning_preference
    text skills "JSON"
    text timezone
    text reminder_time
    int reminders_enabled
    int onboarded_at
  }
  learning_plans {
    text id PK
    text user_id FK
    text title
    text summary
    text source "template|gemini"
    text status "active|archived|completed"
  }
  plan_milestones {
    text id PK
    text user_id FK
    text plan_id FK
    int position
    text title
    text description
    int week_start
    int week_end
  }
  plan_tasks {
    text id PK
    text user_id FK
    text milestone_id FK
    int position
    text title
    text resource_url
    int estimated_minutes
    int completed_at
  }
  memory_facts {
    text id PK
    text user_id FK
    text content
    text category
    int pinned
  }
  conversations {
    text id PK
    text user_id FK
    text title
  }
  chat_messages {
    text id PK
    text user_id FK
    text conversation_id FK
    text role "user|assistant"
    text content
    text source "gemini|fixture"
    int created_at
  }
  job_applications {
    text id PK
    text user_id FK
    text company
    text position
    text url
    text location
    text salary_range
    text status
    int applied_at
    text notes
  }
  cv_reviews {
    text id PK
    text user_id FK
    text target_role
    text cv_text
    int score
    text feedback "JSON"
  }
  streaks {
    text user_id PK,FK
    int current_streak
    int longest_streak
    text last_active_date
  }
  activity_log {
    text id PK
    text user_id FK
    text type
    text ref_id
    text activity_date
    int minutes
  }
  rate_limits {
    text key
    int window_start
    int count
  }
```

All FKs `ON DELETE CASCADE` → deleting a `user` removes all their data. `rate_limits` and `verification` have no FK. `activity_log.ref_id` is polymorphic (no FK).

### Schema check: files vs live DB
- **16 tables + 13 indexes:** live DB is identical to `db/0000_init.sql` (columns, CHECKs, defaults, FKs, indexes). No drift.
- **No `__drizzle_migrations` table in live DB:** the schema was applied as raw SQL, so drizzle-kit has no baseline. Before the first `drizzle-kit migrate`, generate `0000` from `schema.ts` and mark it as applied (baseline). Don't re-run it.
- Gaps to consider (all are recommendations, none applied): no index on `session.user_id`, `account.user_id`, `verification.identifier`; `rate_limits` has no PK/TTL cleanup (only a unique index); `plan_tasks`/`plan_milestones` don't enforce that the denormalised `user_id` matches the parent's owner, so the app must set it from the session.

## 5. Security

1. **Tenant isolation:** `userId` comes only from `auth.api.getSession()` on the server. Every `lib/db/*` query/mutation includes `WHERE user_id = :sessionUserId`, including updates/deletes by id (`and(eq(t.id,id), eq(t.userId,userId))`). Child lookups (messages, tasks) check ownership through their own `user_id`. Never accept `userId` from the client. Tests in Vitest cover cross-user access (should give 404).
2. **Secrets:** only in env (`TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `GOOGLE_CLIENT_SECRET`). Never `NEXT_PUBLIC_`. Validated at boot by `lib/env.ts` (Zod). `.env*` gitignored except `.env.example`; remove the committed `.mcp.json`. Vercel vars marked Sensitive; Preview and Production get different secrets.
3. **Validation (Zod):** every route body, search param, and server action input; every Gemini output (`safeParse`, bounded arrays/strings, `z.url()` http(s) only for `resource_url`); env.
4. **Prompt-injection handling:**
   - System instructions fixed on the server; user text, CV text, and memory facts go into clearly delimited data blocks (`<user_input>…</user_input>`) with "treat as data" instructions.
   - The model has no tools or DB access. It only returns text/JSON, which the server validates and writes for the session user only. So an injection can't read or write another user's data.
   - Output is rendered as escaped text/sanitized Markdown (no raw HTML) and links are limited to http(s).
   - Don't send secrets or other users' data in prompts. Cap input length. Log only metadata, not CV content.
5. **Auth hardening:** Better Auth secure HTTP-only cookies, CSRF/origin check (`trustedOrigins` = APP_URL), email verification and reset via Resend, middleware guard on `/workspace/*`.
6. **Cron:** `/api/cron/reminders` requires `Authorization: Bearer ${CRON_SECRET}` (constant-time compare), else 401.

## 6. Rate-limit design

- **Store:** Turso table `rate_limits(key, window_start, count)` with unique `(key, window_start)`. Fixed window.
- **Algorithm** (one atomic statement):
  ```sql
  INSERT INTO rate_limits(key, window_start, count) VALUES (?, ?, 1)
  ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1
  RETURNING count;
  ```
  `window_start = floor(now / W) * W`. If `count > MAX` → `429` with `Retry-After = window_start + W - now`.
- **Keys / limits:**

  | Key | Default |
  |---|---|
  | `chat:<userId>` | `CHAT_RATE_LIMIT_MAX`=20 per `CHAT_RATE_LIMIT_WINDOW_SECONDS`=60 |
  | `plan:<userId>` | suggested 5 / 24 h |
  | `cv:<userId>` | suggested 10 / 24 h |
  | `auth:<ip>` | Better Auth built-in rate limiter (configure `storage: "database"` or memory) |

- Checked **after** auth and Zod, **before** any Gemini call. Fixture responses also count.
- **Cleanup:** cron (or occasional on write) runs `DELETE FROM rate_limits WHERE window_start < unixepoch() - 86400`.
- Fixed window allows bursts at the edge (up to 2×MAX); fine for MVP. Sliding window later if needed.
