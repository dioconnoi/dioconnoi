import { Pool } from "pg";
import type Stripe from "stripe";
import type { AppContext } from "../../src/appContext";
import { SponsorIndexHolder } from "../../src/services/sponsorIndexHolder";
import type { GoogleTokenVerifier, GoogleUserInfo } from "../../src/services/googleAuth.service";
import type { SocOccupation } from "../../src/services/socMatch.service";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://visa_checker:visa_checker@localhost:5432/visa_checker_test";

export function createTestPool(): Pool {
  return new Pool({ connectionString: TEST_DATABASE_URL });
}

export async function resetDb(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE daily_usage, subscriptions, sponsors, app_config, users RESTART IDENTITY CASCADE");
  await pool.query("INSERT INTO app_config (key, value, updated_by) VALUES ('free_daily_quota', '20', 'test-setup')");
}

export const FIXTURE_SPONSORS = [
  { organisationName: "Google (UK) Limited", townCity: "London", county: null as string | null, typeRating: "Worker (A rating)", route: "Skilled Worker" },
  { organisationName: "Acme Consulting Ltd", townCity: "Manchester", county: null as string | null, typeRating: "Worker (A rating)", route: "Skilled Worker" },
];

export async function seedFixtureSponsors(pool: Pool): Promise<void> {
  for (const s of FIXTURE_SPONSORS) {
    await pool.query(
      `INSERT INTO sponsors (organisation_name, organisation_name_normalized, town_city, county, type_rating, route, source_snapshot_date)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
      [s.organisationName, s.organisationName.toUpperCase(), s.townCity, s.county, s.typeRating, s.route],
    );
  }
}

export const FIXTURE_SOC_OCCUPATIONS: SocOccupation[] = [
  {
    code: "2134",
    jobType: "Programmers and software development professionals",
    relatedJobTitles: ["Software developers", "Computer programmers"],
    eligibility: "Higher Skilled",
  },
  {
    code: "5313",
    jobType: "Bricklayers",
    relatedJobTitles: ["Bricklayers"],
    eligibility: "Medium Skilled",
  },
];

export class FakeGoogleTokenVerifier implements GoogleTokenVerifier {
  constructor(
    private readonly behavior:
      | { kind: "success"; info: GoogleUserInfo }
      | { kind: "failure" } = { kind: "success", info: { sub: "fixture-sub", email: "fixture@example.com", name: "Fixture User", picture: null } },
  ) {}

  async verify(_accessToken: string): Promise<GoogleUserInfo> {
    if (this.behavior.kind === "failure") throw new Error("Simulated Google verification failure");
    return this.behavior.info;
  }
}

export interface TestContextOptions {
  googleVerifier?: GoogleTokenVerifier;
  stripe?: Stripe | null;
}

export async function buildTestContext(pool: Pool, options: TestContextOptions = {}): Promise<AppContext> {
  const sponsorIndexHolder = await SponsorIndexHolder.create(pool);
  return {
    pool,
    sponsorIndexHolder,
    socOccupations: FIXTURE_SOC_OCCUPATIONS,
    googleVerifier: options.googleVerifier ?? new FakeGoogleTokenVerifier(),
    stripe: options.stripe ?? null,
  };
}
