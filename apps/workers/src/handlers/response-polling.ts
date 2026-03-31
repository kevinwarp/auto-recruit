import { prisma } from '@auto-recruit/db';
import { OUTREACH_STATUS, RESPONSE_POLLING, PUBSUB_TOPICS } from '@auto-recruit/config';
import { PubSub } from '@google-cloud/pubsub';
import type { CandidateDirectoryRefreshMessage } from '@auto-recruit/types';

const pubsub = new PubSub();

/**
 * Polls all active sender accounts for new replies and bounces.
 * Triggered by Cloud Scheduler every 10 minutes.
 */
export async function pollResponses(): Promise<void> {
  console.log('[polling] starting response + bounce poll');

  const senderAccounts = await prisma.senderAccount.findMany({
    where: { isActive: true },
    select: {
      id: true,
      email: true,
      provider: true,
      accessTokenRef: true,
      refreshTokenRef: true,
    },
  });

  console.log(`[polling] checking ${senderAccounts.length} sender accounts`);

  for (const account of senderAccounts) {
    try {
      if (account.provider === 'gmail' || account.provider === 'google_workspace') {
        await pollGmailAccount(account);
      } else if (account.provider === 'outlook' || account.provider === 'office365') {
        await pollOutlookAccount(account);
      }
    } catch (err) {
      console.error(`[polling] error polling ${account.email}:`, err);
    }
  }

  console.log('[polling] done');
}

// ── Gmail Polling ─────────────────────────────────────────────────────────────

async function pollGmailAccount(account: {
  id: string;
  email: string;
  accessTokenRef: string | null;
}): Promise<void> {
  const accessToken = await resolveToken(account.accessTokenRef);
  if (!accessToken) {
    console.warn(`[polling] no access token for ${account.email}`);
    return;
  }

  // Find all sent email threads for this sender account
  const sends = await prisma.emailSend.findMany({
    where: {
      senderAccountId: account.id,
      providerThreadId: { not: null },
      status: { not: 'bounced' },
    },
    select: {
      id: true,
      candidateId: true,
      outreachThreadId: true,
      providerThreadId: true,
    },
    take: 200,
  });

  for (const send of sends) {
    if (!send.providerThreadId) continue;

    try {
      // Fetch the thread from Gmail API
      const thread = await fetchGmailThread(accessToken, send.providerThreadId);
      if (!thread) continue;

      const messages = thread.messages ?? [];
      // Skip messages that are the original outbound send
      const inbound = messages.slice(1);

      for (const message of inbound) {
        const headers = message.payload?.headers ?? [];
        const from = getHeader(headers, 'from') ?? '';
        const subject = getHeader(headers, 'subject') ?? '';
        const messageId = message.id ?? '';

        // Skip if already recorded
        const exists = await prisma.emailResponse.findFirst({
          where: { providerMessageId: messageId },
        });
        if (exists) continue;

        const isBounce = detectBounce(from, subject);

        // Decode body excerpt
        const bodyExcerpt = extractBodyExcerpt(message.payload);

        await prisma.$transaction(async (tx) => {
          const response = await tx.emailResponse.create({
            data: {
              candidateId: send.candidateId,
              outreachThreadId: send.outreachThreadId,
              senderAccountId: account.id,
              providerThreadId: send.providerThreadId,
              providerMessageId: messageId,
              fromEmail: from,
              subject,
              bodyExcerpt,
              isBounce,
              receivedAt: new Date(),
            },
          });

          const newStatus = isBounce ? OUTREACH_STATUS.BOUNCED : OUTREACH_STATUS.RESPONDED;
          const eventType = isBounce ? 'bounce_received' : 'response_received';

          await tx.outreachThread.update({
            where: { id: send.outreachThreadId },
            data: { currentStatus: newStatus, lastEventAt: new Date() },
          });

          await tx.outreachEvent.create({
            data: {
              candidateId: send.candidateId,
              outreachThreadId: send.outreachThreadId,
              eventType,
              statusAfterEvent: newStatus,
              senderAccountId: account.id,
              emailResponseId: response.id,
              occurredAt: new Date(),
            },
          });

          // Update send status if bounced
          if (isBounce) {
            await tx.emailSend.update({
              where: { id: send.id },
              data: { status: 'bounced' },
            });
          }

          // Update candidate directory directly
          await tx.candidateDirectory.updateMany({
            where: { candidateId: send.candidateId },
            data: {
              latestOutreachStatus: newStatus,
              ...(isBounce ? { latestBouncedAt: new Date() } : { latestRespondedAt: new Date() }),
              updatedAt: new Date(),
            },
          });
        });

        // Trigger full directory refresh
        await pubsub.topic(PUBSUB_TOPICS.CANDIDATE_DIRECTORY_REFRESH).publishMessage({
          data: Buffer.from(
            JSON.stringify({
              candidateId: send.candidateId,
              trigger: isBounce ? 'outreach_bounced' : 'outreach_responded',
            } satisfies CandidateDirectoryRefreshMessage),
          ),
        });

        console.log(
          `[polling] ${isBounce ? '⚠️ bounce' : '✅ response'} from ${from} for candidate ${send.candidateId}`,
        );
      }
    } catch (err) {
      console.warn(`[polling] error checking thread ${send.providerThreadId}:`, err);
    }
  }
}

// ── Outlook Polling ───────────────────────────────────────────────────────────

async function pollOutlookAccount(account: { id: string; email: string; accessTokenRef: string | null }): Promise<void> {
  // Phase 3: implement Microsoft Graph API polling
  // GET /me/mailFolders/inbox/messages?$filter=receivedDateTime ge {lookback}
  // Match by conversationId against stored providerThreadId
  console.log(`[polling] Outlook polling not yet implemented for ${account.email}`);
}

// ── Bounce Detection ──────────────────────────────────────────────────────────

function detectBounce(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  const bounceFrom = RESPONSE_POLLING.BOUNCE_FROM_PATTERNS.some((p) => fromLower.includes(p));
  const bounceSubject = RESPONSE_POLLING.BOUNCE_SUBJECT_PATTERNS.some((p) =>
    subjectLower.includes(p),
  );

  return bounceFrom || bounceSubject;
}

// ── Gmail API helpers ─────────────────────────────────────────────────────────

interface GmailMessagePart {
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id?: string;
  payload?: GmailMessagePart;
}

interface GmailThread {
  messages?: GmailMessage[];
}

async function fetchGmailThread(accessToken: string, threadId: string): Promise<GmailThread | null> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    console.warn(`[polling] Gmail thread fetch failed: ${response.status}`);
    return null;
  }

  return response.json() as Promise<GmailThread>;
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractBodyExcerpt(payload: GmailMessagePart | undefined, maxLength = 500): string {
  if (!payload) return '';

  // Try the direct body first
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    return decoded.replace(/<[^>]+>/g, ' ').trim().slice(0, maxLength);
  }

  // Recurse into parts
  for (const part of payload.parts ?? []) {
    const text = extractBodyExcerpt(part, maxLength);
    if (text) return text;
  }

  return '';
}

// ── Token resolution ──────────────────────────────────────────────────────────

async function resolveToken(tokenRef: string | null): Promise<string | null> {
  if (!tokenRef) return null;

  // In production: tokenRef is a Secret Manager resource name
  // e.g. projects/auto-recruit-kwangel/secrets/sender-token-xxx/versions/latest
  // For now, if it looks like a raw token (local dev), return it directly
  if (tokenRef.startsWith('projects/')) {
    try {
      const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
      const client = new SecretManagerServiceClient();
      const [version] = await client.accessSecretVersion({ name: tokenRef });
      return version.payload?.data?.toString() ?? null;
    } catch {
      return null;
    }
  }

  // Local dev: raw token stored directly
  return tokenRef;
}
