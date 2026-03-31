import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { PUBSUB_TOPICS, SEARCH_LIMITS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { publishMessage } from '../services/pubsub.js';
import { streamCsvResponse } from '../services/csv.js';
import type { CandidateSearchMessage } from '@auto-recruit/types';

export const searchJobsRouter = Router();

const createSearchJobSchema = z.object({
  companyListId: z.string().uuid(),
  name: z.string().max(200).optional(),
  vendor: z.string().default('people_data_labs'),
  filters: z.object({
    titles: z.array(z.string()).default([]),
    titleContains: z.array(z.string()).default([]),
    departments: z.array(z.string()).default([]),
    seniorities: z.array(z.string()).default([]),
    minExperience: z.number().int().min(0).optional(),
    maxExperience: z.number().int().min(0).optional(),
    locations: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    excludeKeywords: z.array(z.string()).default([]),
  }),
});

// POST /api/search-jobs
searchJobsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = createSearchJobSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body', 'VALIDATION_ERROR');

    const { companyListId, name, vendor, filters } = parsed.data;

    // Verify the company list belongs to user
    const companyList = await prisma.companyList.findFirst({
      where: { id: companyListId, userId },
      include: { companies: true },
    });
    if (!companyList) throw new AppError(404, 'Company list not found');
    if (companyList.companies.length === 0)
      throw new AppError(400, 'Company list has no companies');

    // Create the search job
    const job = await prisma.searchJob.create({
      data: {
        userId,
        companyListId,
        name: name ?? `Search ${new Date().toLocaleDateString()}`,
        vendor,
        status: 'pending',
        titles: filters.titles,
        titleContains: filters.titleContains,
        departments: filters.departments,
        seniorities: filters.seniorities,
        minExperience: filters.minExperience,
        maxExperience: filters.maxExperience,
        locations: filters.locations,
        keywords: filters.keywords,
        excludeKeywords: filters.excludeKeywords,
      },
    });

    // Publish one message per company (workers process in parallel)
    const companies = companyList.companies.slice(0, SEARCH_LIMITS.MAX_COMPANIES_PER_SEARCH);
    await Promise.all(
      companies.map((company) =>
        publishMessage<CandidateSearchMessage>(PUBSUB_TOPICS.CANDIDATE_SEARCH, {
          searchJobId: job.id,
          companyName: company.name,
          companyDomain: company.domain ?? undefined,
          filters,
          vendor,
        }),
      ),
    );

    // Update status to running
    await prisma.searchJob.update({
      where: { id: job.id },
      data: { status: 'running', startedAt: new Date() },
    });

    res.status(201).json({ data: job });
  } catch (err) {
    next(err);
  }
});

// GET /api/search-jobs
searchJobsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const jobs = await prisma.searchJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        vendor: true,
        candidatesFound: true,
        createdAt: true,
        completedAt: true,
        companyList: { select: { id: true, name: true } },
      },
    });
    res.json({ data: jobs });
  } catch (err) {
    next(err);
  }
});

// GET /api/search-jobs/:id
searchJobsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const job = await prisma.searchJob.findFirst({
      where: { id: req.params['id'], userId },
      include: { companyList: { select: { id: true, name: true } } },
    });
    if (!job) throw new AppError(404, 'Search job not found');
    res.json({ data: job });
  } catch (err) {
    next(err);
  }
});

// GET /api/search-jobs/:id/results
searchJobsRouter.get('/:id/results', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const job = await prisma.searchJob.findFirst({ where: { id: req.params['id'], userId } });
    if (!job) throw new AppError(404, 'Search job not found');

    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const pageSize = Math.min(
      SEARCH_LIMITS.MAX_PAGE_SIZE,
      parseInt(req.query['pageSize'] as string) || SEARCH_LIMITS.DEFAULT_PAGE_SIZE,
    );
    const skip = (page - 1) * pageSize;

    const [results, total] = await prisma.$transaction([
      prisma.candidateSearchResult.findMany({
        where: { searchJobId: job.id },
        include: { candidate: true },
        orderBy: { candidate: { score: 'desc' } },
        skip,
        take: pageSize,
      }),
      prisma.candidateSearchResult.count({ where: { searchJobId: job.id } }),
    ]);

    res.json({
      data: results,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/search-jobs/:id/results/export
searchJobsRouter.get('/:id/results/export', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const job = await prisma.searchJob.findFirst({ where: { id: req.params['id'], userId } });
    if (!job) throw new AppError(404, 'Search job not found');

    const selectedIds = req.query['selectedIds']
      ? (req.query['selectedIds'] as string).split(',')
      : undefined;

    const where = selectedIds?.length
      ? { searchJobId: job.id, candidateId: { in: selectedIds } }
      : { searchJobId: job.id };

    const results = await prisma.candidateSearchResult.findMany({
      where,
      include: { candidate: true },
      orderBy: { candidate: { score: 'desc' } },
    });

    const rows = results.map((r) => ({
      first_name: r.candidate.firstName ?? '',
      last_name: r.candidate.lastName ?? '',
      full_name: r.candidate.fullName ?? '',
      current_title: r.candidate.currentTitle ?? '',
      company: r.candidate.companyName ?? '',
      location: r.candidate.location ?? '',
      years_experience: r.candidate.yearsExperience ?? '',
      linkedin_url: r.candidate.linkedinUrl ?? '',
      keywords: (r.candidate.keywords as string[] | null)?.join(', ') ?? '',
      source_vendor: r.candidate.sourceVendor ?? '',
      score: r.candidate.score ?? '',
      search_job_id: job.id,
      created_at: r.createdAt.toISOString(),
    }));

    await streamCsvResponse(res, rows, `search-results-${job.id}.csv`);
  } catch (err) {
    next(err);
  }
});
