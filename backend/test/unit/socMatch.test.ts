import { describe, it, expect } from "vitest";
import { matchSoc, applyManualOverride, type SocOccupation } from "../../src/services/socMatch.service";

const FIXTURE_OCCUPATIONS: SocOccupation[] = [
  {
    code: "2134",
    jobType: "Programmers and software development professionals",
    relatedJobTitles: ["Software engineers", "Software developers", "Programmers", "Web developers"],
    eligibility: "Higher Skilled",
  },
  {
    code: "2433",
    jobType: "Finance and investment analysts and advisers",
    relatedJobTitles: ["Investment analysts", "Financial analysts"],
    eligibility: "Higher Skilled",
  },
  {
    code: "6131",
    jobType: "Nursing auxiliaries and assistants",
    relatedJobTitles: ["Nursing auxiliaries and assistants"],
    eligibility: "Higher Skilled",
  },
  {
    code: "1112",
    jobType: "Elected officers and representatives",
    relatedJobTitles: ["Councillors", "Assembly members and Members of Parliament"],
    eligibility: "Ineligible",
  },
];

describe("matchSoc", () => {
  it("finds a high-confidence phrase match from the job title", () => {
    const result = matchSoc(FIXTURE_OCCUPATIONS, "Senior Software Engineer");
    expect(result.confidence).toBe("high");
    expect(result.selected?.code).toBe("2134");
  });

  it("falls back to the job description when the title has no signal", () => {
    const result = matchSoc(
      FIXTURE_OCCUPATIONS,
      "Rockstar Ninja",
      "You will be writing software and working as one of our software developers.",
    );
    expect(result.selected?.code).toBe("2134");
    expect(["medium", "low"]).toContain(result.confidence);
  });

  it("returns no-match when nothing overlaps at all", () => {
    const result = matchSoc(FIXTURE_OCCUPATIONS, "Astronaut Zookeeper Xylophonist");
    expect(result.confidence).toBe("no-match");
    expect(result.selected).toBeNull();
  });

  it("is deterministic on true ties (identical match strength): picks the lowest SOC code", () => {
    const tiedOccupations: SocOccupation[] = [
      { code: "9999", jobType: "Widget specialists", relatedJobTitles: ["Widget specialist"], eligibility: "Medium Skilled" },
      { code: "1000", jobType: "Widget specialists", relatedJobTitles: ["Widget specialist"], eligibility: "Medium Skilled" },
    ];
    const result = matchSoc(tiedOccupations, "Widget specialist");
    expect(result.selected?.code).toBe("1000");
  });

  it("prefers the occupation with stronger cumulative evidence over a same-best-score rival", () => {
    const occupations: SocOccupation[] = [
      {
        code: "9999",
        jobType: "Widget operations",
        relatedJobTitles: ["Widget technician"],
        eligibility: "Medium Skilled",
      },
      {
        code: "1000",
        jobType: "Widget specialists",
        relatedJobTitles: ["Widget specialist", "Widget technician"],
        eligibility: "Medium Skilled",
      },
    ];
    // "Widget technician" matches both occupations' bullet equally well, but
    // 1000's jobType *also* says "specialists" — stronger overall signal.
    const result = matchSoc(occupations, "Widget Technician");
    expect(result.selected?.code).toBe("1000");
  });
});

describe("applyManualOverride", () => {
  it("returns the requested SOC code with manual-override confidence", () => {
    const result = applyManualOverride(FIXTURE_OCCUPATIONS, "6131");
    expect(result.confidence).toBe("manual-override");
    expect(result.selected?.code).toBe("6131");
  });

  it("returns no-match for an unknown code", () => {
    const result = applyManualOverride(FIXTURE_OCCUPATIONS, "0000");
    expect(result.confidence).toBe("no-match");
  });
});
