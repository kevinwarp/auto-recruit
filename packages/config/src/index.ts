import { z } from 'zod';

// ─── Environment Schema ───────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().optional(),

  // GCP
  GCP_PROJECT_ID: z.string().default('auto-recruit-kwangel'),
  GCP_REGION: z.string().default('us-central1'),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().default('auto-recruit-kwangel'),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // Cloud Storage
  STORAGE_BUCKET: z.string().default('auto-recruit-kwangel-exports'),

  // Pub/Sub emulator (local dev)
  PUBSUB_EMULATOR_HOST: z.string().optional(),

  // Apollo.io (primary people search)
  APOLLO_API_KEY: z.string().optional(),

  // People Data Labs (secondary / backfill)
  PDL_API_KEY: z.string().optional(),

  // ContactOut (Phase 2)
  CONTACTOUT_API_KEY: z.string().optional(),

  // FullEnrich — personal email waterfall + search email backfill
  FULL_ENRICH_API_KEY: z.string().optional(),

  // RocketReach (Phase 2)
  ROCKETREACH_API_KEY: z.string().optional(),

  // Gmail OAuth (Phase 3)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Microsoft Graph OAuth (Phase 3)
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),

  // API server
  API_PORT: z.coerce.number().default(8080),
  WORKERS_PORT: z.coerce.number().default(8081),

  // Internal service URLs (for Cloud Run service-to-service)
  API_BASE_URL: z.string().default('http://localhost:8080'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}

// ─── Pub/Sub Topics ───────────────────────────────────────────────────────────

export const PUBSUB_TOPICS = {
  CANDIDATE_SEARCH: 'candidate-search',
  CANDIDATE_ENRICHMENT: 'candidate-enrichment',
  OUTREACH_DRAFT: 'outreach-draft',
  OUTREACH_SEND: 'outreach-send',
  CANDIDATE_DIRECTORY_REFRESH: 'candidate-directory-refresh',
  CSV_EXPORT: 'csv-export',
} as const;

export type PubSubTopic = (typeof PUBSUB_TOPICS)[keyof typeof PUBSUB_TOPICS];

// ─── Outreach Status ──────────────────────────────────────────────────────────

export const OUTREACH_STATUS = {
  NOT_CONTACTED: 'not_contacted',
  DRAFTED: 'drafted',
  SENT: 'sent',
  RESPONDED: 'responded',
  BOUNCED: 'bounced',
  FAILED: 'failed',
  DO_NOT_CONTACT: 'do_not_contact',
} as const;

/** Statuses surfaced to UI per TRD */
export const UI_OUTREACH_STATUSES = ['drafted', 'sent', 'responded', 'bounced'] as const;

// ─── Candidate Scoring Weights ────────────────────────────────────────────────

export const CANDIDATE_SCORING = {
  EXACT_TITLE_MATCH: 40,
  KEYWORD_MATCH: 20,
  EXPERIENCE_MATCH: 15,
  LOCATION_MATCH: 10,
  LINKEDIN_PRESENCE: 10,
  VENDOR_CONFIDENCE: 5,
} as const;

export const MAX_CANDIDATE_SCORE = Object.values(CANDIDATE_SCORING).reduce((a, b) => a + b, 0);

// ─── Search Limits ────────────────────────────────────────────────────────────

export const SEARCH_LIMITS = {
  MAX_COMPANIES_PER_SEARCH: 100,
  MAX_PAGE_SIZE: 200,
  DEFAULT_PAGE_SIZE: 50,
} as const;

// ─── CSV Export ───────────────────────────────────────────────────────────────

export const CSV_EXPORT = {
  /** Rows below this threshold are exported synchronously; above = async via Cloud Storage */
  SYNC_THRESHOLD: 1000,
  SIGNED_URL_EXPIRY_SECONDS: 3600,
} as const;

// ─── Send Guardrails ──────────────────────────────────────────────────────────

export const SEND_DEFAULTS = {
  DAILY_SEND_LIMIT: 100,
  SEND_DELAY_SECONDS: 5,
} as const;

// ─── Response Polling ─────────────────────────────────────────────────────────

export const RESPONSE_POLLING = {
  /** How far back (in hours) to look for new replies when polling */
  LOOKBACK_HOURS: 24,
  /** Identifiers that indicate a bounce / NDR */
  BOUNCE_FROM_PATTERNS: [
    'mailer-daemon@',
    'postmaster@',
    'noreply@',
    'no-reply@',
    'bounces@',
    'bounce@',
  ],
  BOUNCE_SUBJECT_PATTERNS: [
    'delivery status notification',
    'undeliverable',
    'mail delivery failed',
    'failure notice',
    'returned mail',
    'non-delivery report',
    'delivery failed',
  ],
} as const;

// ─── Vendor Names ─────────────────────────────────────────────────────────────

export const VENDOR_NAMES = {
  APOLLO: 'apollo',
  PDL: 'people_data_labs',
  FULL_ENRICH: 'full_enrich',
  CONTACTOUT: 'contactout',
  ROCKETREACH: 'rocketreach',
  FORAGER: 'forager',
  MIXRANK: 'mixrank',
  AVIATO: 'aviato',
} as const;
