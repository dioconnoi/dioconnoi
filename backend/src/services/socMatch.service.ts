import type { SocCandidate, SocConfidence, SocMatchResult } from "../types/dto";

export interface SocOccupation {
  code: string;
  jobType: string;
  relatedJobTitles: string[];
  /** Verbatim eligibility text from the gov.uk source — see SocCandidate in dto.ts. */
  eligibility: string;
}

const STOP_WORDS = new Set([
  "the", "and", "of", "a", "an", "in", "for", "to", "or", "with", "at", "on", "not",
  "elsewhere", "classified", "other", "related", "jobs", "all", "only", "job",
]);

/** Naive suffix stemmer so "engineer"/"engineers", "agency"/"agencies" etc. match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es") && /(?:[sxz]|[cs]h)$/.test(word.slice(0, -2))) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

/**
 * A small, hand-picked list of common job-title abbreviations/lexical
 * variants that a lightweight word-overlap matcher otherwise can't bridge
 * (e.g. input "HR Manager" sharing no literal word with gov.uk's "Human
 * resource managers and directors"). Only used for the fuzzy token-overlap
 * scoring path, never for exact-phrase matching, so it only ever broadens a
 * candidate's score — it can't manufacture a false "high confidence" phrase
 * hit.
 */
const SYNONYM_EXPANSIONS: Record<string, string[]> = {
  hr: ["human", "resource"],
  pm: ["project", "manager"],
  qa: ["quality", "assurance"],
  ux: ["user", "experience"],
  ui: ["user", "interface"],
  dev: ["developer"],
  admin: ["administrator", "administrative"],
  mgr: ["manager"],
  exec: ["executive"],
  ops: ["operation"],
  eng: ["engineer", "engineering"],
  teacher: ["teaching", "teach"],
  teaching: ["teacher", "teach"],
  nurse: ["nursing"],
  nursing: ["nurse"],
  accountant: ["accounting"],
  accounting: ["accountant"],
};

function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set<string>();
  for (const t of tokens) {
    expanded.add(t);
    for (const synonym of SYNONYM_EXPANSIONS[t] ?? []) expanded.add(stem(synonym));
  }
  return Array.from(expanded);
}

/** Used for fuzzy token-overlap scoring (synonym-expanded). Exact phrase
 * matching uses normalizeForSubstring below instead, which deliberately
 * does NOT expand synonyms, so a "high confidence" result always means a
 * literal gov.uk phrase was found verbatim in the input. */
function significantTokens(text: string): string[] {
  const base = tokenize(text).filter((w) => !STOP_WORDS.has(w));
  return expandWithSynonyms(base);
}

function normalizeForSubstring(text: string): string {
  return ` ${tokenize(text).join(" ")} `;
}

function containsPhrase(normalizedInput: string, phraseWords: string[]): boolean {
  if (phraseWords.length === 0) return false;
  return normalizedInput.includes(` ${phraseWords.join(" ")} `);
}

interface PhraseScore {
  score: number;
  matchedPhrase: string | null;
  isPhraseMatch: boolean;
  phraseWordCount: number;
}

/**
 * Per-token document frequency across the occupation corpus, used to weight
 * token-overlap matches by rarity (IDF-style) — e.g. "software" appears in
 * only a handful of occupations and is a strong signal, while "engineer"
 * appears in dozens (civil/mechanical/electrical/...) and alone is a weak
 * one. Without this, "Software Engineer" would tie-break on SOC code number
 * against every *-engineer occupation instead of routing to software roles.
 */
export interface SocCorpusStats {
  docFrequency: Map<string, number>;
  totalDocs: number;
}

export function buildCorpusStats(occupations: SocOccupation[]): SocCorpusStats {
  const docFrequency = new Map<string, number>();
  for (const occ of occupations) {
    const seen = new Set<string>();
    for (const phrase of [occ.jobType, ...occ.relatedJobTitles]) {
      for (const w of significantTokens(phrase)) seen.add(w);
    }
    for (const w of seen) docFrequency.set(w, (docFrequency.get(w) ?? 0) + 1);
  }
  return { docFrequency, totalDocs: occupations.length };
}

function idfWeight(token: string, stats: SocCorpusStats): number {
  const freq = stats.docFrequency.get(token) ?? 1;
  return Math.log((stats.totalDocs + 1) / (freq + 1)) + 1;
}

interface OccupationScore extends PhraseScore {
  /** Sum of matched-word weight across EVERY phrase (not just the best one) —
   * used only as a tiebreaker, so an occupation whose jobType *and* several
   * related titles all touch the query (e.g. "software" appearing in both
   * the jobType and a bullet) outranks one that only matches once. */
  cumulativeWeight: number;
}

function scoreOccupation(
  occ: SocOccupation,
  inputTokenSet: Set<string>,
  normalizedInput: string,
  stats: SocCorpusStats,
): OccupationScore {
  let best: PhraseScore = { score: 0, matchedPhrase: null, isPhraseMatch: false, phraseWordCount: 0 };
  let cumulativeWeight = 0;
  const candidatePhrases = [occ.jobType, ...occ.relatedJobTitles];

  for (const phraseRaw of candidatePhrases) {
    const phraseWords = significantTokens(phraseRaw);
    if (phraseWords.length === 0) continue;

    if (containsPhrase(normalizedInput, phraseWords)) {
      const score = 1000 + phraseWords.length * 100;
      cumulativeWeight += score;
      if (score > best.score) {
        best = { score, matchedPhrase: phraseRaw, isPhraseMatch: true, phraseWordCount: phraseWords.length };
      }
      continue;
    }

    const matchedWords = phraseWords.filter((w) => inputTokenSet.has(w));
    if (matchedWords.length > 0) {
      const weight = matchedWords.reduce((sum, w) => sum + idfWeight(w, stats), 0);
      const allWordsPresent = matchedWords.length === phraseWords.length;
      const score = weight * 10 + (allWordsPresent ? 50 : 0);
      cumulativeWeight += score;
      if (score > best.score) {
        best = { score, matchedPhrase: phraseRaw, isPhraseMatch: false, phraseWordCount: phraseWords.length };
      }
    }
  }

  return { ...best, cumulativeWeight };
}

function rankOccupations(occupations: SocOccupation[], text: string, stats: SocCorpusStats): SocCandidate[] {
  const inputTokenSet = new Set(significantTokens(text));
  const normalizedInput = normalizeForSubstring(text);
  if (inputTokenSet.size === 0) return [];

  const scored = occupations
    .map((occ) => ({ occ, best: scoreOccupation(occ, inputTokenSet, normalizedInput, stats) }))
    .filter((s) => s.best.score > 0)
    .sort((a, b) => {
      if (b.best.score !== a.best.score) return b.best.score - a.best.score;
      if (b.best.cumulativeWeight !== a.best.cumulativeWeight) return b.best.cumulativeWeight - a.best.cumulativeWeight;
      return a.occ.code.localeCompare(b.occ.code); // final deterministic tie-break: lowest code first
    });

  return scored.map(({ occ, best }) => ({
    code: occ.code,
    jobType: occ.jobType,
    eligibility: occ.eligibility,
    score: best.score,
  }));
}

/**
 * Keyword-based SOC2020 match: job title is the primary signal, falling
 * back to the job description's tokens if the title alone produces no (or
 * only weak) matches. Deterministic tie-break on lowest SOC code; all tied
 * top-score candidates are returned as alternatives for the manual-override
 * dropdown.
 */
export function matchSoc(
  occupations: SocOccupation[],
  jobTitle: string,
  jobDescription?: string,
): SocMatchResult {
  const stats = buildCorpusStats(occupations);
  const titleCandidates = rankOccupations(occupations, jobTitle ?? "", stats);

  let candidates = titleCandidates;
  let usedFallback = false;
  const titleHasStrongSignal = titleCandidates.length > 0 && titleCandidates[0].score > 0;

  if (!titleHasStrongSignal && jobDescription && jobDescription.trim().length > 0) {
    const descriptionCandidates = rankOccupations(occupations, jobDescription, stats);
    if (descriptionCandidates.length > 0) {
      candidates = descriptionCandidates;
      usedFallback = true;
    }
  }

  if (candidates.length === 0) {
    return { confidence: "no-match", selected: null, alternatives: [] };
  }

  const topScore = candidates[0].score;
  const tied = candidates.filter((c) => c.score === topScore);
  const selected = tied[0];

  let confidence: SocConfidence;
  if (usedFallback) {
    confidence = topScore >= 1000 ? "medium" : "low"; // description fallback is inherently less certain than a title hit
  } else if (topScore >= 1200) {
    confidence = "high";
  } else if (topScore >= 1000) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    confidence,
    selected,
    alternatives: candidates.slice(0, 5),
  };
}

export function applyManualOverride(occupations: SocOccupation[], code: string): SocMatchResult {
  const occ = occupations.find((o) => o.code === code);
  if (!occ) return { confidence: "no-match", selected: null, alternatives: [] };
  const candidate: SocCandidate = { code: occ.code, jobType: occ.jobType, eligibility: occ.eligibility, score: 0 };
  return { confidence: "manual-override", selected: candidate, alternatives: [] };
}
