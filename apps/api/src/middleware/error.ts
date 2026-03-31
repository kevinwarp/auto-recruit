import type { Request, Response, NextFunction } from 'express';
import { reportError } from '../lib/reporter.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    /** If true the error is expected / safe to expose; never reported upstream */
    public isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ── Known operational errors (4xx) ────────────────────────────────────────
  if (err instanceof AppError) {
    // Only report unexpected server-side AppErrors (5xx), not client errors
    if (err.statusCode >= 500) {
      reportError(err, req);
    }
    res.status(err.statusCode).json({
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      correlationId: req.correlationId,
    });
    return;
  }

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (
    err != null &&
    typeof err === 'object' &&
    'name' in err &&
    (err as { name: unknown }).name === 'ZodError'
  ) {
    res.status(422).json({
      message: 'Validation error',
      errors: (err as unknown as { errors: unknown }).errors,
      correlationId: req.correlationId,
    });
    return;
  }

  // ── Unexpected errors (5xx) — always report ────────────────────────────────
  reportError(err, req);
  res.status(500).json({
    message: 'Internal server error',
    correlationId: req.correlationId,
  });
}
