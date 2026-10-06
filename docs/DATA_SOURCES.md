# Data sources

This product's accuracy depends entirely on the data below. Every figure is transcribed from a real Home Office / gov.uk publication captured on the date shown — none of it is placeholder or invented. Dates matter: Skilled Worker salary rules and the sponsor register change over time, and this snapshot will drift out of date. **Treat every result in the UI as a starting point to verify on gov.uk, not as legal advice** — the product says this in its own disclaimer footer too.

## Register of Licensed Sponsors: Skilled Worker

- **Source**: "Register of Worker and Temporary Worker licensed sponsors", gov.uk / UK Visas and Immigration.
- **Snapshot used in this build**: the live CSV as published **2026-10-05** (143,159 rows; 123,132 with `Route = "Skilled Worker"`, which is the subset this product actually matches against — the rest are other work routes like Global Business Mobility, Creative Worker, Charity Worker, etc., included in storage for completeness but not surfaced).
- **How it's ingested**: `backend/scripts/refresh-sponsors.ts` streams and bulk-upserts the CSV into the `sponsors` table (full replace per run, tagged with a snapshot date), then the running backend rebuilds its in-memory Fuse.js fuzzy-match index. Run it on a schedule matching gov.uk's publish cadence (the real register updates frequently, sometimes daily).
- **Committed fixture**: `backend/src/data/sponsors.sample.csv` (200 rows, a spread across the real register) is used for fast tests and as a non-network-dependent seed for anyone cloning this repo without the full CSV.
- **Known gap**: Fuse.js confidence-label bands (`Exact match` / `Likely match` / `Uncertain — verify manually`) are reasonable starting thresholds, not calibrated against a labeled dataset of real typos/aliases. Recalibrate `backend/src/services/sponsorMatch.service.ts`'s score buckets if false positives/negatives show up in practice.

## SOC2020 occupation codes + eligibility

- **Source**: "Skilled Worker visa: eligible occupations and codes", gov.uk / Home Office guidance, **updated 22 July 2025**.
- **File**: `backend/src/data/socOccupations.json` — 412 SOC2020 four-digit occupation codes (the complete set gov.uk publishes for this route), each with its job type, the full list of related job titles gov.uk associates with that code, and its eligibility (`Higher Skilled` / `Medium Skilled` / `Ineligible`, with a handful of codes carrying a conditional annotation like "Medium Skilled – extending in same occupation only" — kept verbatim, not simplified).
- **How it was produced**: transcribed directly from the 84-page gov.uk PDF (not scraped from HTML, not summarized) by reading every page and cross-checking the merged result's code count (412) and range (1111–9269) against the known real SOC2020 structure. See `docs/ARCHITECTURE.md` for the SOC-matching algorithm that uses this as its keyword source.

## Skilled Worker going rates

- **Source**: "Skilled Worker visa: going rates for eligible occupation codes", gov.uk / Home Office guidance, **updated 22 July 2025**.
- **File**: `backend/src/data/goingRates.json` — standard annual/hourly going rate per SOC code, for the 270 codes that have a published standard rate.
- **Known gap**: the remaining ~140 eligible codes have no entry here (not a transcription omission — gov.uk's own table doesn't publish a standard rate for them). Reasons fall into two groups: (1) the code is `Ineligible` for sponsorship entirely, so no rate applies; (2) pay for that code is set by national pay scales instead (NHS/healthcare and education roles) — gov.uk publishes those separately ("national pay scales for eligible healthcare jobs" / "...teaching and education leadership jobs"), which are **not** included in this build. A handful of other codes are explicitly marked "Not eligible for standard rate applications" in the source document and were transcribed as `null` rather than guessed. This product does not currently handle the national-pay-scale cohort — see `docs/ROADMAP.md`.
- Also **not** covered: the "lower rate" going-rate column for the pre-4-April-2024 / Health-and-Care-Worker cohort (gov.uk publishes this as a separate multiplier rule, not a second column in this table) — see Salary rules below.

## Immigration Salary List (ISL)

- **Source**: "Skilled Worker visa: immigration salary list", gov.uk / Home Office guidance, **updated 11 November 2025**.
- **File**: `backend/src/data/immigrationSalaryList.json` — the complete table: 25 SOC codes, each with its qualifying UK area(s) (`UK wide`, or `Scotland only`), standard rate, and lower rate (for the pre-April-2024/Health-and-Care-Worker cohort — see below).
- This is a **full, complete transcription** of the source table (all 7 pages were read), not a partial/curated subset.

## General salary threshold & discount rules

- **Source**: gov.uk "Skilled Worker visa: Your job" and "Skilled Worker visa: When you can be paid less" guidance pages, captured 2026-10-06.
- **File**: `backend/src/data/salaryRules.ts`.
- **Rules actually implemented** (`backend/src/services/salary.service.ts`) and surfaced in the API/UI, matching the spec's three headline figures:
  - **General threshold**: £41,700/year, or the SOC code's going rate, whichever is **higher**.
  - **ISL-reduced threshold**: the matched SOC code's ISL standard rate, when it's on the Immigration Salary List.
  - **New-entrant rate**: 70% of the SOC going rate, floored at £33,400/year (the "under 26 / recent graduate / professional training" discount category).
- **Rules captured in the source data but NOT yet wired into the API response** (documented gap, not an oversight — scoping the v1 output to exactly the three figures the spec asks for):
  - STEM PhD discount (80% of going rate, floor £33,400) and non-STEM relevant-PhD discount (90% of going rate, floor £37,500).
  - Postdoctoral science/education discount (70% of going rate), restricted to SOC codes 2111, 2112, 2113, 2114, 2115, 2119, 2162, 2311.
  - The ISL table's own "lower rate" column (pre-4-April-2024 cohort / Health-and-Care Worker visa).
  - These are documented in `salaryRules.ts`'s `SALARY_RULES` object so a future PR can extend `computeSalaryThresholds()` without re-deriving the source rules.

## Keeping this current

Every file above carries `version` / `sourceDate` / `sourceDoc` (and `sourceUrl` where applicable) fields. When Home Office/ONS publish an update:

1. Re-download the relevant gov.uk PDF/page.
2. Re-transcribe the changed table(s) into the corresponding JSON/TS file, bumping `version`/`sourceDate`.
3. For the sponsor register specifically, just re-run `refresh-sponsors.ts` — no manual transcription needed, it's a direct CSV ingest.
