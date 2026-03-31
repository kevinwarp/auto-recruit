import 'dotenv/config';
import express from 'express';
import { loadEnv, PUBSUB_TOPICS } from '@auto-recruit/config';
import { subscribeTopic } from './pubsub.js';
import { handleCandidateSearch } from './handlers/search.js';
import { handleCandidateEnrichment } from './handlers/enrichment.js';
import { handleDirectoryRefresh } from './handlers/directory.js';
import { handleCsvExport } from './handlers/csv-export.js';
import { pollResponses } from './handlers/response-polling.js';
import { reportError, log } from './lib/reporter.js';

const env = loadEnv();
const app = express();
app.use(express.json());

// ── Process-level safety nets ────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  reportError(err, { source: 'uncaughtException' });
  // Give the reporter time to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  reportError(reason, { source: 'unhandledRejection' });
});

// ── Health checks ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => res.json({ status: 'ready' }));

// ── Cloud Scheduler: response + bounce polling (every 10 min) ──────────────────
app.post('/jobs/poll-responses', async (_req, res) => {
  const start = Date.now();
  try {
    await pollResponses();
    log('INFO', '[jobs] poll-responses completed', { durationMs: String(Date.now() - start) });
    res.json({ status: 'ok' });
  } catch (err) {
    reportError(err, { job: 'poll-responses' });
    res.status(500).json({ error: 'polling failed' });
  }
});

// ── Pub/Sub subscriptions ──────────────────────────────────────────────────
subscribeTopic(PUBSUB_TOPICS.CANDIDATE_SEARCH, handleCandidateSearch);
subscribeTopic(PUBSUB_TOPICS.CANDIDATE_ENRICHMENT, handleCandidateEnrichment);
subscribeTopic(PUBSUB_TOPICS.CANDIDATE_DIRECTORY_REFRESH, handleDirectoryRefresh);
subscribeTopic(PUBSUB_TOPICS.CSV_EXPORT, handleCsvExport);

app.listen(env.WORKERS_PORT, () => {
  log('INFO', `[workers] listening on port ${env.WORKERS_PORT}`);
});
