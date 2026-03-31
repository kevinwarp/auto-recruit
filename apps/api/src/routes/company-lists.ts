import { Router } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { SEARCH_LIMITS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const companyListsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const createListSchema = z.object({
  name: z.string().min(1).max(200),
  companies: z
    .array(
      z.object({
        name: z.string().min(1),
        domain: z.string().optional(),
        linkedinUrl: z.string().url().optional(),
        size: z.string().optional(),
        location: z.string().optional(),
        industry: z.string().optional(),
        fundingStage: z.string().optional(),
      }),
    )
    .max(SEARCH_LIMITS.MAX_COMPANIES_PER_SEARCH),
});

// GET /api/company-lists
companyListsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const lists = await prisma.companyList.findMany({
      where: { userId },
      include: { _count: { select: { companies: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: lists });
  } catch (err) {
    next(err);
  }
});

// POST /api/company-lists
companyListsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = createListSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body', 'VALIDATION_ERROR');

    const { name, companies } = parsed.data;
    const list = await prisma.companyList.create({
      data: {
        userId,
        name,
        companies: {
          create: companies.map((c) => ({
            name: c.name,
            domain: c.domain,
            linkedinUrl: c.linkedinUrl,
            size: c.size,
            location: c.location,
            industry: c.industry,
            fundingStage: c.fundingStage,
          })),
        },
      },
      include: { companies: true },
    });
    res.status(201).json({ data: list });
  } catch (err) {
    next(err);
  }
});

// POST /api/company-lists/:id/companies/upload  (CSV upload)
companyListsRouter.post(
  '/:id/companies/upload',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const userId = (req as AuthenticatedRequest).user.uid;
      const list = await prisma.companyList.findFirst({
        where: { id: req.params['id'], userId },
      });
      if (!list) throw new AppError(404, 'Company list not found');

      if (!req.file) throw new AppError(400, 'No file uploaded');

      const csvText = req.file.buffer.toString('utf-8');
      const result = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      const companies = result.data.slice(0, SEARCH_LIMITS.MAX_COMPANIES_PER_SEARCH).map((row) => ({
        companyListId: list.id,
        name: row['Company Name'] ?? row['name'] ?? row['company'] ?? '',
        domain: row['Domain'] ?? row['domain'] ?? undefined,
        linkedinUrl: row['LinkedIn URL'] ?? row['linkedin_url'] ?? undefined,
        size: row['Size'] ?? row['size'] ?? undefined,
        location: row['Location'] ?? row['location'] ?? undefined,
        industry: row['Industry'] ?? row['industry'] ?? undefined,
        fundingStage: row['Funding Stage'] ?? row['funding_stage'] ?? undefined,
      })).filter((c) => c.name);

      await prisma.company.createMany({ data: companies, skipDuplicates: true });

      res.json({ data: { imported: companies.length } });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/company-lists/:id
companyListsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const list = await prisma.companyList.findFirst({
      where: { id: req.params['id'], userId },
      include: { companies: true },
    });
    if (!list) throw new AppError(404, 'Company list not found');
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});
