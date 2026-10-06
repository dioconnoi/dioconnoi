import type { CheckResponseBody } from "../../shared/types";
import SocOverridePicker from "./SocOverridePicker";

function formatGbp(amount: number | null): string {
  if (amount === null) return "—";
  return `£${amount.toLocaleString("en-GB")}`;
}

function confidenceBadgeClass(confidence: string): string {
  return `badge confidence-${confidence.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

interface ResultsPanelProps {
  result: CheckResponseBody;
  onSocOverride: (code: string) => void;
}

export default function ResultsPanel({ result, onSocOverride }: ResultsPanelProps) {
  const { sponsor, soc, salary, disclaimer, dataVersions } = result;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <h2>Sponsor match</h2>
        <span className={confidenceBadgeClass(sponsor.confidence)}>{sponsor.confidence}</span>
        {sponsor.matchedLegalName && (
          <>
            <div className="row">
              <span className="row-label">Legal entity</span>
              <span className="row-value">{sponsor.matchedLegalName}</span>
            </div>
            {(sponsor.townCity || sponsor.county) && (
              <div className="row">
                <span className="row-label">Location</span>
                <span className="row-value">{[sponsor.townCity, sponsor.county].filter(Boolean).join(", ")}</span>
              </div>
            )}
            {sponsor.typeRating && (
              <div className="row">
                <span className="row-label">Licence</span>
                <span className="row-value">{sponsor.typeRating}</span>
              </div>
            )}
          </>
        )}
        {!sponsor.matchedLegalName && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
            No company in the Skilled Worker sponsor register matched closely enough. Double-check the exact legal
            name on gov.uk.
          </p>
        )}
      </div>

      <div className="card">
        <h2>SOC code</h2>
        <span className={confidenceBadgeClass(soc.confidence)}>{soc.confidence}</span>
        {soc.selected ? (
          <>
            <div className="row">
              <span className="row-label">Code</span>
              <span className="row-value">{soc.selected.code}</span>
            </div>
            <div className="row">
              <span className="row-label">Occupation</span>
              <span className="row-value">{soc.selected.jobType}</span>
            </div>
            <div className="row">
              <span className="row-label">Eligibility</span>
              <span className="row-value">{soc.selected.eligibility}</span>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
            Couldn't guess a SOC code from the job title/description — pick one below.
          </p>
        )}
        <SocOverridePicker alternatives={soc.alternatives} currentCode={soc.selected?.code ?? null} onOverride={onSocOverride} />
      </div>

      <div className="card">
        <h2>Immigration Salary List</h2>
        {salary.onImmigrationSalaryList ? (
          <>
            <span className="badge confidence-high">On the list{salary.islQualifyingAreas ? ` (${salary.islQualifyingAreas})` : ""}</span>
            <div className="row">
              <span className="row-label">ISL reduced threshold</span>
              <span className="row-value">{formatGbp(salary.islReducedThresholdAnnual)}/yr</span>
            </div>
          </>
        ) : (
          <span className="badge confidence-no-match">Not on the list</span>
        )}
      </div>

      <div className="card">
        <h2>Salary thresholds</h2>
        <div className="row">
          <span className="row-label">General threshold</span>
          <span className="row-value">{formatGbp(salary.generalThresholdAnnual)}/yr</span>
        </div>
        <div className="row">
          <span className="row-label">SOC going rate</span>
          <span className="row-value">{formatGbp(salary.goingRateAnnual)}/yr</span>
        </div>
        <div className="row">
          <span className="row-label">New entrant rate</span>
          <span className="row-value">{formatGbp(salary.newEntrantRateAnnual)}/yr</span>
        </div>
      </div>

      <p className="disclaimer">
        {disclaimer}
        <br />
        Data: sponsors {dataVersions.sponsors ?? "unknown"} · SOC/going rates {dataVersions.socOccupations} ·
        Immigration Salary List {dataVersions.immigrationSalaryList}
      </p>
    </div>
  );
}
