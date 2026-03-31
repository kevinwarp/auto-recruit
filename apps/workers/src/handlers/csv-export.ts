import { prisma } from '@auto-recruit/db';
import { loadEnv, CSV_EXPORT } from '@auto-recruit/config';
import { Storage } from '@google-cloud/storage';
import { stringify } from 'csv-stringify/sync';
import type { CsvExportMessage } from '@auto-recruit/types';

const storage = new Storage();

export async function handleCsvExport(data: unknown): Promise<void> {
  const msg = data as CsvExportMessage;
  const { exportJobId, userId, page, filters, scope, selectedIds } = msg;

  const env = loadEnv();
  console.log(`[csv-export] processing export ${exportJobId} for page ${page}`);

  try {
    let rows: Record<string, unknown>[] = [];

    if (page === 'candidate_directory') {
      const where = buildDirectoryWhere(filters, selectedIds);
      const entries = await prisma.candidateDirectory.findMany({ where, orderBy: { createdAt: 'desc' } });
      rows = entries.map((e) => ({
        full_name: e.fullName ?? '',
        current_title: e.currentTitle ?? '',
        company: e.companyName ?? '',
        personal_email: e.personalEmail ?? '',
        verification_status: e.verificationStatus ?? '',
        outreach_status: e.latestOutreachStatus,
        latest_sent_at: e.latestSentAt?.toISOString() ?? '',
        latest_responded_at: e.latestRespondedAt?.toISOString() ?? '',
        latest_bounced_at: e.latestBouncedAt?.toISOString() ?? '',
        linkedin_url: e.linkedinUrl ?? '',
        candidate_id: e.candidateId,
      }));
    }

    // Generate CSV
    const csv = stringify(rows, { header: true });
    const filename = `exports/${userId}/${exportJobId}.csv`;

    await storage.bucket(env.STORAGE_BUCKET).file(filename).save(csv, { contentType: 'text/csv' });

    const [signedUrl] = await storage.bucket(env.STORAGE_BUCKET).file(filename).getSignedUrl({
      action: 'read',
      expires: Date.now() + CSV_EXPORT.SIGNED_URL_EXPIRY_SECONDS * 1000,
    });

    console.log(`[csv-export] exported ${rows.length} rows → ${signedUrl}`);
  } catch (err) {
    console.error(`[csv-export] failed for ${exportJobId}:`, err);
  }
}

function buildDirectoryWhere(
  filters: Record<string, unknown>,
  selectedIds?: string[],
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters['status']) where['latestOutreachStatus'] = filters['status'];
  if (filters['company']) where['companyName'] = { contains: filters['company'], mode: 'insensitive' };
  if (selectedIds?.length) where['candidateId'] = { in: selectedIds };
  return where;
}
