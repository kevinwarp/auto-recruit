import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { PUBSUB_TOPICS, SEARCH_LIMITS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { publishMessage } from '../services/pubsub.js';
import { streamCsvResponse } from '../services/csv.js';
import type { CandidateEnrichmentMessage } from '@auto-recruit/types';

export const enrichmentRouter = Router();

const enrichSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(500),
});

// POST /api/candidates/enrich
enrichmentRouter.post('/enrich', requireAuth, async (req, res, next) => {
  try {
    const parsed = enrichSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const { candidateIds } = parsed.data;

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
      select: {
        id: true,
        linkedinUrl: true,
        firstName: true,
        lastName: true,
        companyName: true,
        companyDomain: true,
      },
    });

    await Promise.all(
      candidates.map((c) =>
        publishMessage<CandidateEnrichmentMessage>(PUBSUB_TOPICS.CANDIDATE_ENRICHMENT, {
          candidateId: c.id,
          linkedinUrl: c.linkedinUrl ?? undefined,
          firstName: c.firstName ?? undefined,
          lastName: c.lastName ?? undefined,
          companyName: c.companyName ?? undefined,
          companyDomain: c.companyDomain ?? undefined,
        }),
      ),
    );

    res.json({ data: { queued: candidates.length } });
  } catch (err) {
    next(err);
  }
});

// GET /api/enriched/search-jobs/:searchJobId
enrichmentRouter.get('/search-jobs/:searchJobId', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const job = await prisma.searchJob.findFirst({
      where: { id: req.params['searchJobId'], userId },
    });
    if (!job) throw new AppError(404, 'Search job not found');

    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const pageSize = Math.min(
      SEARCH_LIMITS.MAX_PAGE_SIZE,
      parseInt(req.query['pageSize'] as string) || SEARCH_LIMITS.DEFAULT_PAGE_SIZE,
    );

    const [entries, total] = await prisma.$transaction([
      prisma.candidateDirectory.findMany({
        where: { sourceSearchJobId: job.id, personalEmail: { not: null } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.candidateDirectory.count({
        where: { sourceSearchJobId: job.id, personalEmail: { not: null } },
      }),
    ]);

    res.json({ data: entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/enriched/search-jobs/:searchJobId/export
enrichmentRouter.get('/search-jobs/:searchJobId/export', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const job = await prisma.searchJob.findFirst({
      where: { id: req.params['searchJobId'], userId },
    });
    if (!job) throw new AppError(404, 'Search job not found');

    const selectedIds = req.query['selectedIds']
      ? (req.query['selectedIds'] as string).split(',')
      : undefined;

    const where = {
      sourceSearchJobId: job.id,
      personalEmail: { not: null },
      ...(selectedIds?.length ? { candidateId: { in: selectedIds } } : {}),
    };

    const entries = await prisma.candidateDirectory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const rows = entries.map((e) => ({
      full_name: e.fullName ?? '',
      current_title: e.currentTitle ?? '',
      company: e.companyName ?? '',
      personal_email: e.personalEmail ?? '',
      verification_status: e.verificationStatus ?? '',
      enrichment_vendor: e.enrichmentVendor ?? '',
      confidence_score: e.enrichmentConfidenceScore?.toString() ?? '',
      linkedin_url: e.linkedinUrl ?? '',
      outreach_status: e.latestOutreachStatus,
      latest_sent_at: e.latestSentAt?.toISOString() ?? '',
      candidate_id: e.candidateId,
      search_job_id: job.id,
      enrichment_timestamp: e.createdAt.toISOString(),
    }));

    await streamCsvResponse(res, rows, `enriched-${job.id}.csv`);
  } catch (err) {
    next(err);
  }
});
