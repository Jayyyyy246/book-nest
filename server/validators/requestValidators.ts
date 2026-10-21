/**
 * Request validation and sanitization helpers for BookNest API routes.
 */

export function parsePagination(
  rawPage: unknown,
  rawLimit: unknown,
  defaultLimit: number = 20,
  maxLimit: number = 100
): { page: number; limit: number; offset: number } {
  const parsedPage = typeof rawPage === 'string' ? parseInt(rawPage, 10) : Number(rawPage);
  const parsedLimit = typeof rawLimit === 'string' ? parseInt(rawLimit, 10) : Number(rawLimit);

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
  const limitCandidate = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : defaultLimit;
  const limit = Math.min(limitCandidate, maxLimit);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

export function sanitizeSearchQuery(query: unknown): string {
  if (typeof query !== 'string') return '';
  return query.trim().slice(0, 150);
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function cleanIsbn(isbn: unknown): string {
  if (typeof isbn !== 'string') return '';
  return isbn.replace(/[-\s]/g, '').toUpperCase();
}

export function isValidIsbn(isbn: unknown): boolean {
  const cleaned = cleanIsbn(isbn);
  return cleaned.length === 10 || cleaned.length === 13;
}
