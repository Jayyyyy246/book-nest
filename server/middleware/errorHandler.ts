import express from 'express';
import { config } from '../config/index.js';
import { AppError } from '../errors/AppError.js';

/**
 * Centralized express error handler middleware.
 * Sanitizes errors in production while returning actionable error messages
 * and preserving strict HTTP status contracts.
 */
export const errorHandler: express.ErrorRequestHandler = (
  err: any,
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: express.NextFunction
) => {
  // 1. Payload size limit exceeded (e.g. body-parser 413)
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({
      error: 'Request payload exceeds maximum allowed size.'
    });
  }

  // 2. Malformed JSON payload in request body
  if (err instanceof SyntaxError && ((err as any).status === 400 || (err as any).statusCode === 400) && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON payload in request body.'
    });
  }

  // 3. Known Operational AppError
  if (err instanceof AppError) {
    const responseBody: Record<string, unknown> = {
      error: err.message
    };
    if (err.details !== undefined) {
      responseBody.details = err.details;
    }
    return res.status(err.statusCode).json(responseBody);
  }

  // 4. Custom error with HTTP status attached
  const status = Number(err.status || err.statusCode) || 500;
  if (status < 500) {
    return res.status(status).json({
      error: err.message || 'Request failed'
    });
  }

  // 5. Unhandled / Programmer Error (Log internally, sanitize for client)
  console.error(`[API Internal Error] ${req.method} ${req.url}:`, err.stack || err.message || err);

  const isProd = config.nodeEnv === 'production';
  return res.status(500).json({
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error')
  });
};
