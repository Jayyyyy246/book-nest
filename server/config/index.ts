import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const isTestEnv = (process.env.NODE_ENV || '').toLowerCase() === 'test';
const rawDbPath = process.env.DB_PATH?.trim();

let resolvedDbPath: string;
if (rawDbPath) {
  resolvedDbPath = path.resolve(process.cwd(), rawDbPath);
} else if (isTestEnv) {
  resolvedDbPath = path.resolve(process.cwd(), 'data', 'booknest.test.db');
} else {
  resolvedDbPath = path.resolve(process.cwd(), 'data', 'booknest.db');
}

// Safety check: ensure test environment never points to development database
if (isTestEnv && path.normalize(resolvedDbPath) === path.normalize(path.resolve(process.cwd(), 'data', 'booknest.db'))) {
  throw new Error('[Database Safety Error] Test environment cannot point to the primary development database (data/booknest.db). Please set DB_PATH to an isolated database path (e.g. data/booknest.test.db).');
}

const resolvedDataDir = path.dirname(resolvedDbPath);

export function resolveJwtSecret(env: string = process.env.NODE_ENV || 'development'): string {
  const normalizedEnv = env.toLowerCase();
  const isProd = normalizedEnv === 'production';
  const isTest = normalizedEnv === 'test';
  const rawSecret = process.env.JWT_SECRET ? process.env.JWT_SECRET.trim() : '';

  const INSECURE_DEFAULTS = [
    'booknest-campus-secure-token-2026',
    'secret',
    'jwt_secret',
    'changeme',
    'password'
  ];

  if (isProd) {
    if (!rawSecret) {
      throw new Error('[Configuration Error] Missing JWT_SECRET in production. Set a strong secret (at least 32 characters) in the environment.');
    }
    if (rawSecret.length < 32) {
      throw new Error('[Configuration Error] Insecure JWT_SECRET in production. Secret must be at least 32 characters long.');
    }
    if (INSECURE_DEFAULTS.includes(rawSecret.toLowerCase())) {
      throw new Error('[Configuration Error] Insecure JWT_SECRET in production. Default fallback secret cannot be used in production.');
    }
    return rawSecret;
  }

  if (isTest) {
    return rawSecret || 'booknest-isolated-test-jwt-secret-key-32-chars-min';
  }

  // Development environment
  if (rawSecret) {
    return rawSecret;
  }

  return 'booknest-campus-secure-token-2026';
}

const currentEnv = process.env.NODE_ENV || 'development';
const validatedJwtSecret = resolveJwtSecret(currentEnv);

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: validatedJwtSecret,
  jwtExpiresIn: '7d',
  nodeEnv: currentEnv,
  dataDir: resolvedDataDir,
  dbPath: resolvedDbPath,
  uploadLimit: process.env.UPLOAD_LIMIT || '15mb',
  openLibraryBaseUrl: process.env.OPENLIBRARY_BASE_URL || 'https://openlibrary.org/api/books',
  openLibrarySearchUrl: process.env.OPENLIBRARY_SEARCH_URL || 'https://openlibrary.org/search.json',
  defaultPageLimit: 50,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY ? (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' ? true : process.env.TRUST_PROXY) : false,
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || '',
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '15', 10),
  authRateLimitWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  aiRateLimitMax: parseInt(process.env.AI_RATE_LIMIT_MAX || '20', 10),
  aiRateLimitWindowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  scannerRateLimitMax: parseInt(process.env.SCANNER_RATE_LIMIT_MAX || '30', 10),
  scannerRateLimitWindowMs: parseInt(process.env.SCANNER_RATE_LIMIT_WINDOW_MS || String(60 * 1000), 10),
};

