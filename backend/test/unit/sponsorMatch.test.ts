import { describe, it, expect } from "vitest";
import { SponsorIndex, normalizeOrgName } from "../../src/services/sponsorMatch.service";

const FIXTURE_ROWS = [
  { organisationName: "Google (UK) Limited", townCity: "London", county: null, typeRating: "Worker (A rating)" },
  { organisationName: "Microsoft Limited", townCity: "Reading", county: "Berkshire", typeRating: "Worker (A rating)" },
  { organisationName: "Acme Consulting Ltd", townCity: "Manchester", county: null, typeRating: "Worker (A rating)" },
  { organisationName: "Zylphar Biotech PLC", townCity: "Cambridge", county: null, typeRating: "Worker (A rating)" },
];

describe("normalizeOrgName", () => {
  it("trims, collapses whitespace, and upper-cases", () => {
    expect(normalizeOrgName("  Asian African Foods Ltd  ")).toBe("ASIAN AFRICAN FOODS LTD");
    expect(normalizeOrgName("A   B\tC")).toBe("A B C");
  });
});

describe("SponsorIndex.match", () => {
  const index = new SponsorIndex(FIXTURE_ROWS);

  it("returns Exact match for an identical (case/whitespace-insensitive) name", () => {
    const result = index.match("google (uk) limited");
    expect(result.confidence).toBe("Exact match");
    expect(result.matchedLegalName).toBe("Google (UK) Limited");
  });

  it("returns Likely match for a close typo", () => {
    const result = index.match("Microsoft Limted"); // missing an 'i'
    expect(["Exact match", "Likely match"]).toContain(result.confidence);
    expect(result.matchedLegalName).toBe("Microsoft Limited");
  });

  it("returns Uncertain or No match for a very different name", () => {
    const result = index.match("Totally Unrelated Megacorp Holdings International");
    expect(["Uncertain — verify manually", "No match found"]).toContain(result.confidence);
  });

  it("returns No match found for an empty query", () => {
    const result = index.match("   ");
    expect(result.confidence).toBe("No match found");
    expect(result.matchedLegalName).toBeNull();
  });

  it("exposes the index size", () => {
    expect(index.size()).toBe(FIXTURE_ROWS.length);
  });
});
