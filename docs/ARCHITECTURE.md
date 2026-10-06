# Architecture

## Overview

```
Chrome side panel (React)  <-->  Express API  <-->  Postgres
        |    ^                        |
        |    | messages                | Fuse.js in-memory index (sponsors)
        v    |                         | static JSON (SOC / ISL / salary rules)
  background service worker
        |
        v
  content script (injected on demand)
        |
        v
  the active tab (any website)
```

- **Extension**: Manifest V3, TypeScript, React. Side panel is the *only* UI — no popup (a popup auto-closes the instant the user clicks the host page, which would break "Select from Page"; a docked side panel stays open alongside whatever tab is active).
- **Backend**: Node/TypeScript/Express/PostgreSQL. No ORM (`pg` + `node-pg-migrate`) so the fuzzy-match and salary-threshold SQL/logic stay directly inspectable.

## Why `activeTab` + `scripting`, not `<all_urls>`

The content script is never declared in the manifest. It's injected on demand, per-click, via `chrome.scripting.executeScript` inside the background service worker, scoped to whichever tab is active when the user presses "Select from Page" in the side panel. Combined with the `activeTab` permission (which Chrome grants for the duration of a direct user gesture on the extension's UI), this makes the extension genuinely site-agnostic without ever declaring broad host access — it can run on any page the user is currently looking at, and nothing else.

## Select-from-Page message flow

```
side panel                 background SW                 content script (injected)
    |  START_PICKER {field}     |                                  |
    |--------------------------->|                                  |
    |                            | chrome.scripting.executeScript   |
    |                            |---------------------------------->|
    |                            | BEGIN_PICK {field}                |
    |                            |---------------------------------->|
    |                            |                     (hover-highlight overlay,
    |                            |                      click or text-selection capture)
    |  PICKED_TEXT {field, text} |                                  |
    |<--------------------------------------------------------------|
```

`PICKED_TEXT` (and `PICKER_CANCELLED`) go **directly** from the content script to the side panel via `chrome.runtime.sendMessage` — Chrome already broadcasts extension messages to every open extension context (background, side panel, popup, options page), so no relay through the background script is needed for that leg. (An earlier version of this code *did* relay it through the background too, which delivered every pick event twice — caught by the Playwright end-to-end check, see `extension/src/background/index.ts`'s comment.)

`background/index.ts` still owns the picker's *start* (`START_PICKER` → inject → `BEGIN_PICK`), since only the background service worker can call `chrome.scripting.executeScript`.

The content script (`content/picker.ts`) is idempotent: re-injecting it (e.g. the user clicks "Select from Page" a second time) tears down any previous session's listeners/overlay first, via a guard stashed on `window`.

## Auth flow

```
side panel                                backend
    | chrome.identity.getAuthToken()         |
    | (Google consent, browser-native)       |
    |<--- Google access token                |
    | POST /api/auth/google {googleAccessToken}
    |----------------------------------------->|
    |                        verify via Google's userinfo endpoint
    |                        upsert user by google_sub (stable id, not email)
    |                        issue our own JWT
    |<--- {token, user} -----------------------|
    | store in chrome.storage.local            |
    | Authorization: Bearer <token> on every subsequent call
```

`google_sub` (not email) is the external identity key, since email addresses can change.

## Sponsor matching

`sponsors` table → loaded into memory on boot (and every 30 minutes, or immediately after `refresh-sponsors.ts` — see `SponsorIndexHolder`) → Fuse.js index over `organisation_name_normalized`. A request never sees a half-built index: `refresh()` builds the new `SponsorIndex` completely before swapping the reference.

Matching is scoped to `route = 'Skilled Worker'` rows only — the register also lists sponsors for other work routes (Global Business Mobility, Creative Worker, etc.), which aren't relevant to this product.

Confidence bands (`backend/src/services/sponsorMatch.service.ts`): Fuse score `≤0.05` → "Exact match", `≤0.25` → "Likely match", `≤0.40` → "Uncertain — verify manually", else "No match found". Starting thresholds — see `docs/DATA_SOURCES.md`'s note on calibration.

## SOC matching

Keyword/phrase overlap against the real gov.uk occupation table (`backend/src/services/socMatch.service.ts`), job title primary signal, job description as fallback when the title alone has no/weak signal. Three layers, each added because the previous one produced a visibly wrong top result during manual testing against real data (documented here rather than left as a mystery in the diff):

1. **Exact phrase match** scores highest (and sets `confidence: "high"` when the phrase is 2+ words) — the input literally contains one of gov.uk's own related-job-title phrases.
2. **IDF-weighted token overlap** as the fallback: common words (e.g. "engineer", which appears in civil/mechanical/electrical/... job types) are weighted *down* relative to rare, more specific words (e.g. "software"), so "Software Engineer" routes to `2134 Programmers and software development professionals` instead of tying with every other `*-engineer` occupation and falling back to alphabetical SOC-code order.
3. **Cumulative-evidence tiebreak**: when two occupations still tie on their single best-matching phrase, the one whose *other* phrases (jobType and remaining bullets) also touch the query wins — e.g. an occupation whose jobType itself says "specialists" beats a same-scoring rival whose jobType doesn't, when the query is "...specialist".
4. A small hand-picked synonym table bridges common real-world abbreviations gov.uk's own wording doesn't use ("HR Manager" → gov.uk only says "Human resource managers", never "HR"; "Primary School Teacher" → gov.uk says "teaching", not "teacher").

None of this makes the matcher perfect — it's still "lightweight keyword-based matching" per the spec, not NLP. That's exactly why the manual-override dropdown exists (`GET /api/soc/search`, backed by the same real 412-code table).

## Salary thresholds

`backend/src/services/salary.service.ts`, pure function over the static data files — see `docs/DATA_SOURCES.md` for exactly which real figures feed it and which discount paths are modeled vs. documented-but-not-wired-up.

## Quota

`daily_usage(user_id, usage_date, count)`, UTC calendar day, race-safe via `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`. Limit comes from `app_config.free_daily_quota` (admin-adjustable, not hardcoded), bypassed entirely for `users.is_premium`.

## Billing

Stripe Checkout Session (subscription mode), opened in a new browser tab via `chrome.tabs.create` — extensions can't embed Checkout inline. The webhook route (`POST /api/stripe/webhook`) is mounted with `express.raw()` **before** the app-wide `express.json()` in `app.ts`, since Stripe's signature verification needs the exact original request bytes; once a JSON body-parser has run, those bytes are gone.

## Key files

| Concern | File |
|---|---|
| DB schema | `backend/src/db/migrations/1700000000000_init.ts` |
| Sponsor fuzzy match | `backend/src/services/sponsorMatch.service.ts`, `sponsorIndexHolder.ts` |
| SOC match | `backend/src/services/socMatch.service.ts` |
| Salary calc | `backend/src/services/salary.service.ts`, `backend/src/data/salaryRules.ts` |
| Quota | `backend/src/services/quota.service.ts` |
| API routes | `backend/src/routes/*.routes.ts`, assembled in `backend/src/app.ts` |
| Extension messaging | `extension/src/background/index.ts`, `extension/src/content/picker.ts` |
| Extension UI | `extension/src/sidepanel/App.tsx` and `components/` |
| Real end-to-end check | `e2e/run-e2e.mjs` |

## Testing strategy

- **Unit** (`backend/test/unit/`): pure functions — sponsor confidence bucketing, SOC matching/tie-breaking, salary calc against known real examples, quota day-boundary logic (fake in-memory `Pool`, no real DB).
- **Integration** (`backend/test/integration/`): supertest against the real exported Express `app`, a real local test Postgres, an injected fake Google verifier (no egress to `accounts.google.com`), and a real Stripe client used only for local HMAC signature generation/verification (no egress to `stripe.com`).
- **End-to-end** (`e2e/run-e2e.mjs`): the real built extension in real headless Chromium, the real backend, real ingested sponsor/SOC/ISL data — see its own header comment for exactly what is and isn't covered (live OAuth/Stripe consent screens aren't, and can't be, from this environment).
