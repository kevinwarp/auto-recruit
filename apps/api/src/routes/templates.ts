import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const templatesRouter = Router();

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string().optional(),
});

templatesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const templates = await prisma.template.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ data: templates });
  } catch (err) { next(err); }
});

templatesRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');
    const template = await prisma.template.create({ data: { userId, ...parsed.data } });
    res.status(201).json({ data: template });
  } catch (err) { next(err); }
});

templatesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const template = await prisma.template.findFirst({ where: { id: req.params['id'], userId } });
    if (!template) throw new AppError(404, 'Template not found');
    res.json({ data: template });
  } catch (err) { next(err); }
});

templatesRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const existing = await prisma.template.findFirst({ where: { id: req.params['id'], userId } });
    if (!existing) throw new AppError(404, 'Template not found');
    const parsed = templateSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');
    const updated = await prisma.template.update({ where: { id: existing.id }, data: parsed.data });
    res.json({ data: updated });
  } catch (err) { next(err); }
});

templatesRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const existing = await prisma.template.findFirst({ where: { id: req.params['id'], userId } });
    if (!existing) throw new AppError(404, 'Template not found');
    await prisma.template.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});
