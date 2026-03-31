/**
 * Error reporter — wraps Google Cloud Error Reporting.
 *
 * In production (NODE_ENV=production) errors are sent to GCP Error Reporting
 * which surfaces them in Cloud Console with stack traces, request context, and
 * automatic grouping.  In dev/test it falls back to structured console output
 * so local runs don't require GCP credentials.
 */

import { ErrorReporting } from '@google-cloud/error-reporting';
import type { Request } from 'express';
import { loadEnv } from '@auto-recruit/config';

let _client: ErrorReporting | null = null;

function getClient(): ErrorReporting | null {
  const env = loadEnv();
  if (env.NODE_ENV !== 'production') return null;
  if (!_client) {
    _client = new ErrorReporting({
      projectId: env.GCP_PROJECT_ID,
      // Cloud Run injects credentials automatically; no explicit key needed.
      reportUnhandledRejections: true,
      serviceContext: {
        service: 'api',
        version: process.env['K_REVISION'] ?? 'local',
      },
    });
  }
  return _client;
}

/**
 * Reports an error to GCP Error Reporting (prod) or console (dev).
 * Pass `req` to include HTTP context (method, URL, user-agent, correlation ID).
 */
export function reportError(err: unknown, req?: Request): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const client = getClient();

  if (client) {
    if (req) {
      client.report(error, req);
    } else {
      client.report(error);
    }
  } else {
    // Structured dev log — mirrors the Cloud Logging JSON format so local logs
    // are easy to grep / parse.
    const entry: Record<string, unknown> = {
      severity: 'ERROR',
      message: error.message,
      stack: error.stack,
    };
    if (req) {
      entry['httpRequest'] = {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        userAgent: req.headers['user-agent'],
      };
      // correlationId is attached by request-logger middleware
      const correlationId = (req as Request & { correlationId?: string }).correlationId;
      if (correlationId) entry['correlationId'] = correlationId;
    }
    console.error(JSON.stringify(entry));
  }
}

/**
 * Lightweight structured logger for non-error events.
 * severity: DEBUG | INFO | WARNING | ERROR | CRITICAL
 */
export function log(
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR',
  message: string,
  fields?: Record<string, unknown>,
): void {
  if (loadEnv().NODE_ENV === 'production') {
    process.stdout.write(JSON.stringify({ severity, message, ...fields }) + '\n');
  } else {
    const prefix = `[${severity.toLowerCase()}]`;
    if (severity === 'ERROR' || severity === 'WARNING') {
      console.error(prefix, message, fields ?? '');
    } else {
      console.log(prefix, message, fields ?? '');
    }
  }
}
