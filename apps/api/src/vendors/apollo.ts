import type { NormalizedCandidate, SearchJobFilters } from '@auto-recruit/types';
import { VENDOR_NAMES } from '@auto-recruit/config';

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Apollo response types ────────────────────────────────────────────────────

interface ApolloOrganization {
  name?: string;
  website_url?: string;
  primary_domain?: string;
}

interface ApolloEmployment {
  organization_name?: string;
  title?: string;
  start_date?: string;
  end_date?: string | null;
  current?: boolean;
}

interface ApolloPerson {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  title?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: ApolloOrganization;
  employment_history?: ApolloEmployment[];
  departments?: string[];
  seniority?: string;
  keywords?: string[];
}

interface ApolloSearchResponse {
  people?: ApolloPerson[];
  pagination?: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferYearsExperience(person: ApolloPerson): number | undefined {
  const history = person.employment_history ?? [];
  if (history.length === 0) return undefined;

  const earliest = history
    .map((e) => (e.start_date ? new Date(e.start_date).getFullYear() : null))
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b)[0];

  if (earliest == null) return undefined;
  return new Date().getFullYear() - earliest;
}

function buildLocation(person: ApolloPerson): string | undefined {
  const parts = [person.city, person.state, person.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function normalizePerson(person: ApolloPerson): NormalizedCandidate {
  return {
    firstName: person.first_name,
    lastName: person.last_name,
    fullName: person.name,
    linkedinUrl: person.linkedin_url
      ? person.linkedin_url.replace(/\/$/, '') // strip trailing slash for clean dedup
      : undefined,
    currentTitle: person.title,
    companyName: person.organization?.name,
    companyDomain: person.organization?.primary_domain ?? person.organization?.website_url,
    location: buildLocation(person),
    yearsExperience: inferYearsExperience(person),
    keywords: person.keywords ?? [],
    sourceVendor: VENDOR_NAMES.APOLLO,
    rawPayload: person as unknown as Record<string, unknown>,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function searchApolloCandidates(
  apiKey: string,
  companyName: string,
  filters: SearchJobFilters,
  perPage = 100,
  page = 1,
): Promise<{ candidates: NormalizedCandidate[]; totalPages: number }> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    page,
    per_page: perPage,
    organization_names: [companyName],
  };

  // Title filters
  if (filters.titles && filters.titles.length > 0) {
    body['titles'] = filters.titles;
  }

  // Keyword filters mapped to Apollo's person_keyword param
  if (filters.keywords && filters.keywords.length > 0) {
    body['person_keywords'] = filters.keywords;
  }

  // Seniority
  if (filters.seniorities && filters.seniorities.length > 0) {
    body['seniorities'] = filters.seniorities.map((s) => s.toLowerCase());
  }

  // Location
  if (filters.locations && filters.locations.length > 0) {
    body['person_locations'] = filters.locations;
  }

  // Department
  if (filters.departments && filters.departments.length > 0) {
    body['departments'] = filters.departments;
  }

  // Experience range (Apollo uses num_years_experience_ranges)
  if (filters.minExperience != null || filters.maxExperience != null) {
    const min = filters.minExperience ?? 0;
    const max = filters.maxExperience ?? 40;
    body['num_years_experience_ranges'] = [`${min},${max}`];
  }

  const response = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apollo search failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ApolloSearchResponse;

  if (data.error) {
    throw new Error(`Apollo error: ${data.error}`);
  }

  const candidates = (data.people ?? []).map(normalizePerson);
  const totalPages = data.pagination?.total_pages ?? 1;

  return { candidates, totalPages };
}

/**
 * Fetches all pages for a given company (up to maxPages to control cost).
 */
export async function searchApolloAllPages(
  apiKey: string,
  companyName: string,
  filters: SearchJobFilters,
  maxPages = 5,
): Promise<NormalizedCandidate[]> {
  const all: NormalizedCandidate[] = [];

  const first = await searchApolloCandidates(apiKey, companyName, filters, 100, 1);
  all.push(...first.candidates);

  const pages = Math.min(first.totalPages, maxPages);
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        searchApolloCandidates(apiKey, companyName, filters, 100, i + 2),
      ),
    );
    for (const r of rest) all.push(...r.candidates);
  }

  return all;
}
