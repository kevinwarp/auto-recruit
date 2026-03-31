import { prisma } from '@auto-recruit/db';
import { loadEnv, PUBSUB_TOPICS } from '@auto-recruit/config';
import { PubSub } from '@google-cloud/pubsub';
import type { CandidateEnrichmentMessage } from '@auto-recruit/types';
import { log } from '../lib/reporter.js';

// How long (ms) a SearchJob must be idle before we consider it settled/done
const SEARCH_SETTLE_MS = 90_000; // 90 seconds
// Max time to wait for enrichment before forcing advancement
const ENRICHMENT_TIMEOUT_MS = 30 * 60_000; // 30 minutes

let _pubsub: PubSub | null = null;
function getPubSub(): PubSub {
  if (!_pubsub) _pubsub = new PubSub({ projectId: loadEnv().GCP_PROJECT_ID });
  return _pubsub;
}

async function publish<T extends object>(topic: string, data: T): Promise<void> {
  await getPubSub()
    .topic(topic)
    .publishMessage({ data: Buffer.from(JSON.stringify(data)) });
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function advanceCampaigns(): Promise<void> {
  const running = await prisma.campaign.findMany({
    where: { status: 'running' },
  });

  log('INFO', `[campaigns] advancing ${running.length} running campaigns`);

  await Promise.all(running.map((c) => advanceOne(c.id).catch((err) => {
    log('ERROR', `[campaigns] error advancing campaign ${c.id}`, { error: String(err) });
  })));
}

// ── Per-campaign state machine ────────────────────────────────────────────────

async function advanceOne(campaignId: string): Promise<void> {
  // Re-fetch for freshest state within this tick
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'running') return;

  const now = new Date();

  // ── 1. Search stage ─────────────────────────────────────────────────────────
  if (campaign.searchStatus === 'running' && campaign.searchJobId) {
    const searchJob = await prisma.searchJob.findUnique({
      where: { id: campaign.searchJobId },
      select: { status: true, candidatesFound: true, updatedAt: true },
    });
    if (!searchJob) return;

    const idleMs = now.getTime() - searchJob.updatedAt.getTime();
    const searchDone =
      searchJob.status === 'completed' ||
      searchJob.status === 'failed' ||
      idleMs >= SEARCH_SETTLE_MS;

    if (!searchDone) return; // still actively running

    log('INFO', `[campaigns] ${campaignId}: search settled (${searchJob.candidatesFound} candidates)`);

    // Mark search complete
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        searchStatus: searchJob.status === 'failed' ? 'failed' : 'completed',
        searchProgress: searchJob.candidatesFound,
        searchTotal: searchJob.candidatesFound,
        searchCompletedAt: now,
      },
    });

    if (searchJob.status === 'failed') {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'failed' } });
      return;
    }

    // Advance to enrichment or outreach
    await startEnrichmentStage(campaignId, campaign, now);
    return;
  }

  // ── 2. Enrichment stage ─────────────────────────────────────────────────────
  if (campaign.enrichmentStatus === 'running') {
    const progress = await countEnrichmentProgress(campaign.searchJobId, campaign.enrichmentStartedAt);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { enrichmentProgress: progress },
    });

    const enrichmentElapsedMs = campaign.enrichmentStartedAt
      ? now.getTime() - campaign.enrichmentStartedAt.getTime()
      : 0;

    const enrichmentDone =
      (campaign.enrichmentTotal > 0 && progress >= campaign.enrichmentTotal) ||
      enrichmentElapsedMs >= ENRICHMENT_TIMEOUT_MS;

    if (!enrichmentDone) return;

    log('INFO', `[campaigns] ${campaignId}: enrichment done (${progress}/${campaign.enrichmentTotal})`);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        enrichmentStatus: 'completed',
        enrichmentProgress: progress,
        enrichmentCompletedAt: now,
      },
    });

    if (campaign.autoOutreach && campaign.senderAccountId && campaign.templateId) {
      await startOutreachStage(campaignId, campaign, now);
    } else {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { outreachStatus: 'completed', outreachCompletedAt: now, status: 'completed' },
      });
    }
    return;
  }

  // ── 3. Outreach stage ───────────────────────────────────────────────────────
  if (campaign.outreachStatus === 'running') {
    const progress = await countOutreachProgress(campaign.searchJobId);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { outreachProgress: progress },
    });

    if (campaign.outreachTotal > 0 && progress >= campaign.outreachTotal) {
      log('INFO', `[campaigns] ${campaignId}: outreach done (${progress} sent)`);
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          outreachStatus: 'completed',
          outreachProgress: progress,
          outreachCompletedAt: now,
          status: 'completed',
        },
      });
    }
  }
}

// ── Stage launchers ───────────────────────────────────────────────────────────

async function startEnrichmentStage(
  campaignId: string,
  campaign: { autoEnrich: boolean; enrichMinScore: number; searchJobId: string | null; autoOutreach: boolean; senderAccountId: string | null; templateId: string | null; dailyLimit: number; minScore: number },
  now: Date,
): Promise<void> {
  if (!campaign.autoEnrich) {
    // Skip straight to outreach if configured
    if (campaign.autoOutreach && campaign.senderAccountId && campaign.templateId) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { enrichmentStatus: 'completed', enrichmentCompletedAt: now },
      });
      await startOutreachStage(campaignId, campaign, now);
    } else {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          enrichmentStatus: 'completed',
          enrichmentCompletedAt: now,
          outreachStatus: 'completed',
          outreachCompletedAt: now,
          status: 'completed',
        },
      });
    }
    return;
  }

  if (!campaign.searchJobId) return;

  // Find candidates from this search that meet the enrichment score threshold
  const toEnrich = await prisma.candidateSearchResult.findMany({
    where: { searchJobId: campaign.searchJobId },
    include: {
      candidate: {
        select: {
          id: true,
          linkedinUrl: true,
          firstName: true,
          lastName: true,
          companyName: true,
          companyDomain: true,
          score: true,
        },
      },
    },
  });

  const eligible = toEnrich.filter(
    (r) => (r.candidate.score ?? 0) >= campaign.enrichMinScore,
  );

  log('INFO', `[campaigns] ${campaignId}: publishing ${eligible.length} enrichment messages`);

  // Publish enrichment messages in parallel (batched)
  const BATCH = 50;
  for (let i = 0; i < eligible.length; i += BATCH) {
    await Promise.all(
      eligible.slice(i, i + BATCH).map((r) =>
        publish<CandidateEnrichmentMessage>(PUBSUB_TOPICS.CANDIDATE_ENRICHMENT, {
          candidateId: r.candidate.id,
          linkedinUrl: r.candidate.linkedinUrl ?? undefined,
          firstName: r.candidate.firstName ?? undefined,
          lastName: r.candidate.lastName ?? undefined,
          companyName: r.candidate.companyName ?? undefined,
          companyDomain: r.candidate.companyDomain ?? undefined,
        }),
      ),
    );
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      enrichmentStatus: eligible.length > 0 ? 'running' : 'completed',
      enrichmentTotal: eligible.length,
      enrichmentStartedAt: now,
      enrichmentCompletedAt: eligible.length === 0 ? now : null,
    },
  });

  // If nothing to enrich, advance immediately
  if (eligible.length === 0) {
    if (campaign.autoOutreach && campaign.senderAccountId && campaign.templateId) {
      await startOutreachStage(campaignId, campaign, now);
    } else {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { outreachStatus: 'completed', outreachCompletedAt: now, status: 'completed' },
      });
    }
  }
}

async function startOutreachStage(
  campaignId: string,
  campaign: { searchJobId: string | null; senderAccountId: string | null; templateId: string | null; dailyLimit: number; minScore: number; userId?: string },
  now: Date,
): Promise<void> {
  if (!campaign.searchJobId || !campaign.senderAccountId || !campaign.templateId) return;

  // Re-fetch campaign for userId
  const full = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { userId: true },
  });
  if (!full) return;

  // Find enriched candidates with a verified/unverified email, limit by dailyLimit
  const directoryEntries = await prisma.candidateDirectory.findMany({
    where: {
      personalEmail: { not: null },
      latestOutreachStatus: 'not_contacted',
      sourceSearchJob: { id: campaign.searchJobId },
    },
    take: campaign.dailyLimit,
    select: { candidateId: true, personalEmail: true },
  });

  if (directoryEntries.length === 0) {
    log('INFO', `[campaigns] ${campaignId}: no outreach targets — completing`);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { outreachStatus: 'completed', outreachCompletedAt: now, status: 'completed' },
    });
    return;
  }

  const template = await prisma.template.findUnique({
    where: { id: campaign.templateId },
    select: { subjectTemplate: true, bodyTemplate: true },
  });
  const senderAccount = await prisma.senderAccount.findUnique({
    where: { id: campaign.senderAccountId },
    select: { email: true, displayName: true },
  });
  if (!template || !senderAccount) return;

  // Check suppression list
  const suppressedEmails = await prisma.suppressionList.findMany({
    where: { email: { in: directoryEntries.map((e) => e.personalEmail!).filter(Boolean) } },
    select: { email: true },
  });
  const suppressedSet = new Set(suppressedEmails.map((s) => s.email));
  const eligible = directoryEntries.filter(
    (e) => e.personalEmail && !suppressedSet.has(e.personalEmail),
  );

  log('INFO', `[campaigns] ${campaignId}: queueing ${eligible.length} outreach sends`);

  const candidateIds = eligible.map((e) => e.candidateId);
  const candidates = await prisma.candidate.findMany({
    where: { id: { in: candidateIds } },
  });

  for (const entry of eligible) {
    const candidate = candidates.find((c) => c.id === entry.candidateId);
    if (!candidate) continue;

    const vars = buildTemplateVars(candidate, senderAccount.displayName ?? senderAccount.email);
    const subject = renderTemplate(template.subjectTemplate ?? '', vars);
    const body = renderTemplate(template.bodyTemplate ?? '', vars);

    const thread = await prisma.outreachThread.create({
      data: {
        candidateId: candidate.id,
        senderAccountId: campaign.senderAccountId!,
        userId: full.userId,
        searchJobId: campaign.searchJobId!,
        currentStatus: 'sent',
        latestSubject: subject,
        latestBodySnapshot: body,
        lastEventAt: now,
      },
    });

    const emailSend = await prisma.emailSend.create({
      data: {
        candidateId: candidate.id,
        outreachThreadId: thread.id,
        senderAccountId: campaign.senderAccountId!,
        subjectRendered: subject,
        bodyRendered: body,
        status: 'queued',
        sentAt: now,
      },
    });

    await publish(PUBSUB_TOPICS.OUTREACH_SEND, {
      emailSendId: emailSend.id,
      candidateId: candidate.id,
      senderAccountId: campaign.senderAccountId,
      toEmail: entry.personalEmail,
      subject,
      body,
      cc: [],
      bcc: [],
    });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      outreachStatus: 'running',
      outreachTotal: eligible.length,
      outreachStartedAt: now,
    },
  });
}

// ── Progress counters ─────────────────────────────────────────────────────────

async function countEnrichmentProgress(
  searchJobId: string | null,
  since: Date | null,
): Promise<number> {
  if (!searchJobId) return 0;
  return prisma.candidateEnrichment.count({
    where: {
      ...(since ? { enrichedAt: { gte: since } } : {}),
      candidate: {
        searchResults: { some: { searchJobId } },
      },
    },
  });
}

async function countOutreachProgress(searchJobId: string | null): Promise<number> {
  if (!searchJobId) return 0;
  return prisma.emailSend.count({
    where: { outreachThread: { searchJobId } },
  });
}

// ── Template helpers ──────────────────────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function buildTemplateVars(
  candidate: {
    firstName?: string | null;
    fullName?: string | null;
    companyName?: string | null;
    currentTitle?: string | null;
  },
  senderDisplayName: string,
): Record<string, string> {
  return {
    first_name: candidate.firstName ?? candidate.fullName?.split(' ')[0] ?? '',
    company_name: candidate.companyName ?? '',
    current_title: candidate.currentTitle ?? '',
    sender_name: senderDisplayName,
    role_title: '',
    keyword_match: '',
  };
}
