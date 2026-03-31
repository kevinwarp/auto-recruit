import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler, AppError } from './middleware/error.js';
import { requestLogger } from './middleware/request-logger.js';
import { companyListsRouter } from './routes/company-lists.js';
import { searchJobsRouter } from './routes/search-jobs.js';
import { enrichmentRouter } from './routes/enrichment.js';
import { outreachRouter } from './routes/outreach.js';
import { candidatesRouter } from './routes/candidates.js';
import { templatesRouter } from './routes/templates.js';
import { senderAccountsRouter } from './routes/sender-accounts.js';

export function createApp() {
  const app = express();

  // ── Observability (first — captures all requests) ────────────────────────────
  app.use(requestLogger);

  // ── Security ────────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: process.env['WEB_URL'] ?? 'http://localhost:3000',
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // ── Body parsing ────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => res.json({ status: 'ready' }));

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use('/api/company-lists', companyListsRouter);
  app.use('/api/search-jobs', searchJobsRouter);
  app.use('/api/candidates', candidatesRouter);
  app.use('/api/enriched', enrichmentRouter);
  app.use('/api/outreach', outreachRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/sender-accounts', senderAccountsRouter);

  // ── 404 — must come after all routes ────────────────────────────────────────
  app.use((_req, _res, next) => {
    next(new AppError(404, 'Route not found'));
  });

  // ── Error handler (must be last) ────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}
