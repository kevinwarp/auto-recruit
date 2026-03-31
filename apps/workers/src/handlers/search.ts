import { prisma } from '@auto-recruit/db';
import { loadEnv, VENDOR_NAMES } from '@auto-recruit/config';
import type { CandidateSearchMessage, NormalizedCandidate, SearchJobFilters } from '@auto-recruit/types';
import { scoreCandidate } from '../services/scoring.js';
import { searchApolloAllPages } from '../vendors/apollo.js';
import { searchPdlCandidates } from '../vendors/pdl.js';
import { bulkEnrichViaFullEnrich } from '../vendors/fullenrich.js';

export async function handleCandidateSearch(data: unknown): Promise<void> {
  const msg = data as CandidateSearchMessage;
  const { searchJobId, companyName, companyDomain, filters, vendor } = msg;

  console.log(`[search] processing ${companyName} for job ${searchJobId}`);

  const env = loadEnv();

  try {
    // ── Step 1: Apollo — primary source, LinkedIn URLs ────────────────────────
    let apolloCandidates: NormalizedCandidate[] = [];
    if (env.APOLLO_API_KEY) {
      try {
        apolloCandidates = await searchApolloAllPages(env.APOLLO_API_KEY, companyName, filters);
        console.log(`[search] Apollo returned ${apolloCandidates.length} candidates for ${companyName}`);

        await logVendorUsage({
          vendorName: VENDOR_NAMES.APOLLO,
          operation: 'search',
          responseCode: 200,
          recordsReturned: apolloCandidates.length,
          searchJobId,
        });
      } catch (err) {
        console.error(`[search] Apollo failed for ${companyName}:`, err);
      }
    }

    // ── Step 2: PDL — backfill candidates Apollo may have missed ──────────────
    let pdlCandidates: NormalizedCandidate[] = [];
    if (env.PDL_API_KEY && (vendor === VENDOR_NAMES.PDL || !env.APOLLO_API_KEY)) {
      try {
        pdlCandidates = await searchPdlCandidates(env.PDL_API_KEY, companyName, filters);
        console.log(`[search] PDL returned ${pdlCandidates.length} candidates for ${companyName}`);

        await logVendorUsage({
          vendorName: VENDOR_NAMES.PDL,
          operation: 'search',
          responseCode: 200,
          recordsReturned: pdlCandidates.length,
          searchJobId,
        });
      } catch (err) {
        console.error(`[search] PDL failed for ${companyName}:`, err);
      }
    }

    // ── Step 3: Merge by LinkedIn URL — Apollo record wins on conflict ─────────
    const merged = mergeCandidates(apolloCandidates, pdlCandidates);
    console.log(`[search] merged ${merged.length} unique candidates for ${companyName}`);

    if (merged.length === 0) return;

    // ── Step 4: FullEnrich — bulk email backfill for candidates without email ──
    if (env.FULL_ENRICH_API_KEY) {
      const missing = merged.filter((c) => !c.email);
      if (missing.length > 0) {
        try {
          const CHUNK = 50; // FullEnrich bulk max
          for (let i = 0; i < missing.length; i += CHUNK) {
            const chunk = missing.slice(i, i + CHUNK);
            const results = await bulkEnrichViaFullEnrich(
              env.FULL_ENRICH_API_KEY,
              chunk.map((c) => ({
                id: c.linkedinUrl ?? `idx-${i}`,
                linkedinUrl: c.linkedinUrl ?? undefined,
                firstName: c.firstName ?? undefined,
                lastName: c.lastName ?? undefined,
                companyDomain: c.companyDomain ?? companyDomain ?? undefined,
              })),
            );
            for (const r of results) {
              const candidate = chunk.find(
                (c) => (c.linkedinUrl ?? `idx-${i}`) === r.id,
              );
              if (candidate && r.result.personalEmail) {
                candidate.email = r.result.personalEmail;
              }
            }
          }
          const filled = merged.filter((c) => c.email).length;
          console.log(`[search] FullEnrich backfilled ${filled - (merged.length - missing.length)} emails for ${companyName}`);
          await logVendorUsage({
            vendorName: VENDOR_NAMES.FULL_ENRICH,
            operation: 'email_backfill',
            responseCode: 200,
            recordsReturned: missing.filter((c) => c.email).length,
            searchJobId,
          });
        } catch (err) {
          console.error(`[search] FullEnrich backfill failed for ${companyName}:`, err);
        }
      }
    }

    // ── Step 5: Filter excluded keywords ──────────────────────────────────────
    const excludeSet = new Set((filters.excludeKeywords ?? []).map((k) => k.toLowerCase()));
    const filtered = merged.filter((c) => {
      if (excludeSet.size === 0) return true;
      const candidateKeywords = (c.keywords ?? []).map((k) => k.toLowerCase());
      return !candidateKeywords.some((k) => excludeSet.has(k));
    });

    // ── Step 6: Score and persist ──────────────────────────────────────────────
    let savedCount = 0;
    for (const candidate of filtered) {
      const score = scoreCandidate(candidate, filters);

      // Upsert by linkedin_url (primary deduplification key)
      const upserted = await prisma.candidate.upsert({
        where: { linkedinUrl: candidate.linkedinUrl ?? `unknown-${Date.now()}-${Math.random()}` },
        create: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: candidate.currentTitle,
          companyName: candidate.companyName ?? companyName,
          companyDomain: candidate.companyDomain ?? companyDomain,
          location: candidate.location,
          yearsExperience: candidate.yearsExperience,
          keywords: candidate.keywords ?? [],
          sourceVendor: candidate.sourceVendor,
          score: score.total,
        },
        update: {
          // Enrich existing record with any new data from this search
          currentTitle: candidate.currentTitle ?? undefined,
          location: candidate.location ?? undefined,
          yearsExperience: candidate.yearsExperience ?? undefined,
          keywords: candidate.keywords?.length ? candidate.keywords : undefined,
          score: score.total,
          updatedAt: new Date(),
        },
      });

      // Link to the search job (idempotent)
      await prisma.candidateSearchResult.upsert({
        where: { candidateId_searchJobId: { candidateId: upserted.id, searchJobId } },
        create: {
          candidateId: upserted.id,
          searchJobId,
          selected: true,
          rawPayload: candidate.rawPayload as object ?? {},
        },
        update: {},
      });

      savedCount++;
    }

    // ── Step 7: Update search job stats ───────────────────────────────────────
    await prisma.searchJob.update({
      where: { id: searchJobId },
      data: {
        candidatesFound: { increment: savedCount },
      },
    });

    console.log(`[search] saved ${savedCount} candidates for ${companyName} (job ${searchJobId})`);
  } catch (err) {
    console.error(`[search] fatal error for ${companyName}:`, err);
    await prisma.searchJob.update({
      where: { id: searchJobId },
      data: { status: 'failed', errorMessage: String(err) },
    }).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Merges Apollo and PDL results. Apollo record wins when both have the same
 * LinkedIn URL (Apollo is the authoritative source for profile identity).
 * PDL candidates with no LinkedIn URL are included as-is.
 */
function mergeCandidates(
  apollo: NormalizedCandidate[],
  pdl: NormalizedCandidate[],
): NormalizedCandidate[] {
  const byLinkedIn = new Map<string, NormalizedCandidate>();

  // Apollo first — these are the preferred records
  for (const c of apollo) {
    const key = normalizeLinkedInUrl(c.linkedinUrl);
    if (key) byLinkedIn.set(key, c);
  }

  // PDL backfill — only add if not already present from Apollo
  for (const c of pdl) {
    const key = normalizeLinkedInUrl(c.linkedinUrl);
    if (key && byLinkedIn.has(key)) {
      // Merge PDL skills/keywords into the Apollo record (Apollo may lack skills)
      const existing = byLinkedIn.get(key)!;
      const merged: NormalizedCandidate = {
        ...existing,
        keywords: mergeKeywords(existing.keywords, c.keywords),
        yearsExperience: existing.yearsExperience ?? c.yearsExperience,
      };
      byLinkedIn.set(key, merged);
    } else {
      // PDL-only candidate — include as-is
      byLinkedIn.set(key ?? `pdl-${Math.random()}`, c);
    }
  }

  return Array.from(byLinkedIn.values());
}

function normalizeLinkedInUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.toLowerCase().replace(/\/$/, '').replace(/^https?:\/\//, '');
}

function mergeKeywords(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] {
  const combined = [...(a ?? []), ...(b ?? [])];
  return [...new Set(combined.map((k) => k.toLowerCase()))];
}

async function logVendorUsage(params: {
  vendorName: string;
  operation: string;
  responseCode: number;
  recordsReturned: number;
  searchJobId: string;
}): Promise<void> {
  await prisma.vendorUsageLog.create({
    data: {
      vendorName: params.vendorName,
      operation: params.operation,
      responseCode: params.responseCode,
      recordsReturned: params.recordsReturned,
      searchJobId: params.searchJobId,
      occurredAt: new Date(),
    },
  });
}

