import { Router } from 'express';
import { prisma } from '@auto-recruit/db';
import { SEARCH_LIMITS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { streamCsvResponse } from '../services/csv.js';
import type { CandidateDirectoryFilters } from '@auto-recruit/types';

export const candidatesRouter = Router();

function buildDirectoryWhere(filters: CandidateDirectoryFilters) {
  const where: Record<string, unknown> = {};

  if (filters.company) where['companyName'] = { contains: filters.company, mode: 'insensitive' };
  if (filters.title) where['currentTitle'] = { contains: filters.title, mode: 'insensitive' };
  if (filters.email) where['personalEmail'] = { contains: filters.email, mode: 'insensitive' };
  if (filters.linkedinUrl)
    where['linkedinUrl'] = { contains: filters.linkedinUrl, mode: 'insensitive' };
  if (filters.status) where['latestOutreachStatus'] = filters.status;
  if (filters.sender) where['latestSenderAccountEmail'] = { contains: filters.sender, mode: 'insensitive' };
  if (filters.ownerUserId) where['ownerUserId'] = filters.ownerUserId;
  if (filters.enrichmentVendor) where['enrichmentVendor'] = filters.enrichmentVendor;
  if (filters.minExperience != null)
    where['yearsExperience'] = { ...(where['yearsExperience'] as object ?? {}), gte: filters.minExperience };
  if (filters.maxExperience != null)
    where['yearsExperience'] = { ...(where['yearsExperience'] as object ?? {}), lte: filters.maxExperience };

  // Date range filters
  if (filters.dateFrom || filters.dateTo) {
    where['createdAt'] = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }
  if (filters.sendDateFrom || filters.sendDateTo) {
    where['latestSentAt'] = {
      ...(filters.sendDateFrom ? { gte: new Date(filters.sendDateFrom) } : {}),
      ...(filters.sendDateTo ? { lte: new Date(filters.sendDateTo) } : {}),
    };
  }
  if (filters.responseDateFrom || filters.responseDateTo) {
    where['latestRespondedAt'] = {
      ...(filters.responseDateFrom ? { gte: new Date(filters.responseDateFrom) } : {}),
      ...(filters.responseDateTo ? { lte: new Date(filters.responseDateTo) } : {}),
    };
  }

  return where;
}

// GET /api/candidates  — global candidate database (full-text + filters)
candidatesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    const filters: CandidateDirectoryFilters = {
      q: q['q'],
      company: q['company'],
      title: q['title'],
      email: q['email'],
      linkedinUrl: q['linkedinUrl'],
      status: q['status'] as CandidateDirectoryFilters['status'],
      sender: q['sender'],
      ownerUserId: q['ownerUserId'],
      enrichmentVendor: q['enrichmentVendor'],
      minExperience: q['minExperience'] ? parseInt(q['minExperience']) : undefined,
      maxExperience: q['maxExperience'] ? parseInt(q['maxExperience']) : undefined,
      dateFrom: q['dateFrom'],
      dateTo: q['dateTo'],
      sendDateFrom: q['sendDateFrom'],
      sendDateTo: q['sendDateTo'],
      responseDateFrom: q['responseDateFrom'],
      responseDateTo: q['responseDateTo'],
      page: q['page'] ? parseInt(q['page']) : 1,
      pageSize: q['pageSize'] ? parseInt(q['pageSize']) : SEARCH_LIMITS.DEFAULT_PAGE_SIZE,
      sortBy: q['sortBy'] ?? 'createdAt',
      sortDirection: (q['sortDirection'] as 'asc' | 'desc') ?? 'desc',
    };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(SEARCH_LIMITS.MAX_PAGE_SIZE, filters.pageSize ?? SEARCH_LIMITS.DEFAULT_PAGE_SIZE);

    // Full-text search via raw SQL when q is present
    if (filters.q && filters.q.trim()) {
      const searchTerm = filters.q.trim();
      const skip = (page - 1) * pageSize;

      const results = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT *
        FROM candidate_directory
        WHERE search_vector @@ plainto_tsquery('english', ${searchTerm})
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${searchTerm})) DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `;
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) FROM candidate_directory
        WHERE search_vector @@ plainto_tsquery('english', ${searchTerm})
      `;

      const total = Number(countResult[0]?.count ?? 0);
      res.json({ data: results, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
      return;
    }

    const where = buildDirectoryWhere(filters);
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortDir = filters.sortDirection ?? 'desc';

    const validSortFields = [
      'createdAt', 'latestDraftedAt', 'latestSentAt', 'latestRespondedAt',
      'fullName', 'companyName', 'enrichmentConfidenceScore',
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any = validSortFields.includes(sortBy) ? { [sortBy]: sortDir } : { createdAt: 'desc' };

    const [entries, total] = await prisma.$transaction([
      prisma.candidateDirectory.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.candidateDirectory.count({ where }),
    ]);

    res.json({ data: entries, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates/export
candidatesRouter.get('/export', requireAuth, async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    const where = buildDirectoryWhere({
      company: q['company'],
      title: q['title'],
      email: q['email'],
      status: q['status'] as CandidateDirectoryFilters['status'],
      sender: q['sender'],
      ownerUserId: q['ownerUserId'],
    });

    const selectedIds = q['selectedIds'] ? q['selectedIds'].split(',') : undefined;
    if (selectedIds?.length) {
      where['candidateId'] = { in: selectedIds };
    }

    const entries = await prisma.candidateDirectory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const rows = entries.map((e) => ({
      full_name: e.fullName ?? '',
      first_name: e.firstName ?? '',
      last_name: e.lastName ?? '',
      current_title: e.currentTitle ?? '',
      company: e.companyName ?? '',
      location: e.location ?? '',
      years_experience: e.yearsExperience ?? '',
      linkedin_url: e.linkedinUrl ?? '',
      personal_email: e.personalEmail ?? '',
      verification_status: e.verificationStatus ?? '',
      enrichment_vendor: e.enrichmentVendor ?? '',
      confidence_score: e.enrichmentConfidenceScore?.toString() ?? '',
      outreach_status: e.latestOutreachStatus,
      latest_drafted_at: e.latestDraftedAt?.toISOString() ?? '',
      latest_sent_at: e.latestSentAt?.toISOString() ?? '',
      latest_responded_at: e.latestRespondedAt?.toISOString() ?? '',
      latest_bounced_at: e.latestBouncedAt?.toISOString() ?? '',
      sender_account: e.latestSenderAccountEmail ?? '',
      candidate_id: e.candidateId,
    }));

    await streamCsvResponse(res, rows, 'candidate-directory.csv');
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates/:id
candidatesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const entry = await prisma.candidateDirectory.findFirst({
      where: { candidateId: req.params['id'] },
    });
    if (!entry) throw new AppError(404, 'Candidate not found');
    res.json({ data: entry });
  } catch (err) {
    next(err);
  }
});

// GET /api/candidates/:id/outreach-history
candidatesRouter.get('/:id/outreach-history', requireAuth, async (req, res, next) => {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: req.params['id'] },
    });
    if (!candidate) throw new AppError(404, 'Candidate not found');

    const [threads, events] = await prisma.$transaction([
      prisma.outreachThread.findMany({
        where: { candidateId: candidate.id },
        include: {
          senderAccount: { select: { email: true, provider: true } },
          sends: { select: { id: true, subjectRendered: true, sentAt: true, status: true, providerThreadId: true } },
          responses: { select: { id: true, subject: true, fromEmail: true, receivedAt: true, isBounce: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outreachEvent.findMany({
        where: { candidateId: candidate.id },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);

    res.json({ data: { threads, events } });
  } catch (err) {
    next(err);
  }
});
