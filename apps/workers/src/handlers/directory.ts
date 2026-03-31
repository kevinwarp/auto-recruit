import { prisma } from '@auto-recruit/db';
import type { CandidateDirectoryRefreshMessage } from '@auto-recruit/types';

export async function handleDirectoryRefresh(data: unknown): Promise<void> {
  const msg = data as CandidateDirectoryRefreshMessage;
  const { candidateId, trigger } = msg;

  console.log(`[directory] refreshing ${candidateId} (trigger: ${trigger})`);

  // Fetch the latest state from normalized tables
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      enrichments: {
        where: { personalEmail: { not: null } },
        orderBy: { enrichedAt: 'desc' },
        take: 1,
      },
      outreachThreads: {
        orderBy: { lastEventAt: 'desc' },
        take: 1,
        include: {
          senderAccount: { select: { email: true } },
        },
      },
      searchResults: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { searchJobId: true },
      },
    },
  });

  if (!candidate) {
    console.warn(`[directory] candidate ${candidateId} not found`);
    return;
  }

  const latestEnrichment = candidate.enrichments[0] ?? null;
  const latestThread = candidate.outreachThreads[0] ?? null;
  const sourceSearchJobId = candidate.searchResults[0]?.searchJobId ?? null;

  // Build the latest outreach timestamps from threads
  const allThreads = await prisma.outreachThread.findMany({
    where: { candidateId },
    select: {
      currentStatus: true,
      lastEventAt: true,
      senderAccount: { select: { email: true } },
      sends: { select: { sentAt: true }, orderBy: { sentAt: 'desc' }, take: 1 },
      responses: {
        select: { receivedAt: true, isBounce: true },
        orderBy: { receivedAt: 'desc' },
        take: 1,
      },
    },
  });

  const latestSentAt = allThreads
    .flatMap((t) => t.sends.map((s) => s.sentAt))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const latestRespondedAt = allThreads
    .flatMap((t) =>
      t.responses.filter((r) => !r.isBounce).map((r) => r.receivedAt),
    )
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const latestBouncedAt = allThreads
    .flatMap((t) =>
      t.responses.filter((r) => r.isBounce).map((r) => r.receivedAt),
    )
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  // Resolve latest outreach status (priority: responded > bounced > sent > drafted > not_contacted)
  const statusPriority = ['responded', 'bounced', 'sent', 'drafted', 'not_contacted'];
  const threadStatuses = allThreads.map((t) => t.currentStatus);
  const latestOutreachStatus =
    statusPriority.find((s) => threadStatuses.includes(s)) ?? 'not_contacted';

  const latestDraftedAt = allThreads
    .filter((t) => ['drafted', 'sent', 'responded', 'bounced'].includes(t.currentStatus))
    .map((t) => t.lastEventAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  await prisma.candidateDirectory.upsert({
    where: { candidateId },
    create: {
      candidateId,
      fullName: candidate.fullName,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      currentTitle: candidate.currentTitle,
      companyName: candidate.companyName,
      location: candidate.location,
      yearsExperience: candidate.yearsExperience,
      linkedinUrl: candidate.linkedinUrl,
      personalEmail: latestEnrichment?.personalEmail ?? null,
      verificationStatus: latestEnrichment?.verificationStatus ?? null,
      enrichmentVendor: latestEnrichment?.vendorName ?? null,
      enrichmentConfidenceScore: latestEnrichment?.confidenceScore ?? null,
      latestOutreachStatus,
      latestDraftedAt,
      latestSentAt,
      latestRespondedAt,
      latestBouncedAt,
      latestSenderAccountEmail: latestThread?.senderAccount.email ?? null,
      sourceSearchJobId,
    },
    update: {
      fullName: candidate.fullName,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      currentTitle: candidate.currentTitle,
      companyName: candidate.companyName,
      location: candidate.location,
      yearsExperience: candidate.yearsExperience,
      linkedinUrl: candidate.linkedinUrl,
      personalEmail: latestEnrichment?.personalEmail ?? undefined,
      verificationStatus: latestEnrichment?.verificationStatus ?? undefined,
      enrichmentVendor: latestEnrichment?.vendorName ?? undefined,
      enrichmentConfidenceScore: latestEnrichment?.confidenceScore ?? undefined,
      latestOutreachStatus,
      latestDraftedAt,
      latestSentAt,
      latestRespondedAt,
      latestBouncedAt,
      latestSenderAccountEmail: latestThread?.senderAccount.email ?? undefined,
      updatedAt: new Date(),
    },
  });

  console.log(`[directory] upserted ${candidateId} — status: ${latestOutreachStatus}`);
}
