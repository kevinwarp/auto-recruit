import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { PUBSUB_TOPICS, SEARCH_LIMITS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { publishMessage } from '../services/pubsub.js';
import type { CandidateSearchMessage } from '@auto-recruit/types';

export const campaignsRouter = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  companyListId: z.string().uuid(),
  search: z.object({
    jobTitles: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    requiredKeywords: z.array(z.string()).default([]),
    excludedKeywords: z.array(z.string()).default([]),
    minScore: z.number().int().min(0).max(100).default(50),
    maxResults: z.number().int().min(1).max(1000).default(200),
  }),
  enrichment: z.object({
    enabled: z.boolean().default(true),
    minScore: z.number().int().min(0).max(100).default(60),
  }),
  outreach: z.object({
    enabled: z.boolean().default(true),
    templateId: z.string().uuid().nullable().optional(),
    senderAccountId: z.string().uuid().nullable().optional(),
    dailyLimit: z.number().int().min(1).max(500).default(50),
  }),
  schedule: z.object({
    startImmediately: z.boolean().default(true),
    scheduledAt: z.string().datetime().nullable().optional(),
  }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Launch the search stage for a campaign — creates a SearchJob + publishes messages. */
async function startCampaignSearch(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      companyList: { include: { companies: true } },
    },
  });
  if (!campaign) throw new AppError(404, 'Campaign not found');
  if (!campaign.companyList.companies.length)
    throw new AppError(400, 'Company list has no companies');

  // Create the underlying SearchJob
  const searchJob = await prisma.searchJob.create({
    data: {
      userId,
      companyListId: campaign.companyListId,
      name: campaign.name,
      status: 'running',
      startedAt: new Date(),
      titles: campaign.jobTitles,
      titleContains: [],
      departments: [],
      seniorities: [],
      locations: campaign.locations,
      keywords: campaign.requiredKeywords,
      excludeKeywords: campaign.excludedKeywords,
    },
  });

  // Publish one CANDIDATE_SEARCH message per company
  const companies = campaign.companyList.companies.slice(
    0,
    SEARCH_LIMITS.MAX_COMPANIES_PER_SEARCH,
  );
  await Promise.all(
    companies.map((company) =>
      publishMessage<CandidateSearchMessage>(PUBSUB_TOPICS.CANDIDATE_SEARCH, {
        searchJobId: searchJob.id,
        companyName: company.name,
        companyDomain: company.domain ?? undefined,
        filters: {
          titles: campaign.jobTitles,
          locations: campaign.locations,
          keywords: campaign.requiredKeywords,
          excludeKeywords: campaign.excludedKeywords,
        },
        vendor: 'people_data_labs',
      }),
    ),
  );

  // Advance campaign to searching state
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'running',
      searchJobId: searchJob.id,
      searchStatus: 'running',
      searchTotal: companies.length,
      searchStartedAt: new Date(),
    },
  });
}

/** Build aggregated stats for a campaign from its linked SearchJob + outreach data. */
async function buildCampaignStats(campaign: {
  searchJobId: string | null;
  id: string;
}) {
  if (!campaign.searchJobId) {
    return { candidatesFound: 0, candidatesEnriched: 0, emailsSent: 0, replies: 0, bounces: 0 };
  }

  const [searchJob, enrichedCount, sentCount, repliesCount, bouncesCount] =
    await Promise.all([
      prisma.searchJob.findUnique({
        where: { id: campaign.searchJobId },
        select: { candidatesFound: true },
      }),
      prisma.candidateEnrichment.count({
        where: {
          personalEmail: { not: null },
          candidate: {
            searchResults: { some: { searchJobId: campaign.searchJobId } },
          },
        },
      }),
      prisma.emailSend.count({
        where: { outreachThread: { searchJobId: campaign.searchJobId } },
      }),
      prisma.emailResponse.count({
        where: {
          isBounce: false,
          outreachThread: { searchJobId: campaign.searchJobId },
        },
      }),
      prisma.emailResponse.count({
        where: {
          isBounce: true,
          outreachThread: { searchJobId: campaign.searchJobId },
        },
      }),
    ]);

  return {
    candidatesFound: searchJob?.candidatesFound ?? 0,
    candidatesEnriched: enrichedCount,
    emailsSent: sentCount,
    replies: repliesCount,
    bounces: bouncesCount,
  };
}

// ── GET /api/campaigns ────────────────────────────────────────────────────────

campaignsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;

    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        companyList: { select: { name: true } },
        template: { select: { name: true } },
        senderAccount: { select: { email: true } },
      },
    });

    const data = await Promise.all(
      campaigns.map(async (c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        searchCriteria: {
          companyListName: c.companyList.name,
          jobTitles: c.jobTitles,
          locations: c.locations,
        },
        stats: await buildCampaignStats(c),
        templateName: c.template?.name ?? null,
        senderEmail: c.senderAccount?.email ?? null,
      })),
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/campaigns ───────────────────────────────────────────────────────

campaignsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const { name, companyListId, search, enrichment, outreach, schedule } = parsed.data;

    // Verify company list ownership
    const companyList = await prisma.companyList.findFirst({
      where: { id: companyListId, userId },
      include: { companies: true },
    });
    if (!companyList) throw new AppError(404, 'Company list not found');
    if (!companyList.companies.length)
      throw new AppError(400, 'Company list has no companies');

    // Validate template / sender if outreach enabled
    if (outreach.enabled) {
      if (outreach.templateId) {
        const tpl = await prisma.template.findFirst({
          where: { id: outreach.templateId, userId },
        });
        if (!tpl) throw new AppError(404, 'Template not found');
      }
      if (outreach.senderAccountId) {
        const sender = await prisma.senderAccount.findFirst({
          where: { id: outreach.senderAccountId, userId, isActive: true },
        });
        if (!sender) throw new AppError(404, 'Sender account not found');
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name,
        companyListId,
        templateId: outreach.enabled ? (outreach.templateId ?? null) : null,
        senderAccountId: outreach.enabled ? (outreach.senderAccountId ?? null) : null,
        jobTitles: search.jobTitles,
        locations: search.locations,
        requiredKeywords: search.requiredKeywords,
        excludedKeywords: search.excludedKeywords,
        minScore: search.minScore,
        maxResults: search.maxResults,
        autoEnrich: enrichment.enabled,
        enrichMinScore: enrichment.minScore,
        autoOutreach: outreach.enabled,
        dailyLimit: outreach.dailyLimit,
        scheduledAt: schedule.scheduledAt ? new Date(schedule.scheduledAt) : null,
        status: 'draft',
      },
    });

    // Start immediately if requested
    if (schedule.startImmediately) {
      await startCampaignSearch(campaign.id, userId);
    }

    res.status(201).json({ id: campaign.id });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/campaigns/:id ────────────────────────────────────────────────────

campaignsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;

    const c = await prisma.campaign.findFirst({
      where: { id: req.params['id'], userId },
      include: {
        companyList: { select: { name: true } },
        template: { select: { name: true } },
        senderAccount: { select: { email: true } },
      },
    });
    if (!c) throw new AppError(404, 'Campaign not found');

    const stats = await buildCampaignStats(c);

    const detail = {
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      searchCriteria: {
        companyListName: c.companyList.name,
        jobTitles: c.jobTitles,
        locations: c.locations,
        requiredKeywords: c.requiredKeywords,
        excludedKeywords: c.excludedKeywords,
        minScore: c.minScore,
        maxResults: c.maxResults,
      },
      enrichment: {
        enabled: c.autoEnrich,
        minScore: c.enrichMinScore,
      },
      outreach: {
        enabled: c.autoOutreach,
        templateName: c.template?.name ?? null,
        senderEmail: c.senderAccount?.email ?? null,
        dailyLimit: c.dailyLimit,
      },
      pipeline: {
        search: {
          status: c.searchStatus,
          progress: c.searchProgress,
          total: c.searchTotal,
          startedAt: c.searchStartedAt?.toISOString() ?? null,
          completedAt: c.searchCompletedAt?.toISOString() ?? null,
        },
        enrichment: {
          status: c.enrichmentStatus,
          progress: c.enrichmentProgress,
          total: c.enrichmentTotal,
          startedAt: c.enrichmentStartedAt?.toISOString() ?? null,
          completedAt: c.enrichmentCompletedAt?.toISOString() ?? null,
        },
        outreach: {
          status: c.outreachStatus,
          progress: c.outreachProgress,
          total: c.outreachTotal,
          startedAt: c.outreachStartedAt?.toISOString() ?? null,
          completedAt: c.outreachCompletedAt?.toISOString() ?? null,
        },
      },
      stats,
    };

    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/campaigns/:id ──────────────────────────────────────────────────

campaignsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const { status } = z.object({ status: z.string() }).parse(req.body);

    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params['id'], userId },
    });
    if (!campaign) throw new AppError(404, 'Campaign not found');

    const allowedTransitions: Record<string, string[]> = {
      draft: ['running'],
      running: ['paused'],
      paused: ['running'],
      completed: ['running'],
      failed: ['running'],
    };
    if (!allowedTransitions[campaign.status]?.includes(status)) {
      throw new AppError(400, `Cannot transition from '${campaign.status}' to '${status}'`);
    }

    // Starting from draft/completed/failed → kick off search again
    if (status === 'running' && campaign.status !== 'paused') {
      await startCampaignSearch(campaign.id, userId);
    } else {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status },
      });
    }

    res.json({ data: { id: campaign.id, status } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/campaigns/:id/candidates ────────────────────────────────────────

campaignsRouter.get('/:id/candidates', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;

    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params['id'], userId },
    });
    if (!campaign) throw new AppError(404, 'Campaign not found');
    if (!campaign.searchJobId) {
      return res.json({ data: [], total: 0 });
    }

    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const pageSize = Math.min(
      SEARCH_LIMITS.MAX_PAGE_SIZE,
      parseInt(req.query['pageSize'] as string) || 50,
    );
    const skip = (page - 1) * pageSize;

    const [results, total] = await prisma.$transaction([
      prisma.candidateSearchResult.findMany({
        where: { searchJobId: campaign.searchJobId },
        include: {
          candidate: {
            include: {
              directoryEntry: {
                select: {
                  personalEmail: true,
                  latestOutreachStatus: true,
                  latestSentAt: true,
                },
              },
              enrichments: {
                orderBy: { enrichedAt: 'desc' },
                take: 1,
                select: { enrichedAt: true, personalEmail: true },
              },
            },
          },
        },
        orderBy: { candidate: { score: 'desc' } },
        skip,
        take: pageSize,
      }),
      prisma.candidateSearchResult.count({
        where: { searchJobId: campaign.searchJobId },
      }),
    ]);

    const data = results.map((r) => ({
      id: r.id,
      candidateId: r.candidateId,
      fullName: r.candidate.fullName,
      currentTitle: r.candidate.currentTitle,
      currentCompany: r.candidate.companyName,
      email:
        r.candidate.directoryEntry?.personalEmail ??
        r.candidate.enrichments[0]?.personalEmail ??
        null,
      linkedinUrl: r.candidate.linkedinUrl,
      location: r.candidate.location,
      score: r.candidate.score ?? 0,
      outreachStatus:
        r.candidate.directoryEntry?.latestOutreachStatus ?? 'not_contacted',
      enrichedAt:
        r.candidate.enrichments[0]?.enrichedAt?.toISOString() ?? null,
      sentAt:
        r.candidate.directoryEntry?.latestSentAt?.toISOString() ?? null,
    }));

    res.json({ data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});
