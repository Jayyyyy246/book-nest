import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export interface RateLimitOptions {
  windowMs: number;        // Time window in milliseconds
  max: number;             // Maximum allowed requests per window
  message?: string;        // Error message on limit exceeded
  statusCode?: number;     // HTTP status code (default 429)
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export interface RateLimiterMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
  getHitCount: (key: string) => number;
}

const allLimiters: RateLimiterMiddleware[] = [];

export function resetAllRateLimiters() {
  for (const limiter of allLimiters) {
    limiter.reset();
  }
}

/**
 * Extracts client IP safely: only parses X-Forwarded-For when trust proxy is explicitly configured
 * in Express or config. This prevents trivial rate-limit bypass via spoofed client headers.
 */
export function getClientIp(req: Request): string {
  const isProxyTrusted = Boolean(req.app && req.app.get('trust proxy'));
  if (isProxyTrusted) {
    const rawForwarded = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(rawForwarded) ? rawForwarded[0] : rawForwarded;
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    if (req.ip) return req.ip;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown-client';
}

export function createRateLimiter(options: RateLimitOptions): RateLimiterMiddleware {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    statusCode = 429,
    keyGenerator = (req: Request) => getClientIp(req),
    skip
  } = options;

  const hits = new Map<string, number[]>();

  // Cleanup expired timestamps periodically
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter(ts => now - ts < windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const limiter: RateLimiterMiddleware = Object.assign(
    (req: Request, res: Response, next: NextFunction) => {
      if (skip && skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const now = Date.now();
      let timestamps = hits.get(key) || [];

      // Filter out timestamps outside window
      timestamps = timestamps.filter(ts => now - ts < windowMs);

      const remaining = Math.max(0, max - timestamps.length);
      const resetTime = timestamps.length > 0
        ? Math.ceil((timestamps[0] + windowMs) / 1000)
        : Math.ceil((now + windowMs) / 1000);

      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetTime);

      if (timestamps.length >= max) {
        const retryAfterSeconds = Math.ceil((timestamps[0] + windowMs - now) / 1000);
        res.setHeader('Retry-After', Math.max(1, retryAfterSeconds));
        return res.status(statusCode).json({ error: message });
      }

      timestamps.push(now);
      hits.set(key, timestamps);
      next();
    },
    {
      reset: () => {
        hits.clear();
      },
      getHitCount: (key: string) => {
        const now = Date.now();
        const timestamps = hits.get(key) || [];
        return timestamps.filter(ts => now - ts < windowMs).length;
      }
    }
  );

  allLimiters.push(limiter);
  return limiter;
}

// 1. Authentication Rate Limiter (configurable via AUTH_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_WINDOW_MS)
export const authLimiter = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  statusCode: 429
});

// 2. AI Advisor Rate Limiter (configurable, keyed by authenticated user ID when available to avoid campus NAT lockouts)
export const aiLimiter = createRateLimiter({
  windowMs: config.aiRateLimitWindowMs,
  max: config.aiRateLimitMax,
  message: 'Too many AI recommendation requests. Please try again after 15 minutes.',
  statusCode: 429,
  keyGenerator: (req: Request) => {
    const user = (req as any).user;
    if (user && user.id) {
      return `user_${user.id}`;
    }
    return `ip_${getClientIp(req)}`;
  }
});

// 3. Scanner Rate Limiter (configurable via SCANNER_RATE_LIMIT_MAX / SCANNER_RATE_LIMIT_WINDOW_MS)
export const scannerLimiter = createRateLimiter({
  windowMs: config.scannerRateLimitWindowMs,
  max: config.scannerRateLimitMax,
  message: 'Too many scanner requests. Please slow down and try again in a moment.',
  statusCode: 429
});
