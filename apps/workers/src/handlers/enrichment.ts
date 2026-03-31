import { prisma } from '@auto-recruit/db';
import { loadEnv, VENDOR_NAMES, PUBSUB_TOPICS } from '@auto-recruit/config';
import type { CandidateEnrichmentMessage, CandidateDirectoryRefreshMessage } from '@auto-recruit/types';
import { PubSub } from '@google-cloud/pubsub';
import { enrichViaFullEnrich } from '../vendors/fullenrich.js';

const pubsub = new PubSub({ projectId: loadEnv().GCP_PROJECT_ID });

export async function handleCandidateEnrichment(data: unknown): Promise<void> {
  const msg = data as CandidateEnrichmentMessage;
  const { candidateId, linkedinUrl, firstName, lastName, companyName, companyDomain } = msg;

  console.log(`[enrichment] enriching candidate ${candidateId}`);

  const env = loadEnv();

  // Try ContactOut first (LinkedIn URL → personal email), fall back to PDL
  let personalEmail: string | null = null;
  let verificationStatus: string | null = null;
  let vendorName: string | null = null;
  let confidenceScore: number | null = null;
  let rawPayload: object | null = null;

  // ── ContactOut (Phase 2 — stub for now) ────────────────────────────────────
  if (env.CONTACTOUT_API_KEY && linkedinUrl) {
    try {
      const result = await enrichViaContactOut(env.CONTACTOUT_API_KEY, linkedinUrl);
      if (result.email) {
        personalEmail = result.email;
        verificationStatus = result.verified ? 'verified' : 'unverified';
        vendorName = VENDOR_NAMES.CONTACTOUT;
        confidenceScore = result.confidence ?? null;
        rawPayload = result.raw;
      }
    } catch (err) {
      console.warn(`[enrichment] ContactOut failed for ${candidateId}:`, err);
    }
  }

  // ── FullEnrich — step 2 ─────────────────────────────────────────────────────
  if (!personalEmail && env.FULL_ENRICH_API_KEY) {
    try {
      const result = await enrichViaFullEnrich(env.FULL_ENRICH_API_KEY, {
        linkedinUrl: linkedinUrl ?? undefined,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        companyDomain: companyDomain ?? undefined,
        companyName: companyName ?? undefined,
      });
      if (result.personalEmail) {
        personalEmail = result.personalEmail;
        verificationStatus = result.verified ? 'verified' : 'unverified';
        vendorName = VENDOR_NAMES.FULL_ENRICH;
        confidenceScore = result.confidence ?? null;
        rawPayload = result.raw;
      }
    } catch (err) {
      console.warn(`[enrichment] FullEnrich failed for ${candidateId}:`, err);
    }
  }

  // ── PDL enrichment fallback ─────────────────────────────────────────────────
  if (!personalEmail && env.PDL_API_KEY) {
    try {
      const result = await enrichViaPdl(env.PDL_API_KEY, {
        linkedinUrl,
        firstName,
        lastName,
        company: companyName,
        domain: companyDomain,
      });
      if (result.email) {
        personalEmail = result.email;
        verificationStatus = result.verified ? 'verified' : 'unverified';
        vendorName = VENDOR_NAMES.PDL;
        confidenceScore = result.confidence ?? null;
        rawPayload = result.raw;
      }
    } catch (err) {
      console.warn(`[enrichment] PDL enrichment failed for ${candidateId}:`, err);
    }
  }

  // Persist enrichment result (even if no email found — captures the attempt)
  await prisma.candidateEnrichment.create({
    data: {
      candidateId,
      personalEmail,
      verificationStatus,
      vendorName,
      confidenceScore,
      rawPayload: rawPayload ?? {},
      enrichedAt: new Date(),
    },
  });

  await prisma.vendorUsageLog.create({
    data: {
      vendorName: vendorName ?? 'none',
      operation: 'enrichment',
      responseCode: personalEmail ? 200 : 404,
      recordsReturned: personalEmail ? 1 : 0,
      candidateId,
      occurredAt: new Date(),
    },
  });

  // Trigger directory refresh
  await pubsub.topic(PUBSUB_TOPICS.CANDIDATE_DIRECTORY_REFRESH).publishMessage({
    data: Buffer.from(
      JSON.stringify({
        candidateId,
        trigger: 'enrichment',
      } satisfies CandidateDirectoryRefreshMessage),
    ),
  });

  console.log(`[enrichment] done for ${candidateId}: ${personalEmail ? 'found email' : 'no email'}`);
}

// ── Vendor stubs (Phase 2 implements full integration) ────────────────────────

async function enrichViaContactOut(
  _apiKey: string,
  _linkedinUrl: string,
): Promise<{ email?: string; verified?: boolean; confidence?: number; raw: object }> {
  // Phase 2: POST https://api.contactout.com/v1/people/find
  throw new Error('ContactOut not yet implemented');
}

async function enrichViaPdl(
  apiKey: string,
  params: {
    linkedinUrl?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    domain?: string;
  },
): Promise<{ email?: string; verified?: boolean; confidence?: number; raw: object }> {
  const body: Record<string, string> = {};
  if (params.linkedinUrl) body['linkedin_url'] = params.linkedinUrl;
  if (params.firstName) body['first_name'] = params.firstName;
  if (params.lastName) body['last_name'] = params.lastName;
  if (params.company) body['company'] = params.company;
  if (params.domain) body['company_domain'] = params.domain;

  const response = await fetch('https://api.peopledatalabs.com/v5/person/enrich', {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey },
  });

  if (!response.ok) return { raw: {} };

  const data = await response.json() as Record<string, unknown>;
  const emails = (data['emails'] as Array<{ address?: string; type?: string }> | undefined) ?? [];
  const personal = emails.find((e) => e.type === 'personal' || e.type === 'professional');

  return {
    email: personal?.address,
    verified: personal?.type === 'personal',
    confidence: typeof data['likelihood'] === 'number' ? data['likelihood'] / 10 : undefined,
    raw: data,
  };
}
