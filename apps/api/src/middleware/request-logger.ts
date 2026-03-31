import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { loadEnv } from '@auto-recruit/config';

// Augment Express Request so downstream code (error handler, routes) can read
// the correlation ID without casting.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      /** Epoch ms when the request entered the middleware stack */
      startTimeMs: number;
      /** Firebase UID — set by auth middleware after JWT verification */
      userId?: string;
    }
  }
}

const IS_PROD = loadEnv().NODE_ENV === 'production';

// Paths that are too noisy to log every hit
const SKIP_PATHS = new Set(['/health', '/ready']);

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.startTimeMs = Date.now();
  // Honour an upstream correlation ID (Cloud Load Balancer, Cloud Scheduler, etc.)
  req.correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ??
    (req.headers['x-cloud-trace-context'] as string | undefined)?.split('/')[0] ??
    randomUUID();

  // Echo it back so clients can correlate retries / support requests
  res.setHeader('X-Correlation-Id', req.correlationId);

  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  res.on('finish', () => {
    const durationMs = Date.now() - req.startTimeMs;
    const status = res.statusCode;
    const severity = status >= 500 ? 'ERROR' : status >= 400 ? 'WARNING' : 'INFO';

    const entry = {
      severity,
      correlationId: req.correlationId,
      ...(req.userId ? { userId: req.userId } : {}),
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status,
        latency: `${durationMs}ms`,
        userAgent: req.headers['user-agent'] ?? '',
        remoteIp: req.ip,
      },
    };

    if (IS_PROD) {
      // Structured JSON → Cloud Logging parses httpRequest automatically
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
      const reset = '\x1b[0m';
      console.log(
        `${color}${req.method} ${req.originalUrl} ${status}${reset} +${durationMs}ms  [${req.correlationId.slice(0, 8)}]`,
      );
    }
  });

  next();
}
