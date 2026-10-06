import Fuse from "fuse.js";
import type { Pool } from "pg";
import type { SponsorConfidence, SponsorMatchResult } from "../types/dto";

export interface SponsorRow {
  organisationName: string;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
}

interface SponsorRecord extends SponsorRow {
  organisationNameNormalized: string;
}

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<SponsorRecord>>[1] = {
  keys: ["organisationNameNormalized"],
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.45,
  minMatchCharLength: 2,
};

export function normalizeOrgName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function bucketConfidence(score: number): SponsorConfidence {
  if (score <= 0.05) return "Exact match";
  if (score <= 0.25) return "Likely match";
  if (score <= 0.4) return "Uncertain — verify manually";
  return "No match found";
}

const NO_MATCH: SponsorMatchResult = {
  confidence: "No match found",
  matchedLegalName: null,
  townCity: null,
  county: null,
  typeRating: null,
  score: null,
};

/**
 * In-memory fuzzy index over the Skilled Worker sponsor register. Built once
 * from Postgres on boot and rebuilt (new instance, swapped in by the caller)
 * after each `refresh-sponsors.ts` run — never mutated in place, so a
 * request never sees a half-built index.
 */
export class SponsorIndex {
  private readonly fuse: Fuse<SponsorRecord>;
  private readonly count: number;

  constructor(rows: SponsorRow[]) {
    const records: SponsorRecord[] = rows.map((r) => ({
      ...r,
      organisationNameNormalized: normalizeOrgName(r.organisationName),
    }));
    this.count = records.length;
    this.fuse = new Fuse(records, FUSE_OPTIONS);
  }

  size(): number {
    return this.count;
  }

  match(companyNameRaw: string): SponsorMatchResult {
    const companyName = (companyNameRaw ?? "").trim();
    if (!companyName) return NO_MATCH;

    const results = this.fuse.search(normalizeOrgName(companyName), { limit: 1 });
    if (results.length === 0 || results[0].score === undefined) return NO_MATCH;

    const top = results[0];
    const score = top.score as number;
    const confidence = bucketConfidence(score);
    if (confidence === "No match found") return { ...NO_MATCH, score };

    return {
      confidence,
      matchedLegalName: top.item.organisationName,
      townCity: top.item.townCity,
      county: top.item.county,
      typeRating: top.item.typeRating,
      score,
    };
  }
}

/**
 * Loads the current Skilled Worker sponsor snapshot from Postgres. Scoped to
 * route = 'Skilled Worker' — the register also contains other work routes
 * (Global Business Mobility, Creative Worker, etc.) which aren't relevant to
 * this product's Skilled Worker-specific check.
 */
export async function loadSponsorRowsFromDb(pool: Pool): Promise<SponsorRow[]> {
  const result = await pool.query<SponsorRow>(
    `SELECT organisation_name AS "organisationName",
            town_city AS "townCity",
            county,
            type_rating AS "typeRating"
       FROM sponsors
      WHERE route = 'Skilled Worker'`,
  );
  return result.rows;
}

export async function getSponsorSnapshotDate(pool: Pool): Promise<string | null> {
  const result = await pool.query<{ max: string | null }>(`SELECT MAX(source_snapshot_date) AS max FROM sponsors`);
  const value = result.rows[0]?.max;
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}
