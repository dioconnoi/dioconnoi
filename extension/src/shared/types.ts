/**
 * Mirrors backend/src/types/dto.ts. Kept as a small hand-copied subset
 * (no shared package/build-time link between extension and backend) — if
 * the backend's response shape changes, update both sides manually.
 */

export type SponsorConfidence = "Exact match" | "Likely match" | "Uncertain — verify manually" | "No match found";

export interface SponsorMatchResult {
  confidence: SponsorConfidence;
  matchedLegalName: string | null;
  townCity: string | null;
  county: string | null;
  typeRating: string | null;
  score: number | null;
}

export type SocConfidence = "high" | "medium" | "low" | "manual-override" | "no-match";

export interface SocCandidate {
  code: string;
  jobType: string;
  eligibility: string;
  score: number;
}

export interface SocMatchResult {
  confidence: SocConfidence;
  selected: SocCandidate | null;
  alternatives: SocCandidate[];
}

export interface SalaryThresholds {
  socCode: string | null;
  goingRateAnnual: number | null;
  goingRateHourly: number | null;
  generalThresholdAnnual: number | null;
  onImmigrationSalaryList: boolean;
  islReducedThresholdAnnual: number | null;
  islQualifyingAreas: string | null;
  newEntrantRateAnnual: number | null;
}

export interface QuotaStatus {
  unlimited: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
}

export interface CheckResponseBody {
  sponsor: SponsorMatchResult;
  soc: SocMatchResult;
  salary: SalaryThresholds;
  quota: QuotaStatus;
  disclaimer: string;
  dataVersions: {
    sponsors: string | null;
    socOccupations: string;
    goingRates: string;
    immigrationSalaryList: string;
    salaryRules: string;
  };
}

export interface MeResponseBody {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  isPremium: boolean;
  quota: QuotaStatus;
}

export interface SocSearchResult {
  code: string;
  jobType: string;
  eligibility: string;
}
