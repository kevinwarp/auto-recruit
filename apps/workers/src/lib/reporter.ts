import { ErrorReporting } from '@google-cloud/error-reporting';
import { loadEnv } from '@auto-recruit/config';

let _client: ErrorReporting | null = null;

function getClient(): ErrorReporting | null {
  const env = loadEnv();
  if (env.NODE_ENV !== 'production') return null;
  if (!_client) {
    _client = new ErrorReporting({
      projectId: env.GCP_PROJECT_ID,
      reportUnhandledRejections: true,
      serviceContext: {
        service: 'workers',
        version: process.env['K_REVISION'] ?? 'local',
      },
    });
  }
  return _client;
}

/**
 * Reports an error to GCP Error Reporting (prod) or structured console (dev).
 * @param err   The thrown value
 * @param ctx   Optional context labels included in the log/report (handler name, job ID, etc.)
 */
export function reportError(err: unknown, ctx?: Record<string, string>): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const client = getClient();

  if (client) {
    client.report(error);
  } else {
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: error.message,
        stack: error.stack,
        ...ctx,
      }),
    );
  }
}

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
