import type { NormalizedCandidate, SearchJobFilters } from '@auto-recruit/types';
import { VENDOR_NAMES } from '@auto-recruit/config';

const PDL_BASE_URL = 'https://api.peopledatalabs.com/v5';

interface PdlPersonRecord {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  job_title?: string;
  job_company_name?: string;
  job_company_website?: string;
  location_name?: string;
  inferred_years_experience?: number;
  skills?: string[];
  experience?: Array<{ company?: { name?: string }; title?: { name?: string }; start_date?: string; end_date?: string }>;
}

interface PdlSearchResponse {
  status: number;
  data: PdlPersonRecord[];
  total?: number;
  scroll_token?: string;
  error?: { type: string; message: string };
}

function buildPdlQuery(companyName: string, filters: SearchJobFilters): object {
  const must: object[] = [
    { term: { 'job_company_name': companyName.toLowerCase() } },
  ];

  // Title filters
  if (filters.titles && filters.titles.length > 0) {
    must.push({ terms: { job_title: filters.titles.map((t) => t.toLowerCase()) } });
  }

  // Keyword / skill filters
  if (filters.keywords && filters.keywords.length > 0) {
    must.push({ terms: { skills: filters.keywords.map((k) => k.toLowerCase()) } });
  }

  // Seniority
  if (filters.seniorities && filters.seniorities.length > 0) {
    must.push({ terms: { job_title_levels: filters.seniorities.map((s) => s.toLowerCase()) } });
  }

  // Location
  if (filters.locations && filters.locations.length > 0) {
    must.push({ terms: { location_region: filters.locations } });
  }

  const query: Record<string, unknown> = { bool: { must } };

  // Exclude keywords
  if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
    (query['bool'] as Record<string, unknown>)['must_not'] = [
      { terms: { skills: filters.excludeKeywords.map((k) => k.toLowerCase()) } },
    ];
  }

  return query;
}

function normalizePdlRecord(record: PdlPersonRecord): NormalizedCandidate {
  return {
    firstName: record.first_name,
    lastName: record.last_name,
    fullName: record.full_name,
    linkedinUrl: record.linkedin_url,
    currentTitle: record.job_title,
    companyName: record.job_company_name,
    companyDomain: record.job_company_website,
    location: record.location_name,
    yearsExperience: record.inferred_years_experience,
    keywords: record.skills ?? [],
    sourceVendor: VENDOR_NAMES.PDL,
    rawPayload: record as unknown as Record<string, unknown>,
  };
}

export async function searchPdlCandidates(
  apiKey: string,
  companyName: string,
  filters: SearchJobFilters,
  size = 100,
): Promise<NormalizedCandidate[]> {
  const query = buildPdlQuery(companyName, filters);

  const response = await fetch(`${PDL_BASE_URL}/person/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ query, size, pretty: false }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PDL search failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as PdlSearchResponse;

  if (data.status !== 200 && data.error) {
    throw new Error(`PDL error: ${data.error.message}`);
  }

  return (data.data ?? []).map(normalizePdlRecord);
}
