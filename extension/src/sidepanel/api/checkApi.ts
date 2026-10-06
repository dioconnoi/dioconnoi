import { apiFetch } from "./client";
import type { CheckResponseBody, SocSearchResult } from "../../shared/types";

export interface CheckRequest {
  companyName: string;
  jobTitle: string;
  jobDescription?: string;
  socOverrideCode?: string;
}

export function runCheck(request: CheckRequest): Promise<CheckResponseBody> {
  return apiFetch<CheckResponseBody>("/api/check", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function searchSoc(query: string): Promise<SocSearchResult[]> {
  if (query.trim().length < 2) return [];
  const result = await apiFetch<{ results: SocSearchResult[] }>(`/api/soc/search?q=${encodeURIComponent(query)}`);
  return result.results;
}
