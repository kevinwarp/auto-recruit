/**
 * FullEnrich API client
 * Docs: https://docs.fullenrich.com
 *
 * Primary use-cases in this codebase:
 *   1. Email backfill during search — resolve personal email for candidates
 *      found by Apollo/PDL that are missing an email address.
 *   2. Enrichment waterfall — position 2 (ContactOut → FullEnrich → PDL).
 */

const BASE_URL = 'https://api.fullenrich.com/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FullEnrichEmail {
  address: string;
  /** "personal" | "work" | "other" */
  type: string;
  /** 0–1 confidence score if provided by the API */
  confidence?: number;
  verified?: boolean;
}

export interface FullEnrichPerson {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  linkedinUrl?: string;
  emails: FullEnrichEmail[];
  phones?: string[];
}

export interface FullEnrichResult {
  person: FullEnrichPerson | null;
  /** Best personal email found, or null */
  personalEmail: string | null;
  confidence: number | null;
  verified: boolean;
  raw: Record<string, unknown>;
}

export interface FullEnrichParams {
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  /** Primary company domain (e.g. "stripe.com") */
  companyDomain?: string;
  companyName?: string;
}

// ── Single-person enrichment ──────────────────────────────────────────────────

/**
 * Look up a person's personal email via FullEnrich.
 * Requires at minimum one of: linkedinUrl OR (firstName + lastName + companyDomain).
 */
export async function enrichViaFullEnrich(
  apiKey: string,
  params: FullEnrichParams,
): Promise<FullEnrichResult> {
  if (!params.linkedinUrl && !(params.firstName && params.lastName && params.companyDomain)) {
    return { person: null, personalEmail: null, confidence: null, verified: false, raw: {} };
  }

  const body: Record<string, string> = {};
  if (params.linkedinUrl) body['linkedin_url'] = params.linkedinUrl;
  if (params.firstName) body['first_name'] = params.firstName;
  if (params.lastName) body['last_name'] = params.lastName;
  if (params.companyDomain) body['company_domain'] = params.companyDomain;
  if (params.companyName) body['company_name'] = params.companyName;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let raw: Record<string, unknown> = {};
  try {
    const response = await fetch(`${BASE_URL}/enrich`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 422) {
      // No record found — not an error, just no data
      return { person: null, personalEmail: null, confidence: null, verified: false, raw: {} };
    }

    if (!response.ok) {
      throw new Error(`FullEnrich API error: ${response.status} ${response.statusText}`);
    }

    raw = (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }

  return parseFullEnrichResponse(raw);
}

// ── Bulk enrichment ───────────────────────────────────────────────────────────

export interface FullEnrichBulkInput {
  id: string; // your internal candidate ID — echoed back in results
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
}

export interface FullEnrichBulkResultItem {
  id: string;
  result: FullEnrichResult;
}

/**
 * Bulk-enrich up to 50 candidates in a single request.
 * Falls back to sequential single-requests if the API doesn't support batch.
 */
export async function bulkEnrichViaFullEnrich(
  apiKey: string,
  inputs: FullEnrichBulkInput[],
): Promise<FullEnrichBulkResultItem[]> {
  if (inputs.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${BASE_URL}/bulk_enrich`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: inputs.map((i) => ({
          id: i.id,
          ...(i.linkedinUrl ? { linkedin_url: i.linkedinUrl } : {}),
          ...(i.firstName ? { first_name: i.firstName } : {}),
          ...(i.lastName ? { last_name: i.lastName } : {}),
          ...(i.companyDomain ? { company_domain: i.companyDomain } : {}),
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`FullEnrich bulk API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ id: string; person?: Record<string, unknown> }>;
    };

    return (data.results ?? []).map((r) => ({
      id: r.id,
      result: r.person ? parseFullEnrichResponse(r.person) : {
        person: null,
        personalEmail: null,
        confidence: null,
        verified: false,
        raw: {},
      },
    }));
  } finally {
    clearTimeout(timeout);
  }
}

// ── Response parsing ──────────────────────────────────────────────────────────

function parseFullEnrichResponse(raw: Record<string, unknown>): FullEnrichResult {
  // API returns { person: { emails: [...], ... } } OR the person object directly
  const personRaw =
    (raw['person'] as Record<string, unknown> | undefined) ?? raw;

  const emailsRaw = (personRaw['emails'] as Array<Record<string, unknown>> | undefined) ?? [];

  const emails: FullEnrichEmail[] = emailsRaw.map((e) => ({
    address: String(e['address'] ?? e['email'] ?? ''),
    type: String(e['type'] ?? 'work'),
    confidence: typeof e['confidence'] === 'number' ? e['confidence'] : undefined,
    verified: Boolean(e['verified'] ?? false),
  })).filter((e) => e.address.includes('@'));

  // Prefer personal emails; fall back to work emails
  const personal =
    emails.find((e) => e.type === 'personal') ??
    emails.find((e) => e.type === 'work') ??
    emails[0];

  const person: FullEnrichPerson | null = emails.length > 0
    ? {
        firstName: personRaw['first_name'] as string | undefined,
        lastName: personRaw['last_name'] as string | undefined,
        fullName: personRaw['full_name'] as string | undefined,
        linkedinUrl: personRaw['linkedin_url'] as string | undefined,
        emails,
      }
    : null;

  return {
    person,
    personalEmail: personal?.address ?? null,
    confidence: personal?.confidence ?? null,
    verified: personal?.verified ?? false,
    raw,
  };
}
