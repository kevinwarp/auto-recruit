import { PrismaClient } from '../generated/client/index.js';

// Singleton Prisma client — safe for use across the monorepo
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { Prisma } from '../generated/client/index.js';
export type {
  User,
  CompanyList,
  Company,
  SearchJob,
  Candidate,
  CandidateSearchResult,
  CandidateEnrichment,
  CandidateDirectory,
  OutreachThread,
  OutreachEvent,
  EmailDraft,
  EmailSend,
  EmailResponse,
  SenderAccount,
  Template,
  SuppressionList,
  VendorUsageLog,
} from '../generated/client/index.js';
