import type { SalaryThresholds } from "../types/dto";
import { SALARY_RULES } from "../data/salaryRules";
import goingRatesData from "../data/goingRates.json";
import immigrationSalaryListData from "../data/immigrationSalaryList.json";

interface GoingRateEntry {
  code: string;
  standardGoingRateAnnual: number | null;
  standardGoingRateHourly: number | null;
}

interface IslEntry {
  code: string;
  qualifyingAreas: string;
  standardRateAnnual: number;
  lowerRateAnnual: number;
}

const goingRateByCode = new Map<string, GoingRateEntry>(
  (goingRatesData.occupations as GoingRateEntry[]).map((o) => [o.code, o]),
);
const islByCode = new Map<string, IslEntry>(
  (immigrationSalaryListData.entries as IslEntry[]).map((e) => [e.code, e]),
);

export function computeSalaryThresholds(socCode: string | null): SalaryThresholds {
  if (!socCode) {
    return {
      socCode: null,
      goingRateAnnual: null,
      goingRateHourly: null,
      generalThresholdAnnual: null,
      onImmigrationSalaryList: false,
      islReducedThresholdAnnual: null,
      islQualifyingAreas: null,
      newEntrantRateAnnual: null,
    };
  }

  const goingRate = goingRateByCode.get(socCode) ?? null;
  const goingRateAnnual = goingRate?.standardGoingRateAnnual ?? null;

  const generalThresholdAnnual =
    goingRateAnnual !== null
      ? Math.max(SALARY_RULES.generalThresholdAnnual, goingRateAnnual)
      : SALARY_RULES.generalThresholdAnnual;

  const isl = islByCode.get(socCode) ?? null;

  const newEntrantRateAnnual =
    goingRateAnnual !== null
      ? Math.max(
          SALARY_RULES.newEntrant.floorAnnual,
          Math.round(goingRateAnnual * SALARY_RULES.newEntrant.percentOfGoingRate),
        )
      : null;

  return {
    socCode,
    goingRateAnnual,
    goingRateHourly: goingRate?.standardGoingRateHourly ?? null,
    generalThresholdAnnual,
    onImmigrationSalaryList: isl !== null,
    islReducedThresholdAnnual: isl?.standardRateAnnual ?? null,
    islQualifyingAreas: isl?.qualifyingAreas ?? null,
    newEntrantRateAnnual,
  };
}

export const DATA_VERSIONS = {
  socOccupations: (goingRatesData as { version: string }).version,
  goingRates: (goingRatesData as { version: string }).version,
  immigrationSalaryList: (immigrationSalaryListData as { version: string }).version,
  salaryRules: SALARY_RULES.version,
};
