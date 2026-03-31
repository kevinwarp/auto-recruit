import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const senderAccountsRouter = Router();

const createAccountSchema = z.object({
  provider: z.enum(['gmail', 'google_workspace', 'outlook', 'office365']),
  email: z.string().email(),
  displayName: z.string().optional(),
  // OAuth tokens come from the frontend OAuth flow.
  // In production, accessToken and refreshToken are stored in Secret Manager,
  // and only the resource name (ref) is stored in the DB.
  accessTokenRef: z.string().optional(),
  refreshTokenRef: z.string().optional(),
  tokenExpiresAt: z.string().datetime().optional(),
  dailySendLimit: z.number().int().min(1).max(1000).optional(),
  sendDelay: z.number().int().min(1).max(60).optional(),
  signature: z.string().optional(),
});

senderAccountsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const accounts = await prisma.senderAccount.findMany({
      where: { userId, isActive: true },
      select: {
        id: true, provider: true, email: true, displayName: true,
        dailySendLimit: true, sendDelay: true, signature: true,
        isActive: true, createdAt: true, updatedAt: true,
        // never return token refs
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: accounts });
  } catch (err) { next(err); }
});

senderAccountsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const account = await prisma.senderAccount.create({
      data: {
        userId,
        provider: parsed.data.provider,
        email: parsed.data.email,
        displayName: parsed.data.displayName,
        accessTokenRef: parsed.data.accessTokenRef,
        refreshTokenRef: parsed.data.refreshTokenRef,
        tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : undefined,
        dailySendLimit: parsed.data.dailySendLimit ?? 100,
        sendDelay: parsed.data.sendDelay ?? 5,
        signature: parsed.data.signature,
      },
      select: {
        id: true, provider: true, email: true, displayName: true,
        dailySendLimit: true, sendDelay: true, isActive: true, createdAt: true,
      },
    });
    res.status(201).json({ data: account });
  } catch (err) { next(err); }
});

senderAccountsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const existing = await prisma.senderAccount.findFirst({ where: { id: req.params['id'], userId } });
    if (!existing) throw new AppError(404, 'Sender account not found');

    const parsed = createAccountSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const updated = await prisma.senderAccount.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        tokenExpiresAt: parsed.data.tokenExpiresAt ? new Date(parsed.data.tokenExpiresAt) : undefined,
      },
      select: {
        id: true, provider: true, email: true, displayName: true,
        dailySendLimit: true, sendDelay: true, isActive: true, updatedAt: true,
      },
    });
    res.json({ data: updated });
  } catch (err) { next(err); }
});

senderAccountsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const existing = await prisma.senderAccount.findFirst({ where: { id: req.params['id'], userId } });
    if (!existing) throw new AppError(404, 'Sender account not found');
    // Soft-delete: mark inactive rather than deleting (preserves send history)
    await prisma.senderAccount.update({ where: { id: existing.id }, data: { isActive: false } });
    res.status(204).end();
  } catch (err) { next(err); }
});
