# AWAKENING

AWAKENING is a personal progression web app built with Next.js 16, React 19, TypeScript, Mongoose, and MongoDB Atlas.

## Local setup

1. Install Node.js 24 or newer (local persistence uses Node's built-in `node:sqlite`).
2. Run `npm install`.
3. Run `npm run dev` and open `http://localhost:3000`.

## Phase 1: Local development persistence

This current status section supersedes earlier phase notes below that describe development records as memory-only or temporary.

Current local development stores use SQLite at `.awakening-data/awakening-dev.sqlite` (ignored by Git). Set `AWAKENING_DATA_DIR` to use a different private local directory. Each existing HTTP-only development-session cookie has a separate database row namespace; the cookie remains the owner key. SQLite WAL and full synchronous writes provide atomic commits on this single machine. Revision checks reject stale concurrent writes rather than overwriting newer data. Storage errors fail the request; there is no volatile fallback.

SQLite is file storage for one local machine/process group. It is **not suitable for shared serverless deployments**, where instances have separate ephemeral filesystems. Use another explicitly designed shared storage adapter before deploying those development modules to multiple instances. `node:sqlite` remains experimental in Node 24, so pin and verify the Node runtime when using this local adapter. The SQLite file is not encrypted by this application; protect the directory with the operating system account's file permissions. No offline browser storage or offline action queue is implemented.

On first access, a live process migrates its legacy in-memory session snapshot into SQLite only when that session has no durable row. Existing durable rows are never overwritten by this migration. Memory that was already lost when an older process stopped cannot be recovered. No user action or production migration is performed.

Backup version 4 at `/diagnostics` includes supported local module, habit, command-center, campaign, draft, adaptive-state, and local progression records. Versions 1, 2, and 3 remain importable; categories absent from an older backup are left unchanged. Import validates and previews records, then atomically replaces included categories after confirmation. Authenticated quests/completions, account habits, profile attributes, account XP/progression, and client-only unfinished guitar/flute timers are excluded. Journal and finance values are plaintext in JSON exports; keep those files private.

The local persistence adapter requires Node 24+. MongoDB, Google Sign-In, and account-backed services remain deferred. This change does not make the application offline-capable or production-ready for serverless hosting.

Development sessions have no automatic expiry or delete/compact screen yet, so abandoned session rows remain in the SQLite file. Each individual store mutation and the multi-category restore are transactional; a few older API workflows still perform related side-effects as separate commits. Conversion and payment recording now commit their paired business records together. Keep a separate backup before manually moving or deleting the SQLite directory.

Phase 1 verification: `npm run lint`, `npm run typecheck`, `npm test` (57 passed, 1 MongoDB integration test skipped), and `npm run build` pass on Node 24. The SQLite runtime emits Node's experimental API warning. Browser E2E, live account services, serverless hosting, and offline behavior were not verified or enabled.

Local development does not require OAuth or MongoDB credentials. Session-scoped life modules, planning tools, diagnostics, and backup can be tried in development mode. Authenticated System Engine routes for quests, habits, player progression, and account settings remain unavailable until those server services are configured. The app does not include a demo user or fabricated account data.

If authentication and database setup is authorized later, configure OAuth and database variables in a private server environment using `.env.example` as a names-only guide. Never commit `.env.local` or paste secrets into the UI.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes for data features | MongoDB Atlas connection URI. Keep it server-side and out of source control. |
| `MONGODB_DB` | Recommended | Database name to use with the URI. |
| `GOOGLE_CLIENT_ID` | Yes for sign-in | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Yes for sign-in | Google OAuth client secret. |
| `NEXTAUTH_SECRET` | Yes for sign-in | Long random secret used to sign session tokens. |
| `ALLOWED_GOOGLE_EMAIL` | Yes for sign-in | The one Google account allowed to use this private instance. |
| `NEXTAUTH_URL` | Production | Canonical deployment URL for NextAuth. |
| `XP_PER_LEVEL` | Optional | XP required per level; defaults to 1000. |

MongoDB Atlas must allow network access from the deployment environment. The app does not claim a connection until a request successfully connects. Quest awards use unique completion and ledger constraints and derive totals from the ledger.

Levels advance by `XP_PER_LEVEL` (default 1000 XP). Ranks are E below level 10, D at 10, C at 20, B at 30, A at 40, and S at 50. The ledger is authoritative; profile totals are synchronized from it on dashboard and profile reads. A new XP ledger entry and profile progression update use a MongoDB transaction on replica sets, with an idempotent unique-index fallback for standalone deployments.

## Current functional areas

- Google OAuth sign-in when configured.
- User-scoped quest creation, editing, archive, date filtering, recurring schedules, completion, rescheduling, and completion history.
- Server-calculated quest XP, persisted total XP, levels, and E-to-S rank. Each occurrence and XP source has a unique database constraint so completion retries cannot add duplicate awards; profile progression snapshots are advanced only when a new ledger record is inserted.
- User-scoped habit schedules, daily done/rest logs, correction of a day, weekly completion summary, streak, and monthly history.
- Editable profile attributes, campaign date, and timezone.
- Dashboard summaries and recent recorded quest activity.

## Phase 4: Unified Life Operating System

The home page includes a daily command center with today's scheduled entries, recorded completion counts, a seven-day agenda, high-priority and overdue items, and a weekly review. Player progression and XP still come from the existing authenticated dashboard and XP ledger. The global Quick Add menu links to task, quest, event, focus, habit, and daily-planning workflows.

The Schedule page provides month, week, day, and agenda views; personal events can be created, edited, rescheduled, and cancelled. Calendar quest entries come from the authenticated API when account services are configured. Habits use the authenticated API in account mode, or the session-scoped development adapter when authentication is not configured. Dated records from fitness, nutrition, reflections, academics, career, guitar, flute, content, Bloom & Blend, and Zyrenox appear as read-only source links. The calendar shows generic titles for nutrition and reflection reminders; it does not return journal text, finance transactions, or business payment amounts. Finance recurring reminders and campaign milestones are not integrated.

The Task Board provides Today, Upcoming, Overdue, Completed, and All views, with search and priority, status, category, source, and date filtering. Generic personal tasks can be edited, completed, rescheduled, or cancelled and never award XP. System Engine quests remain linked to the existing quest API and retain its server-side XP and idempotency rules. Linked module records are not copied into task records. The authenticated quest and habit integrations in the board use a rolling 30-day horizon; older records remain available in their source workspaces.

Daily Planning stores up to three priorities, available focus minutes, an intention, and notes. Evening reviews use actual completion records and keep unfinished items open. Focus blocks support scheduling, linking, start, pause, resume, finish, and cancel; timer state is stored in the local session SQLite namespace. Finishing is idempotent and awards no XP. Timer updates use timestamps; there are no background alarms or notifications. Existing habit schedules and date logs appear in planning and the calendar. The habit API prevents duplicate date logs and applies schedule rules; it does not currently support deleting an existing done log from the planning screen.

Command-center records use a separate development-only SQLite namespace keyed by the existing browser-session cookie. They survive local server restarts and are not available outside `NODE_ENV=development`. Quests and player data continue to use the existing authenticated system when configured. Habits use their authenticated backend in account mode and the session-scoped SQLite adapter when auth is intentionally absent in development. MongoDB Atlas and Google OAuth remain deferred. No generic task, event, plan, or focus action awards XP.

Habits, Fitness & Martial Arts, Nutrition & Recovery, Mind & Journal, Academics & Exams, Placements & Career, Guitar, Flute, Content Creation, Bloom & Blend, Zyrenox, and Personal Finance have local-development workflows. Supported records use session-scoped SQLite storage, but remain development-only until production API routes and a suitable shared backend exist. Local XP is awarded only for newly completed scheduled habit occurrences (5 XP), workout sessions (20 XP), martial arts technique sessions (20 XP), and explicitly completed guitar/flute practice sessions (10 XP). Retries use stable source IDs and cannot award twice. Journal, meals, hydration, finance, record creation/editing, focus blocks, and generic tasks do not award XP. There is no local quest completion workflow or explicit study-session record, so those are not currently reward eligible. Achievements unlock from actual local event counts: first eligible activity, seven completed habit occurrences, five training sessions, and ten music sessions. Local XP history and achievements are included in backup v4; authenticated account progression remains separate.

## Phase 5: Adaptive Progression (development slice)

Player Stats now displays account progression derived from the XP ledger, a progress bar based on the same ledger total, lifetime quest completions and habit logs, weekly XP, editable user-set attributes, and the latest 20 XP ledger events. Focus and practice totals are explicitly marked as current development-session data; those metrics are unavailable outside local development. Empty XP history and activity are shown without invented defaults.

Achievements & Insights evaluates stable, reward-free definitions from actual session records for training, music practice, published content, completed workshops, delivered Zyrenox projects, focus blocks, and daily plans. Quest and habit achievement definitions remain visibly unavailable until canonical authenticated System Engine data can be connected. Achievement timestamps come from qualifying records, and repeated evaluations do not create reward events. No achievement currently awards XP.

The dashboard shows up to five deterministic recommendations from open tasks and dated, incomplete module records. Each explains its source, links to the source, and can be dismissed for the current day. The in-app notification center surfaces current personal task, event, module deadlines, and a missing daily plan; read and dismissal state is deduplicated by stable event ID in the development session. Notifications are computed when opened; push, email, SMS, and background scheduling are not implemented.

Weekly review supports selecting Monday-based weeks and reports recorded personal-task completions, completed focus time, plans, reviews, and fitness/music/content records when that module has data coverage. XP, quest, and habit totals are clearly identified as unavailable in this session-only review; ledger-backed XP remains visible in Player Stats. There is no external AI service.

Custom measurable campaigns, campaign progress history, achievement XP rewards, authenticated quest/habit insight aggregation, and production persistence for adaptive state remain unimplemented. Adaptive achievement definitions and calculations use actual session records; recommendation dismissals and notification state are stored in the SQLite command-center namespace, survive local restarts, and remain inaccessible outside `NODE_ENV=development`. Existing authenticated quest, habit, profile, and ledger routes retain their ownership checks. MongoDB Atlas and Google OAuth were not configured.

## Phase 6 audit checklist

- **Implemented:** authenticated quest and habit routes, ledger-based XP and level reconciliation, owned player profile, level/rank calculations, module workspaces, schedule/tasks/focus/planning, session-scoped adaptive insights, and in-app reminders. XP is now calculated server-side from quest difficulty and duration (difficulty bases: easy 10, normal 20, hard 35, elite 50; multiply by 30-minute duration bands, capped at four bands). The client cannot set or edit the reward directly.
- **Partially implemented:** most life-module records support create, edit, complete, and archive; permanent delete, pagination, and durable data are not available. The calendar and task board have bounded query horizons. Development record dates use the browser/session conventions and the default Asia/Kolkata development date; production System Engine dates use each account's configured IANA timezone.
- **Not implemented:** custom measurable campaign challenges and campaign history, achievement XP rewards, production persistence for life modules/adaptive state, production rate limiting, and automated browser end-to-end tests. Quest and habit integrity integration tests require a disposable configured MongoDB URI.
- **Security follow-up:** the prior `.env.example` contained a credential-like Atlas URI. It has been replaced by a non-secret placeholder. If that value was a real Atlas credential, rotate its password in Atlas before configuring the application. No Atlas or Google OAuth configuration was performed as part of this audit.
- **HTTP smoke checks:** local production-mode requests to `/api/adaptive`, `/api/life-system`, and `/api/life-modules/finance` returned 404. Development-mode requests exercised home navigation, browser-session isolation, workout create, task complete, event create, focus start/finish, content create, workshop create, finance transaction create, and adaptive insight loading. Authentication-backed quest XP and habit journeys were not run because OAuth and MongoDB credentials are absent.
- **Visual verification:** responsive CSS and accessible controls were reviewed in source, but the available Windows browser-control runtime did not start, and no Playwright/Cypress project is installed. Mobile/tablet/desktop layouts therefore have not been visually verified in a live browser.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Phase 6 verification at that stage: `npm run lint`, `npm run typecheck`, `npm test` (41 passed, 1 MongoDB integration test skipped), and `npm run build` passed. The integration test uses a separate disposable database via `MONGODB_TEST_URI`; without it, MongoDB integration tests are skipped. Never point that variable at production data.

Latest Phase 8 verification: `npm run lint`, `npm run typecheck`, `npm test` (43 passed, 1 MongoDB integration test skipped), and `npm run build` passed. Development HTTP smoke verified diagnostics, manifest/icon delivery, backup export, preview, and confirmed restore. Production-mode checks confirmed `/api/diagnostics` and `/api/backup` return 404 while the manifest and PNG icon remain available.

## Phase 8: Install, diagnostics, and development backups

- The web manifest is served at `/manifest.webmanifest`; it uses standalone display and AWAKENING's original raster icons at 192px and 512px. The 180px Apple touch icon is configured separately. The app can be installed from the browser menu on localhost or an HTTPS origin when the browser supports manifest-based installation. On iOS/iPadOS, use Safari Share Ã¢â€ â€™ Add to Home Screen.
- There is intentionally no service worker and no offline data cache. When the browser reports offline, AWAKENING says server-backed actions cannot be saved. The app is not an offline-first client.
- `/diagnostics` shows local configuration readiness without returning secret values or private record content. `/api/diagnostics` and the backup API return 404 outside `NODE_ENV=development`. Test/build results are not presented as runtime status; run the commands below in a terminal.
- Development backup is available at `/diagnostics`. Export produces `awakening-development-backup` version 4 JSON for life-module entries (including journal and finance), local habit schedules/logs, command-center records, campaign state, quest drafts, adaptive state, and the local XP ledger/achievements. Import validates categories and limits, previews counts, then requires explicit confirmation before atomic replacement. Versions 1 through 3 remain importable, with categories absent from older formats preserved. Journal and finance values are readable in the JSON file. Account-authenticated records and unfinished client-only practice timers are excluded.
- Backup excludes authenticated quests and completions, canonical account habits, profile, XP ledger, account progression, and client-only unfinished guitar/flute timers. JSON backup files contain readable journal and finance data. No cloud or browser localStorage persistence was added.
- Browser installation controls and responsive layouts still need visual verification on real desktop/mobile browsers. The current environment has no working browser automation runtime.

### Phase 8 release checklist

- [x] Manifest, original icons, install metadata, diagnostics, explicit offline notice, and development-only data backup/restore implemented.
- [x] Restore validation and browser-session isolation unit-tested; dev-mode HTTP smoke exercised export, preview, confirmed restore, diagnostics, manifest, and icon delivery.
- [ ] Verify browser installation prompts and layouts on current Chrome/Edge, Android Chrome, and iOS Safari.
- [ ] Configure and verify OAuth, MongoDB, durable backup/restore, account ownership, and authenticated quest/habit integration before any production release. Phase 8 did not implement these systems.

## Phase 9 implementation inventory

| Area | Status | Evidence / limits |
| --- | --- | --- |
| Dashboard | Partial; account-backed values require auth/database | Shows real System Engine values when available and session-scoped command-center values; unavailable domains are labeled. No seeded XP or activity. |
| Quests, XP ledger, levels, ranks | Implemented in authenticated API/model code; live persistence blocked | Server-calculated rewards and unique completion/ledger constraints. Unit tests cover formulas; Mongo concurrency/ownership test is skipped without a disposable test URI. |
| Habits and player attributes | Local habit workflows implemented; account progression remains auth/database-dependent | Local sessions support schedules, rest days, daily logs/history and backup/restore; account habit XP and progression remain unverified without the deferred services. |
| Campaign date and milestones | Implemented in authenticated routes and session-scoped SQLite development storage | Date selection, milestone add/edit/complete/delete, validation, and session isolation. Account persistence still requires the existing authentication and database services. |
| Daily plans, reviews, focus, tasks, calendar | Implemented in session-scoped SQLite storage; tested | Validated task transitions, focus operations, dates, filtering, privacy redaction, and backup/restore coverage. System Engine quest/habit linkage requires configured services. |
| Fitness, nutrition, journal, academics, career, guitar, flute, content, Bloom & Blend, Zyrenox, finance | Implemented in SQLite-backed development workspaces; verified by store/domain tests | CRUD, archive, validation, calculations, session separation, timers, stages, and business/finance logic have tests. Client-only unfinished guitar/flute timers are not durable or backed up. Journal and finance backup data is plaintext and sensitive. |
| Achievements, recommendations, notifications, weekly review | Partially implemented; local state is SQLite-backed | Achievement definitions derive from selected records. Account quest/habit achievement sources are unavailable. Local reward-free achievements derive from XP events, notifications are in-app only, and no external AI/push service exists. |
| Diagnostics, backup, PWA | Implemented for local development; covered by tests and HTTP smoke checks | Backup v4 covers supported local session data and local progression; account quests/habits, profile, and account XP/progression are excluded. PWA has manifest/icons but no service worker/offline cache. |
| Authentication, MongoDB persistence, cross-device sync, production limits | Deferred by project decision | Do not present the current development adapters as production storage or configure these services as part of this phase. |

### Phase 9 fixes

- Removed the hard-coded personal campaign date and automatic Ã¢â‚¬Å“Birthday CampaignÃ¢â‚¬Â record. The user now chooses an optional campaign date, and campaign records are created only after setting a date or adding a milestone.
- Fixed async form submission handlers that accessed React `event.currentTarget` after awaiting the network; they now retain the form element before starting the request.
- Added caught error/success handling to recommendation dismissal and an honest empty state for milestones.
- Removed the Settings link to `/README.md`, which was not a served application route.
- Removed decorative weekly bars that implied per-day XP values the dashboard did not calculate.
- Remaining known limits: no durable development data, no authenticated quest/habit verification without services, no automated browser E2E suite, and no live install/mobile visual checks.
- Latest Phase 9 verification: lint and typecheck passed; tests passed 44 with 0 failures and 1 MongoDB integration test skipped; production build passed. Development HTTP smoke returned 200 for all 22 navigation pages, created a session-owned practice record, read the life-system API, confirmed diagnostics did not expose secret names/values, and observed the expected 503 from the auth-backed dashboard without credentials. `/README.md` returned 404 after removing the dead Settings link.

## Deployment notes

- Configure all OAuth and MongoDB variables in the hosting provider's server environment.
- Add the deployed `/api/auth/callback/google` URL to Google OAuth authorized redirect URIs.
- Restrict Atlas network access to the hosting provider where possible.
- Use HTTPS and set `NEXTAUTH_URL` to the public origin.
- Provide a MongoDB replica set if future changes need transactions.
- Configure automated database backups and review Atlas index creation before production use.




## Phase 11: Workflow consistency and local validation

- Dashboard plan summaries now show the selected priority records from the saved daily plan. A priority whose source was removed is shown as unavailable and links back to planning.
- Cancelled and archived records are omitted from scheduled/open dashboard summaries. Completed and planned-rest items remain visible where they are meaningful.
- The weekly dashboard practice total includes Fitness `Workout session` records as well as training, martial arts technique, guitar, and flute sessions.
- Calendar month cells use the same source, status, priority, and category filters as the selected agenda.
- Personal task and event records can be permanently deleted after an explicit browser confirmation. Focus history is not eligible for this delete action. Source-module records continue to use their existing archive workflow.
- These features use the development-only SQLite stores and browser-session cookie. Supported records survive local server restarts. No MongoDB, OAuth, or cloud persistence was configured.
- Automated coverage includes status filtering, task date edits, priority resolution, source-record archive behavior, practice categorization, focus summary exclusions, and session-scoped task/event deletion. Browser-based visual or end-to-end validation was unavailable in the current environment.

- Local campaign dates and milestones share the session-scoped SQLite store and survive local server restarts.

- When account services are not configured in development, habit schedules/logs and local progression use browser-session SQLite and survive server restarts. Eligible habit occurrences earn local XP. Account profile attributes and authenticated quest completion remain unavailable.

## Current continuation audit

- The task board now excludes cancelled, archived, completed, and planned-rest source records from its overdue view. Same-day System Engine quests continue to appear only in the dedicated quest section.
- Daily Planning's habit panel now points to the local Habits workspace and no longer claims that all habit data requires account authentication.
- Development backup version 4 includes supported local session records and local XP history/achievements. Versions 1 through 3 remain importable; categories they do not contain are preserved. Authenticated quests, account habits, profile, and account XP/progression remain excluded.
- Current continuation verification: `npm run lint`, `npm run typecheck`, `npm test` (62 passed, 0 failed, 1 MongoDB integration test skipped; 63 total), and `npm run build` pass. Build generated 31 app routes. Node emits the expected experimental `node:sqlite` warning. Browser visual/E2E, keyboard/mobile layout, authenticated services, serverless deployment, and offline behavior were not verified.
- No Git metadata is present in this workspace, so a Git diff could not be reviewed. Browser-control tooling returned no available browser or app; live visual checks at desktop/tablet/mobile sizes and browser-interaction E2E were not performed. HTTP 200 checks confirm route responses only.

## Local development progression

Local progression is separate from the MongoDB-backed account XP ledger and is available only when account services are not configured in `NODE_ENV=development`. XP is derived from a persistent, session-scoped SQLite event ledger using the existing 1,000 XP level threshold and E-to-S rank rules. Eligible rewards are fixed: scheduled habit completion 5 XP; completed workout or martial arts technique 20 XP; completed guitar/flute practice session 10 XP. Stable source record IDs prevent duplicate rewards. Achievements are reward-free and derived from the actual event history. Local quest completion and explicit study sessions are not currently implemented, so they do not earn XP. Local progression is included in backup v4; it does not synchronize across devices or in production.
## Current local workflow status

In unauthenticated development, `/player-stats` reads the same session-scoped SQLite XP ledger shown on the dashboard. `/quests` explains that account quests are deferred and links to local task and eligible activity workspaces; tasks themselves do not award XP. Academics includes an explicit `Study session` record with date, study minutes, and the existing planned/completed lifecycle. Study records do not award XP because no study reward rule is defined. The fixed local XP reward table remains unchanged.

The in-app browser and browser automation were unavailable during this pass. HTTP smoke checks returned 200 for the dashboard and all 21 named navigation routes plus `/diagnostics`; this confirms route responses only, not client-side interactions or visual layout.

### Manual browser verification

1. Open `/player-stats` and confirm rank, level, XP history, and achievements match the dashboard.
2. Open `/quests` and confirm the deferred-service explanation and local links appear instead of a nonworking quest form.
3. Create an Academics `Study session`, enter its date and minutes, save it, mark it complete, refresh, and confirm it remains recorded without XP changing.
4. At desktop and narrow mobile widths, check navigation, expandable edit forms, and long module forms; use Tab, Shift+Tab, Enter, and Escape to verify keyboard operation.
5. In Diagnostics, export a backup and verify the preview before restoring only in a disposable session.

Latest verification: lint, typecheck, and production build passed; 62 tests passed, 0 failed, and 1 MongoDB integration test was skipped (63 total). Node emits its expected experimental `node:sqlite` warning. No browser visual, keyboard, mobile, authenticated-service, serverless, or offline verification was performed.