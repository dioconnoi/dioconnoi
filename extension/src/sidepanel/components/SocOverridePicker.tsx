import { useEffect, useRef, useState } from "react";
import { searchSoc } from "../api/checkApi";
import type { SocCandidate, SocSearchResult } from "../../shared/types";

interface SocOverridePickerProps {
  alternatives: SocCandidate[];
  currentCode: string | null;
  onOverride: (code: string) => void;
}

export default function SocOverridePicker({ alternatives, currentCode, onOverride }: SocOverridePickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchSoc(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const dropdownOptions = results.length > 0 ? results : alternatives;

  return (
    <div className="soc-override">
      <label htmlFor="soc-override-select">Not right? Pick the correct SOC code</label>
      <select
        id="soc-override-select"
        value={currentCode ?? ""}
        onChange={(e) => {
          if (e.target.value) onOverride(e.target.value);
        }}
      >
        <option value="" disabled>
          {dropdownOptions.length > 0 ? "Choose a SOC code…" : "Type below to search…"}
        </option>
        {dropdownOptions.map((o) => (
          <option key={o.code} value={o.code}>
            {o.code} — {o.jobType}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Search SOC codes or job titles"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginTop: 6 }}
      />
    </div>
  );
}
