import type { Pool } from "pg";
import type Stripe from "stripe";
import { SponsorIndexHolder } from "./services/sponsorIndexHolder";
import type { GoogleTokenVerifier } from "./services/googleAuth.service";
import type { SocOccupation } from "./services/socMatch.service";
import socOccupationsData from "./data/socOccupations.json";

export interface AppContext {
  pool: Pool;
  sponsorIndexHolder: SponsorIndexHolder;
  socOccupations: SocOccupation[];
  googleVerifier: GoogleTokenVerifier;
  stripe: Stripe | null;
}

export function loadSocOccupations(): SocOccupation[] {
  return socOccupationsData.occupations as SocOccupation[];
}
