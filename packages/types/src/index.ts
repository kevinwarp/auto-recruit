// ─── Auth / User ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'recruiter' | 'viewer';

export interface User {
  id: string; // Firebase UID
  email: string;
  displayName?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Outreach Status ──────────────────────────────────────────────────────────

export type OutreachStatus =
  | 'not_contacted'
  | 'drafted'
  | 'sent'
  | 'responded'
  | 'bounced'
  | 'failed'
  | 'do_not_contact';

export type OutreachEventType =
  | 'draft_created'
  | 'email_sent'
  | 'response_received'
  | 'bounce_received'
  | 'status_manually_updated';

// ─── Vendor ───────────────────────────────────────────────────────────────────

export type VendorOperation = 'search' | 'enrichment';
export type SenderProvider = 'gmail' | 'google_workspace' | 'outlook' | 'office365';
export type VerificationStatus = 'verified' | 'unverified' | 'unknown';

// ─── Search Job ───────────────────────────────────────────────────────────────

export type SearchJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SearchJobFilters {
  titles?: string[];
  titleContains?: string[];
  departments?: string[];
  seniorities?: string[];
  minExperience?: number;
  maxExperience?: number;
  locations?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
}

// ─── Candidate ────────────────────────────────────────────────────────────────

export interface CandidateScore {
  total: number;
  titleMatch: number;
  keywordMatch: number;
  experienceMatch: number;
  locationMatch: number;
  linkedinPresence: number;
  vendorConfidence: number;
}

export interface NormalizedCandidate {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  linkedinUrl?: string;
  currentTitle?: string;
  companyName?: string;
  companyDomain?: string;
  location?: string;
  yearsExperience?: number;
  keywords?: string[];
  /** Personal or work email — may be backfilled by FullEnrich during search */
  email?: string;
  sourceVendor: string;
  score?: number;
  rawPayload?: Record<string, unknown>;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

export type CsvExportScope = 'all' | 'selected' | 'filtered';

export interface CsvExportRequest {
  scope: CsvExportScope;
  selectedIds?: string[];
  format: 'csv';
}

export interface CsvExportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  downloadUrl?: string;
  rowCount?: number;
  createdAt: Date;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// ─── API ──────────────────────────────────────────────────────────────────────

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export interface ApiSuccess<T = void> {
  data: T;
  message?: string;
}

// ─── Candidate Directory Search ───────────────────────────────────────────────

export interface CandidateDirectoryFilters extends PaginationParams {
  q?: string;
  company?: string;
  title?: string;
  email?: string;
  linkedinUrl?: string;
  status?: OutreachStatus;
  sender?: string;
  ownerUserId?: string;
  enrichmentVendor?: string;
  minExperience?: number;
  maxExperience?: number;
  dateFrom?: string;
  dateTo?: string;
  sendDateFrom?: string;
  sendDateTo?: string;
  responseDateFrom?: string;
  responseDateTo?: string;
}

// ─── Pub/Sub Message Payloads ─────────────────────────────────────────────────

export interface CandidateSearchMessage {
  searchJobId: string;
  companyName: string;
  companyDomain?: string;
  filters: SearchJobFilters;
  vendor: string;
}

export interface CandidateEnrichmentMessage {
  candidateId: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyDomain?: string;
}

export interface CandidateDirectoryRefreshMessage {
  candidateId: string;
  trigger:
    | 'enrichment'
    | 'outreach_drafted'
    | 'outreach_sent'
    | 'outreach_responded'
    | 'outreach_bounced';
}

export interface CsvExportMessage {
  exportJobId: string;
  userId: string;
  page: 'search_results' | 'enriched' | 'candidate_directory';
  filters: Record<string, unknown>;
  scope: CsvExportScope;
  selectedIds?: string[];
}
