import { describe, it, expect } from "vitest";
import { computeSalaryThresholds } from "../../src/services/salary.service";

describe("computeSalaryThresholds", () => {
  it("returns all-null fields when no SOC code is given", () => {
    const result = computeSalaryThresholds(null);
    expect(result.socCode).toBeNull();
    expect(result.generalThresholdAnnual).toBeNull();
    expect(result.onImmigrationSalaryList).toBe(false);
  });

  it("uses the SOC going rate when it exceeds the general threshold (1111: £88,100 going rate)", () => {
    const result = computeSalaryThresholds("1111");
    expect(result.goingRateAnnual).toBe(88100);
    expect(result.generalThresholdAnnual).toBe(88100); // going rate > £41,700 general floor
    expect(result.onImmigrationSalaryList).toBe(false);
  });

  it("applies the £41,700 general floor when the going rate is lower (1150: £36,400 going rate)", () => {
    const result = computeSalaryThresholds("1150");
    expect(result.goingRateAnnual).toBe(36400);
    expect(result.generalThresholdAnnual).toBe(41700);
  });

  it("flags Immigration Salary List membership and reduced threshold for an ISL code (2142)", () => {
    const result = computeSalaryThresholds("2142");
    expect(result.onImmigrationSalaryList).toBe(true);
    expect(result.islReducedThresholdAnnual).toBe(33400);
    expect(result.islQualifyingAreas).toBe("UK wide");
  });

  it("computes new entrant rate as 70% of going rate, floored at £33,400", () => {
    // 1121 going rate £55,000 -> 70% = £38,500 (above floor)
    const result = computeSalaryThresholds("1121");
    expect(result.newEntrantRateAnnual).toBe(38500);

    // 1150 going rate £36,400 -> 70% = £25,480, below the £33,400 floor
    const resultLow = computeSalaryThresholds("1150");
    expect(resultLow.newEntrantRateAnnual).toBe(33400);
  });

  it("returns nulls for an unknown SOC code", () => {
    const result = computeSalaryThresholds("0000");
    expect(result.goingRateAnnual).toBeNull();
    expect(result.generalThresholdAnnual).toBe(41700); // still the general floor
    expect(result.newEntrantRateAnnual).toBeNull();
  });
});
