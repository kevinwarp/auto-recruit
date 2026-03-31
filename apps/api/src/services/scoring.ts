import { CANDIDATE_SCORING } from '@auto-recruit/config';
import type { SearchJobFilters, CandidateScore } from '@auto-recruit/types';

interface ScoringInput {
  currentTitle?: string | null;
  companyName?: string | null;
  location?: string | null;
  yearsExperience?: number | null;
  keywords?: string[] | null;
  linkedinUrl?: string | null;
  vendorConfidence?: number | null; // 0–1 from vendor
}

export function scoreCandidate(input: ScoringInput, filters: SearchJobFilters): CandidateScore {
  let titleMatch = 0;
  let keywordMatch = 0;
  let experienceMatch = 0;
  let locationMatch = 0;
  let linkedinPresence = 0;
  let vendorConfidence = 0;

  const title = (input.currentTitle ?? '').toLowerCase();
  const candidateKeywords = (input.keywords ?? []).map((k) => k.toLowerCase());

  // Title match
  const targetTitles = (filters.titles ?? []).map((t) => t.toLowerCase());
  if (targetTitles.some((t) => title === t)) {
    titleMatch = CANDIDATE_SCORING.EXACT_TITLE_MATCH;
  } else if (
    targetTitles.some((t) => title.includes(t) || t.includes(title)) ||
    (filters.titleContains ?? []).some((t) => title.includes(t.toLowerCase()))
  ) {
    titleMatch = Math.floor(CANDIDATE_SCORING.EXACT_TITLE_MATCH * 0.6); // partial
  }

  // Keyword match — award points proportionally to matched keywords
  const targetKeywords = (filters.keywords ?? []).map((k) => k.toLowerCase());
  if (targetKeywords.length > 0) {
    const matched = targetKeywords.filter(
      (k) => candidateKeywords.includes(k) || title.includes(k),
    ).length;
    keywordMatch = Math.round((matched / targetKeywords.length) * CANDIDATE_SCORING.KEYWORD_MATCH);
  }

  // Experience match
  const exp = input.yearsExperience ?? 0;
  const min = filters.minExperience ?? 0;
  const max = filters.maxExperience ?? 100;
  if (exp >= min && exp <= max) {
    experienceMatch = CANDIDATE_SCORING.EXPERIENCE_MATCH;
  } else if (exp >= min - 1 && exp <= max + 2) {
    experienceMatch = Math.floor(CANDIDATE_SCORING.EXPERIENCE_MATCH * 0.5);
  }

  // Location match
  const candidateLocation = (input.location ?? '').toLowerCase();
  const targetLocations = (filters.locations ?? []).map((l) => l.toLowerCase());
  if (
    targetLocations.length === 0 ||
    targetLocations.some((l) => candidateLocation.includes(l) || l.includes(candidateLocation))
  ) {
    locationMatch = CANDIDATE_SCORING.LOCATION_MATCH;
  }

  // LinkedIn presence
  if (input.linkedinUrl) {
    linkedinPresence = CANDIDATE_SCORING.LINKEDIN_PRESENCE;
  }

  // Vendor confidence (0–1 normalized to 5 pts)
  if (input.vendorConfidence != null) {
    vendorConfidence = Math.round(input.vendorConfidence * CANDIDATE_SCORING.VENDOR_CONFIDENCE);
  }

  const total =
    titleMatch + keywordMatch + experienceMatch + locationMatch + linkedinPresence + vendorConfidence;

  return { total, titleMatch, keywordMatch, experienceMatch, locationMatch, linkedinPresence, vendorConfidence };
}
