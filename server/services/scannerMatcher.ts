/**
 * BookNest Scanner Matching & Normalization Engine
 * 
 * Provides deterministic ISBN validation, checksums, string similarity metrics,
 * and multi-tiered catalog matching with genuine calculated confidence scores.
 */

export interface MatchCandidate {
  book: any;
  confidence: number; // 0.0 to 1.0 (calculated)
  matchType: 'ISBN_EXACT' | 'TITLE_AUTHOR_EXACT' | 'TITLE_SIMILAR' | 'TITLE_AUTHOR_PARTIAL';
  evidence: string;
}

export interface MatchResult {
  matched: boolean;
  bestMatch: any | null;
  matchType: 'ISBN_EXACT' | 'TITLE_AUTHOR_EXACT' | 'TITLE_SIMILAR' | 'TITLE_AUTHOR_PARTIAL' | 'NO_MATCH';
  confidence: number; // 0.0 to 1.0
  evidence: string;
  candidates: MatchCandidate[];
  normalizedQuery: {
    isbn?: string;
    title?: string;
    author?: string;
  };
}

/**
 * Strips whitespace, hyphens, and non-alphanumeric characters from an ISBN.
 */
export function normalizeIsbn(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * Validates standard 10-digit ISBN checksum:
 * Sum(d_i * (11 - i)) mod 11 == 0
 */
export function isValidIsbn10(raw: string): boolean {
  const clean = normalizeIsbn(raw);
  if (clean.length !== 10) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (10 - i);
  }

  const lastChar = clean[9];
  const lastVal = lastChar === 'X' ? 10 : parseInt(lastChar, 10);
  if (isNaN(lastVal)) return false;
  sum += lastVal * 1;

  return sum % 11 === 0;
}

/**
 * Validates standard 13-digit ISBN checksum:
 * Sum(d_i * (i % 2 === 0 ? 1 : 3)) mod 10 == 0
 */
export function isValidIsbn13(raw: string): boolean {
  const clean = normalizeIsbn(raw);
  if (clean.length !== 13) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(clean[i], 10);
    if (isNaN(digit)) return false;
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = parseInt(clean[12], 10);
  if (isNaN(checkDigit)) return false;

  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
}

/**
 * Validates whether string is a valid ISBN-10, ISBN-13, or EAN-13.
 */
export function isValidIsbn(raw: string): boolean {
  const clean = normalizeIsbn(raw);
  if (clean.length === 10) return isValidIsbn10(clean);
  if (clean.length === 13) return isValidIsbn13(clean);
  return false;
}

/**
 * Converts valid ISBN-10 to ISBN-13 (adds '978' prefix and recalculates check digit).
 */
export function convertIsbn10To13(isbn10: string): string | null {
  const clean = normalizeIsbn(isbn10);
  if (clean.length !== 10 || !isValidIsbn10(clean)) return null;

  const core = '978' + clean.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return core + checkDigit;
}

/**
 * Normalizes text for string matching:
 * Lowercases, strips punctuation, normalizes spacing, and eliminates common stop words.
 */
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'edition', 'handbook', 'guide']);

export function tokenizeAndClean(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Calculates Token Jaccard Similarity:
 * Intersection(A, B) / Union(A, B)
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(tokenizeAndClean(textA));
  const tokensB = new Set(tokenizeAndClean(textB));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = tokensA.size + tokensB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Calculates Bigram Dice Similarity for character-level typos and OCR degradation:
 * 2 * |Bigrams(A) ∩ Bigrams(B)| / (|Bigrams(A)| + |Bigrams(B)|)
 */
export function calculateBigramDice(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const pair = s1.slice(i, i + 2);
    bigrams1.set(pair, (bigrams1.get(pair) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const pair = s2.slice(i, i + 2);
    const count = bigrams1.get(pair) || 0;
    if (count > 0) {
      bigrams1.set(pair, count - 1);
      intersection++;
    }
  }

  const totalPairs = (s1.length - 1) + (s2.length - 1);
  return (2 * intersection) / totalPairs;
}

/**
 * Combined String Similarity Score:
 * Weighted average of Token Jaccard (60%) and Bigram Dice (40%).
 */
export function calculateCombinedSimilarity(query: string, target: string): number {
  if (!query || !target) return 0;
  const cleanQ = query.trim().toLowerCase();
  const cleanT = target.trim().toLowerCase();

  if (cleanQ === cleanT) return 1.0;
  if (cleanT.includes(cleanQ) || cleanQ.includes(cleanT)) {
    const lengthRatio = Math.min(cleanQ.length, cleanT.length) / Math.max(cleanQ.length, cleanT.length);
    return Math.max(0.85, 0.70 + 0.30 * lengthRatio);
  }

  const jaccard = calculateJaccardSimilarity(query, target);
  const dice = calculateBigramDice(query, target);

  return parseFloat((0.60 * jaccard + 0.40 * dice).toFixed(4));
}

/**
 * Core Matching Function
 * 
 * Priority:
 * 1. Exact ISBN
 * 2. Exact ISBN normalized / converted
 * 3. Exact title + author
 * 4. Strong title similarity (>= 0.75)
 * 5. Title + author partial similarity (>= 0.50)
 * 
 * Never invents a match.
 */
export function matchBookAgainstCatalog(
  input: {
    isbn?: string;
    title?: string;
    author?: string;
    publisher?: string;
    rawTextLines?: string[];
  },
  catalog: any[]
): MatchResult {
  const normIsbn = normalizeIsbn(input.isbn || '');
  const normTitle = (input.title || '').trim();
  const normAuthor = (input.author || '').trim();

  // 1. TIER 1: Exact ISBN Check
  if (normIsbn) {
    // Check direct ISBN
    for (const book of catalog) {
      const bookIsbnClean = normalizeIsbn(book.isbn);
      if (bookIsbnClean === normIsbn) {
        return {
          matched: true,
          bestMatch: book,
          matchType: 'ISBN_EXACT',
          confidence: 1.0,
          evidence: `Deterministic 100% match on catalog ISBN ${book.isbn}.`,
          candidates: [{
            book,
            confidence: 1.0,
            matchType: 'ISBN_EXACT',
            evidence: `Exact ISBN match (${book.isbn})`
          }],
          normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
        };
      }
    }

    // If 10-digit ISBN provided, convert to 13-digit and check
    if (normIsbn.length === 10 && isValidIsbn10(normIsbn)) {
      const converted13 = convertIsbn10To13(normIsbn);
      if (converted13) {
        for (const book of catalog) {
          const bookIsbnClean = normalizeIsbn(book.isbn);
          if (bookIsbnClean === converted13) {
            return {
              matched: true,
              bestMatch: book,
              matchType: 'ISBN_EXACT',
              confidence: 1.0,
              evidence: `Matched ISBN-10 to catalog ISBN-13 (${book.isbn}).`,
              candidates: [{
                book,
                confidence: 1.0,
                matchType: 'ISBN_EXACT',
                evidence: `Converted ISBN-10 (${normIsbn}) to ISBN-13 (${book.isbn})`
              }],
              normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
            };
          }
        }
      }
    }
  }

  // 2. TIER 2: Title and Author Comparison across Catalog
  const candidates: MatchCandidate[] = [];

  for (const book of catalog) {
    let titleSim = 0;
    if (normTitle) {
      titleSim = calculateCombinedSimilarity(normTitle, book.title);
    } else if (input.rawTextLines && input.rawTextLines.length > 0) {
      // If title wasn't cleanly parsed, test against raw OCR lines
      for (const line of input.rawTextLines) {
        const lineSim = calculateCombinedSimilarity(line, book.title);
        if (lineSim > titleSim) {
          titleSim = lineSim;
        }
      }
    }

    let authorSim = 0;
    if (normAuthor) {
      authorSim = calculateCombinedSimilarity(normAuthor, book.author);
    } else if (input.rawTextLines && input.rawTextLines.length > 0) {
      for (const line of input.rawTextLines) {
        const lineSim = calculateCombinedSimilarity(line, book.author);
        if (lineSim > authorSim) {
          authorSim = lineSim;
        }
      }
    }

    // Exact Title + Author Match
    if (titleSim >= 0.95 && authorSim >= 0.85) {
      const score = parseFloat((0.70 * titleSim + 0.30 * authorSim).toFixed(4));
      candidates.push({
        book,
        confidence: Math.min(0.98, score),
        matchType: 'TITLE_AUTHOR_EXACT',
        evidence: `Exact match for title "${book.title}" and author "${book.author}".`
      });
      continue;
    }

    // Strong Title Match
    if (titleSim >= 0.75) {
      const score = normAuthor 
        ? parseFloat((0.75 * titleSim + 0.25 * authorSim).toFixed(4))
        : parseFloat(titleSim.toFixed(4));

      candidates.push({
        book,
        confidence: score,
        matchType: 'TITLE_SIMILAR',
        evidence: `High title similarity (${Math.round(titleSim * 100)}%) with catalog entry "${book.title}".`
      });
      continue;
    }

    // Partial Title + Author Match
    if (titleSim >= 0.50 && authorSim >= 0.50) {
      const score = parseFloat((0.60 * titleSim + 0.40 * authorSim).toFixed(4));
      candidates.push({
        book,
        confidence: score,
        matchType: 'TITLE_AUTHOR_PARTIAL',
        evidence: `Partial title (${Math.round(titleSim * 100)}%) and author (${Math.round(authorSim * 100)}%) similarity.`
      });
      continue;
    }
  }

  // Sort candidates by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Determine outcome
  if (candidates.length === 0) {
    return {
      matched: false,
      bestMatch: null,
      matchType: 'NO_MATCH',
      confidence: 0,
      evidence: normIsbn 
        ? `ISBN ${normIsbn} is valid but not currently indexed in campus warehouse.`
        : 'No catalog titles met the minimum 50% textual similarity threshold.',
      candidates: [],
      normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
    };
  }

  const topMatch = candidates[0];

  // Strong confident match (>= 0.80) with clear lead over second candidate
  const isConfidentSingleMatch = topMatch.confidence >= 0.80 && 
    (candidates.length === 1 || (topMatch.confidence - candidates[1].confidence) >= 0.10);

  return {
    matched: isConfidentSingleMatch,
    bestMatch: isConfidentSingleMatch ? topMatch.book : null,
    matchType: topMatch.matchType,
    confidence: topMatch.confidence,
    evidence: topMatch.evidence,
    candidates: candidates.slice(0, 5), // Top 3 to 5 possible matches
    normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
  };
}
