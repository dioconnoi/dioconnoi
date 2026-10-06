/**
 * Skilled Worker visa general salary rules.
 *
 * Source: gov.uk "Skilled Worker visa: Your job" and "Skilled Worker visa:
 * When you can be paid less" guidance pages (captured by the user as PDF
 * screenshots, 2026-10-06). Not independently re-fetched from gov.uk by this
 * backend — verify against the live pages before relying on this for a real
 * visa application. This is not legal advice.
 */
export const SALARY_RULES = {
  version: "2026-10-06",
  sourceDoc:
    "gov.uk 'Skilled Worker visa: Your job' and 'Skilled Worker visa: When you can be paid less' guidance pages",
  disclaimer:
    "Figures below are transcribed from gov.uk guidance captured on the sourceDate. Verify against the live gov.uk pages before relying on this for a real visa application — this is not legal advice.",

  /** Standard salary threshold that applies UK-wide regardless of SOC going rate. */
  generalThresholdAnnual: 41700,

  /**
   * New entrant rate: under 26 on the date of application, OR currently
   * studying towards / within 2 years of a UK bachelor's degree or above (or
   * on/recently on a Graduate visa), OR working towards a recognised UK
   * regulated profession. Paid 70% of the job's standard going rate, with a
   * floor. Maximum stay in this category is 4 years.
   */
  newEntrant: {
    percentOfGoingRate: 0.7,
    floorAnnual: 33400,
    maxStayYears: 4,
  },

  /**
   * PhD-level qualification relevant to the job. Two sub-cases depending on
   * subject. Not modelled as a separate v1 output field (see
   * docs/DATA_SOURCES.md) but kept here for the documented roadmap
   * extension.
   */
  phdDiscount: {
    stem: { percentOfGoingRate: 0.8, floorAnnual: 33400 },
    nonStem: { percentOfGoingRate: 0.9, floorAnnual: 37500 },
  },

  /**
   * Postdoctoral position in science/higher education, restricted to a
   * specific set of SOC codes. 70% of going rate. Documented roadmap
   * extension, not a v1 output field.
   */
  postdocDiscount: {
    percentOfGoingRate: 0.7,
    eligibleSocCodes: ["2111", "2112", "2113", "2114", "2115", "2119", "2162", "2311"],
  },

  /**
   * Immigration Salary List occupations are paid at (roughly) 80% of the
   * route's usual minimum rate — but the exact per-code standard/lower rate
   * figures in immigrationSalaryList.json are authoritative; this constant
   * is documentation only, not used in the calculation.
   */
  immigrationSalaryListApproxPercentOfGoingRate: 0.8,
} as const;
