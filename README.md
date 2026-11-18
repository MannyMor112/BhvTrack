# Pattern — Personal Behavioral Improvement Tracker

A local-first, mobile-first web app for turning self-observation into measurable behavior change. It is built like a lightweight issue tracker rather than a journal. You name a behavior, form a hypothesis, try an if–then plan (an implementation intention), log events in ABC form (Antecedent → Behavior → Consequence), and see whether your response is changing.

- **No account, no backend, no analytics.** All data lives in the browser's IndexedDB.
- **Offline-capable PWA** (standalone build).
- **Exports:** PDF, Markdown, clipboard, native share sheet, plus full JSON backup and restore.

> Not a medical device. The app calculates counts from what you log. It does not diagnose, score, or interpret.

## Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Dexie 4 (IndexedDB) · jsPDF (with an embedded DejaVu Sans subset, so Hebrew and other non-Latin text renders in PDFs) · Vitest + fake-indexeddb.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (persistence, statistics, export)
npm run typecheck
```

## Builds

| Command | Output | Use |
| --- | --- | --- |
| `npm run build` | `dist/` | Normal PWA build with manifest and service worker. Deploy this. |
| `npm run build:single` | `dist-single/index.html` | One self-contained HTML file (no service worker). Used for embedding or hosting as a single page. |
| `npm run preview` | — | Serves `dist/` locally to test the PWA. |

### Deployment

**GitHub Pages (set up already):** `.github/workflows/deploy.yml` tests, builds and publishes `dist/` on every push to `main`. In the repo, set **Settings → Pages → Source** to **GitHub Actions**. The app is then served at `https://<user>.github.io/<repo>/`. Open that address on your phone and use **Add to Home Screen** (iPhone, Safari) or **Install app** (Android, Chrome).

**Any other static host:**

`dist/` is static. Host it on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, or nginx). Requirements:

- Serve over **HTTPS**, or the service worker and install prompt won't work.
- The build uses relative paths (`base: './'`), so subfolder hosting works.
- When you ship a release, bump `VERSION` in `public/sw.js` so clients drop the old cache. User data is in IndexedDB and is not affected.

Each origin, meaning each domain, has its own separate database. Moving the app to a new domain starts empty, so use **Data & privacy → Download backup** first, then restore it on the new domain.

## Project layout

```
src/
  types.ts            Domain types and labels
  db/db.ts            Dexie schema + versioned migrations
  db/repo.ts          CRUD, intervention history, backup/restore (all take an optional db for tests)
  lib/validate.ts     Normalizers: every read and import passes through these, so corrupted rows never crash the UI
  lib/stats.ts        Outcome statistics, windows, recurrence counts
  lib/report.ts       Export model (blocks) → Markdown
  lib/pdf.ts          Blocks → PDF (jsPDF, RTL-aware)
  lib/platform.ts     Download / clipboard / share / storage helpers with graceful fallbacks
  lib/demo.ts         Sample data
  state.tsx           Live data context (dexie-react-hooks), navigation, toasts, confirm dialogs, theme
  components/         UI primitives, charts, event list
  pages/              Dashboard, Behaviors, IssueDetail, LogEvent, WeeklyReview, Export, DataPage
tests/                Vitest suites
public/               manifest, icon, service worker
```

## Data model and migrations

Stores (Dexie, schema version 2):

| Store | Key | Indexes | Notes |
| --- | --- | --- | --- |
| `issues` | `id` | status, priority, archived, updatedAt | `interventions[]` holds the full history. The active plan is the one without `endedAt`. |
| `events` | `id` | issueId, interventionId, occurredAt | `interventionId` is the plan that was active at `occurredAt`. It is recomputed when plans are replaced or backdated. |
| `reviews` | `id` | `&weekStart` (unique) | One review per week. A week starts Monday 00:00 local time. |

Migrations live in `src/db/db.ts`. **Never edit an existing `version()` block. Add a new one.** v1 → v2 converts the old single `intervention` string into the `interventions[]` history (covered by a test). Bump `SCHEMA_VERSION` in `lib/validate.ts` with every schema change, so backups from newer versions are rejected cleanly.

## How the numbers work

- **Success rate** = successful ÷ (successful + unsuccessful).
- **Partial successes** are shown separately and are never counted as successes.
- **Not applicable** (the plan couldn't reasonably have been used) and **Not assessed** events are excluded from the denominator.
- **No percentage is shown below 5 evaluated opportunities.** You see "3 of 4 successful — too few to calculate a rate" instead. Rates from 5–9 evaluations are labeled "small sample."
- Every rate in the UI and in exports shows its denominator.
- "Recurring" items in the weekly review and exports are plain frequency counts of emotions and words that appear in several situation descriptions. No interpretation is generated.

## Privacy

- No network requests at runtime. There are no external fonts, CDNs, or telemetry.
- Personal data never appears in the URL. The hash holds only page names such as `#export`, never IDs or content.
- Exports leave out raw event details and personal reflections by default. You see a full preview before anything is exported.
- Deleting all data requires typing `DELETE`. Deleting a behavior keeps its events and unlinks them.
- Browsers can clear IndexedDB (clearing site data, private mode, storage pressure). The app offers to request persistent storage and makes backups easy.

## Tests

`npm test` runs:

- **persistence**: create and reopen, intervention history, event attribution, safe delete, backup round-trip, rejection of invalid files, skipping corrupted rows, v1→v2 migration
- **stats**: denominators, partial handling, small-sample rules, time windows, recurrence counting, stale detection
- **export**: counts and labels in Markdown, private fields excluded by default, valid PDF output including Hebrew text

## Known limitations

- Data is per browser and per device. There is no sync, by design.
- When the app runs inside a sandboxed frame (for example as a hosted single page), the service worker, the native share sheet and plain downloads may be blocked. The app then falls back to the host's download prompt or to copying to the clipboard.
