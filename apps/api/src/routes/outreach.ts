import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@auto-recruit/db';
import { OUTREACH_STATUS } from '@auto-recruit/config';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';

export const outreachRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function buildTemplateVars(candidate: {
  firstName?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  currentTitle?: string | null;
  keywords?: unknown;
}, senderDisplayName: string, roleTitle?: string): Record<string, string> {
  const keywords = Array.isArray(candidate.keywords)
    ? (candidate.keywords as string[]).slice(0, 3).join(', ')
    : '';
  return {
    first_name: candidate.firstName ?? candidate.fullName?.split(' ')[0] ?? '',
    company_name: candidate.companyName ?? '',
    current_title: candidate.currentTitle ?? '',
    role_title: roleTitle ?? '',
    sender_name: senderDisplayName,
    keyword_match: keywords,
  };
}

// ── Draft ─────────────────────────────────────────────────────────────────────

const draftSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(500),
  senderAccountId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  subjectOverride: z.string().optional(),
  bodyOverride: z.string().optional(),
  roleTitle: z.string().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  searchJobId: z.string().uuid().optional(),
});

// POST /api/outreach/draft
outreachRouter.post('/draft', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const { candidateIds, senderAccountId, templateId, subjectOverride, bodyOverride, roleTitle, cc, bcc, searchJobId } = parsed.data;

    const senderAccount = await prisma.senderAccount.findFirst({
      where: { id: senderAccountId, userId, isActive: true },
    });
    if (!senderAccount) throw new AppError(404, 'Sender account not found');

    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId } })
      : null;

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
    });

    const drafts = await Promise.all(
      candidates.map(async (candidate) => {
        const vars = buildTemplateVars(candidate, senderAccount.displayName ?? senderAccount.email, roleTitle);

        const subjectRaw = subjectOverride ?? template?.subjectTemplate ?? '';
        const bodyRaw = bodyOverride ?? template?.bodyTemplate ?? '';
        const subjectRendered = renderTemplate(subjectRaw, vars);
        const bodyRendered = renderTemplate(bodyRaw, vars);

        // Upsert outreach thread
        const thread = await prisma.outreachThread.upsert({
          where: {
            // Use a composed unique approach: find existing or create
            id: (
              await prisma.outreachThread.findFirst({
                where: { candidateId: candidate.id, senderAccountId, currentStatus: { not: 'sent' } },
                select: { id: true },
              })
            )?.id ?? '',
          },
          create: {
            candidateId: candidate.id,
            senderAccountId,
            userId,
            searchJobId: searchJobId ?? null,
            currentStatus: OUTREACH_STATUS.DRAFTED,
            latestSubject: subjectRendered,
            latestBodySnapshot: bodyRendered,
            lastEventAt: new Date(),
          },
          update: {
            currentStatus: OUTREACH_STATUS.DRAFTED,
            latestSubject: subjectRendered,
            latestBodySnapshot: bodyRendered,
            lastEventAt: new Date(),
          },
        });

        const draft = await prisma.emailDraft.create({
          data: {
            candidateId: candidate.id,
            outreachThreadId: thread.id,
            senderAccountId,
            templateId: templateId ?? null,
            subjectRendered,
            bodyRendered,
            cc: cc ?? [],
            bcc: bcc ?? [],
            status: 'draft',
          },
        });

        // Outreach event
        await prisma.outreachEvent.create({
          data: {
            candidateId: candidate.id,
            outreachThreadId: thread.id,
            eventType: 'draft_created',
            statusAfterEvent: OUTREACH_STATUS.DRAFTED,
            senderAccountId,
            emailDraftId: draft.id,
            occurredAt: new Date(),
          },
        });

        // Update candidate directory
        await prisma.candidateDirectory.updateMany({
          where: { candidateId: candidate.id },
          data: {
            latestOutreachStatus: OUTREACH_STATUS.DRAFTED,
            latestDraftedAt: new Date(),
            latestSenderAccountEmail: senderAccount.email,
            ownerUserId: userId,
            updatedAt: new Date(),
          },
        });

        return draft;
      }),
    );

    res.status(201).json({ data: { drafted: drafts.length } });
  } catch (err) {
    next(err);
  }
});

// ── Send ──────────────────────────────────────────────────────────────────────

const sendSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(200),
  senderAccountId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  subjectOverride: z.string().optional(),
  bodyOverride: z.string().optional(),
  roleTitle: z.string().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  searchJobId: z.string().uuid().optional(),
});

// POST /api/outreach/send
outreachRouter.post('/send', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Invalid request body');

    const { candidateIds, senderAccountId, templateId, subjectOverride, bodyOverride, roleTitle, cc, bcc, searchJobId } = parsed.data;

    const senderAccount = await prisma.senderAccount.findFirst({
      where: { id: senderAccountId, userId, isActive: true },
    });
    if (!senderAccount) throw new AppError(404, 'Sender account not found');

    const template = templateId
      ? await prisma.template.findFirst({ where: { id: templateId, userId } })
      : null;

    // Suppression check
    const candidatesWithEmails = await prisma.candidateDirectory.findMany({
      where: { candidateId: { in: candidateIds }, personalEmail: { not: null } },
      select: { candidateId: true, personalEmail: true },
    });

    const suppressedEmails = await prisma.suppressionList.findMany({
      where: {
        email: { in: candidatesWithEmails.map((c) => c.personalEmail!).filter(Boolean) },
      },
      select: { email: true },
    });
    const suppressedSet = new Set(suppressedEmails.map((s) => s.email));

    const eligible = candidatesWithEmails.filter((c) => c.personalEmail && !suppressedSet.has(c.personalEmail));

    const candidates = await prisma.candidate.findMany({
      where: { id: { in: eligible.map((e) => e.candidateId) } },
    });

    // Note: actual email sending via Gmail/Graph happens in Phase 3.
    // Here we record the intent and log the event — the send worker picks it up via Pub/Sub.
    const { publishMessage } = await import('../services/pubsub.js');
    const { PUBSUB_TOPICS } = await import('@auto-recruit/config');

    const sends = await Promise.all(
      candidates.map(async (candidate) => {
        const vars = buildTemplateVars(candidate, senderAccount.displayName ?? senderAccount.email, roleTitle);
        const subjectRendered = renderTemplate(subjectOverride ?? template?.subjectTemplate ?? '', vars);
        const bodyRendered = renderTemplate(bodyOverride ?? template?.bodyTemplate ?? '', vars);

        const thread = await prisma.outreachThread.upsert({
          where: {
            id: (
              await prisma.outreachThread.findFirst({
                where: { candidateId: candidate.id, senderAccountId },
                select: { id: true },
              })
            )?.id ?? '',
          },
          create: {
            candidateId: candidate.id,
            senderAccountId,
            userId,
            searchJobId: searchJobId ?? null,
            currentStatus: OUTREACH_STATUS.SENT,
            latestSubject: subjectRendered,
            latestBodySnapshot: bodyRendered,
            lastEventAt: new Date(),
          },
          update: {
            currentStatus: OUTREACH_STATUS.SENT,
            latestSubject: subjectRendered,
            latestBodySnapshot: bodyRendered,
            lastEventAt: new Date(),
          },
        });

        const emailSend = await prisma.emailSend.create({
          data: {
            candidateId: candidate.id,
            outreachThreadId: thread.id,
            senderAccountId,
            subjectRendered,
            bodyRendered,
            cc: cc ?? [],
            bcc: bcc ?? [],
            status: 'queued',
          },
        });

        await prisma.outreachEvent.create({
          data: {
            candidateId: candidate.id,
            outreachThreadId: thread.id,
            eventType: 'email_sent',
            statusAfterEvent: OUTREACH_STATUS.SENT,
            senderAccountId,
            emailSendId: emailSend.id,
            occurredAt: new Date(),
          },
        });

        await prisma.candidateDirectory.updateMany({
          where: { candidateId: candidate.id },
          data: {
            latestOutreachStatus: OUTREACH_STATUS.SENT,
            latestSentAt: new Date(),
            latestSenderAccountEmail: senderAccount.email,
            ownerUserId: userId,
            updatedAt: new Date(),
          },
        });

        // Publish to send worker for actual dispatch
        await publishMessage(PUBSUB_TOPICS.OUTREACH_SEND, {
          emailSendId: emailSend.id,
          candidateId: candidate.id,
          senderAccountId,
          toEmail: candidatesWithEmails.find((c) => c.candidateId === candidate.id)?.personalEmail,
          subject: subjectRendered,
          body: bodyRendered,
          cc: cc ?? [],
          bcc: bcc ?? [],
        });

        return emailSend;
      }),
    );

    res.status(201).json({ data: { queued: sends.length, suppressed: candidateIds.length - sends.length } });
  } catch (err) {
    next(err);
  }
});

// ── Thread status / history ───────────────────────────────────────────────────

// GET /api/outreach/threads/:id
outreachRouter.get('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const thread = await prisma.outreachThread.findUnique({
      where: { id: req.params['id'] },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        drafts: true,
        sends: true,
        responses: true,
      },
    });
    if (!thread) throw new AppError(404, 'Thread not found');
    res.json({ data: thread });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/outreach/threads/:id/status  (manual override)
outreachRouter.patch('/threads/:id/status', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const { status } = z.object({ status: z.string() }).parse(req.body);

    const thread = await prisma.outreachThread.findFirst({
      where: { id: req.params['id'], userId },
    });
    if (!thread) throw new AppError(404, 'Thread not found');

    const updated = await prisma.outreachThread.update({
      where: { id: thread.id },
      data: { currentStatus: status, lastEventAt: new Date() },
    });

    await prisma.outreachEvent.create({
      data: {
        candidateId: thread.candidateId,
        outreachThreadId: thread.id,
        eventType: 'status_manually_updated',
        statusAfterEvent: status,
        occurredAt: new Date(),
        metadata: { previousStatus: thread.currentStatus, updatedBy: userId },
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/outreach/events
outreachRouter.get('/events', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.uid;
    const candidateId = req.query['candidateId'] as string | undefined;

    const events = await prisma.outreachEvent.findMany({
      where: {
        ...(candidateId ? { candidateId } : {}),
        outreachThread: { userId },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});
