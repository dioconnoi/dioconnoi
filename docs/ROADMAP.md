# Roadmap

Explicitly out of scope for v1, per the original spec — documented here so they aren't lost, not built now:

- **Job application Tracker** — tracking applications submitted through the extension.
- **Employee Referrals finder** — surfacing employees at a target company who could refer the user.
- **CV Tailor / AI match score** — AI-generated CV suggestions or a numeric match score against a job description.

## Known v1 gaps worth closing next (see `docs/DATA_SOURCES.md` for detail)

- Salary discount paths that are in the real source data but not wired into `/api/check`'s response: STEM/non-STEM PhD discounts, the postdoctoral-researcher discount, and the Immigration Salary List's "lower rate" column (pre-4-April-2024 / Health-and-Care Worker cohort).
- Healthcare/education SOC codes whose pay is set by national pay scales rather than the standard going-rate table (NHS pay scales, teaching pay scales) — currently return a `null` going rate.
- Sponsor fuzzy-match confidence bands are reasonable starting thresholds, not calibrated against a labeled dataset of real near-duplicate sponsor names.
- No admin UI for the daily quota config — it's a protected API endpoint only (`PUT /api/admin/config/:key`).
