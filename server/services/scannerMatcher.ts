/**
 * BookNest Scanner Matching & Normalization Engine
 * 
 * Provides deterministic ISBN validation, checksums, string similarity metrics,
 * bi-directional ISBN-10/13 conversions, and multi-tiered catalog matching with
 * genuine calculated confidence scores.
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
 * Converts valid ISBN-13 (starting with '978') to ISBN-10.
 */
export function convertIsbn13To10(isbn13: string): string | null {
  const clean = normalizeIsbn(isbn13);
  if (clean.length !== 13 || !isValidIsbn13(clean) || !clean.startsWith('978')) return null;

  const core = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(core[i], 10) * (10 - i);
  }
  const checkVal = (11 - (sum % 11)) % 11;
  const checkChar = checkVal === 10 ? 'X' : String(checkVal);
  return core + checkChar;
}

/**
 * Checks if two ISBNs match directly or via ISBN-10 <-> ISBN-13 conversion.
 */
export function isbnsMatch(isbnA: string, isbnB: string): boolean {
  const cleanA = normalizeIsbn(isbnA);
  const cleanB = normalizeIsbn(isbnB);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;

  if (cleanA.length === 10 && cleanB.length === 13) {
    return convertIsbn10To13(cleanA) === cleanB || convertIsbn13To10(cleanB) === cleanA;
  }
  if (cleanA.length === 13 && cleanB.length === 10) {
    return convertIsbn13To10(cleanA) === cleanB || convertIsbn10To13(cleanB) === cleanA;
  }
  return false;
}

/**
 * Normalizes text for string matching:
 * Lowercases, strips punctuation, normalizes spacing, and eliminates common stop words.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'by',
  'from', 'edition', 'handbook', 'guide', 'volume', 'vol', 'series', 'book'
]);

export function tokenizeAndClean(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Extracts the primary title before subtitles or colons/hyphens.
 */
export function getMainTitle(text: string): string {
  if (!text) return '';
  return text.split(/[:\-\–\—|]/)[0].trim();
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
 * Calculates Levenshtein Distance similarity (0.0 to 1.0)
 * Tolerates single/double character OCR replacement/insertion typos.
 */
export function calculateLevenshteinSimilarity(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const str2 = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (str1 === str2) return 1.0;
  if (!str1.length || !str2.length) return 0.0;

  const m = str1.length;
  const n = str2.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  const distance = d[m][n];
  const maxLen = Math.max(m, n);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Combined String Similarity Score:
 * Considers full title, main title (subtitle stripped), prefix matches,
 * Token Jaccard, Bigram Dice, and Levenshtein distance.
 */
export function calculateCombinedSimilarity(query: string, target: string): number {
  if (!query || !target) return 0;
  const cleanQ = query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanT = target.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (cleanQ === cleanT) return 1.0;

  // Subtitle comparison: test main title before colon / hyphen
  const mainQ = getMainTitle(query).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const mainT = getMainTitle(target).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (mainQ.length >= 4 && mainT.length >= 4) {
    if (mainQ === mainT) return 0.95;
    if (cleanT.startsWith(mainQ) || cleanQ.startsWith(mainT)) {
      return 0.92;
    }
  }

  // Prefix matching for long queries/targets
  if (cleanQ.length >= 6 && cleanT.length >= 6) {
    if (cleanT.startsWith(cleanQ) || cleanQ.startsWith(cleanT)) {
      const lengthRatio = Math.min(cleanQ.length, cleanT.length) / Math.max(cleanQ.length, cleanT.length);
      return Math.max(0.88, 0.75 + 0.20 * lengthRatio);
    }
  }

  const jaccard = calculateJaccardSimilarity(query, target);
  const dice = calculateBigramDice(query, target);
  const lev = calculateLevenshteinSimilarity(query, target);

  // Weighted average: Jaccard (40%), Dice (30%), Levenshtein (30%)
  const score = 0.40 * jaccard + 0.30 * dice + 0.30 * lev;
  return parseFloat(score.toFixed(4));
}

/**
 * Core Matching Function
 * 
 * Priority:
 * 1. Exact ISBN (direct or ISBN-10 <-> ISBN-13 converted)
 * 2. Exact title + author (or high title + author similarity)
 * 3. Title-only match when author is missing or author not detected
 * 4. Raw OCR line search across title and author
 * 5. Deterministic candidate ranking
 * 
 * Never invents a book.
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

  // 1. TIER 1: Exact ISBN Check (Highest Deterministic Priority)
  if (normIsbn) {
    for (const book of catalog) {
      if (isbnsMatch(book.isbn, normIsbn)) {
        const isConverted = normalizeIsbn(book.isbn) !== normIsbn;
        const evidence = isConverted
          ? `Deterministic 100% match via ISBN-10 <-> ISBN-13 conversion (${normIsbn} ↔ ${book.isbn}).`
          : `Deterministic 100% match on catalog ISBN ${book.isbn}.`;

        return {
          matched: true,
          bestMatch: book,
          matchType: 'ISBN_EXACT',
          confidence: 1.0,
          evidence,
          candidates: [{
            book,
            confidence: 1.0,
            matchType: 'ISBN_EXACT',
            evidence
          }],
          normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
        };
      }
    }
  }

  // 2. TIER 2: Title and Author Comparison across Catalog
  const candidates: MatchCandidate[] = [];

  for (const book of catalog) {
    // 2a. Determine best title similarity
    let titleSim = 0;
    if (normTitle) {
      titleSim = calculateCombinedSimilarity(normTitle, book.title);
    }

    // Always check raw text lines against catalog title if available
    if (input.rawTextLines && input.rawTextLines.length > 0) {
      for (const line of input.rawTextLines) {
        const lineSim = calculateCombinedSimilarity(line, book.title);
        if (lineSim > titleSim) {
          titleSim = lineSim;
        }
      }
      // Also check 2 consecutive lines combined
      for (let i = 0; i < input.rawTextLines.length - 1; i++) {
        const pair = `${input.rawTextLines[i]} ${input.rawTextLines[i + 1]}`;
        const pairSim = calculateCombinedSimilarity(pair, book.title);
        if (pairSim > titleSim) {
          titleSim = pairSim;
        }
      }
    }

    // 2b. Determine best author similarity
    let authorSim = 0;
    if (normAuthor) {
      authorSim = calculateCombinedSimilarity(normAuthor, book.author);
    }

    if (input.rawTextLines && input.rawTextLines.length > 0) {
      for (const line of input.rawTextLines) {
        const lineSim = calculateCombinedSimilarity(line, book.author);
        if (lineSim > authorSim) {
          authorSim = lineSim;
        }
      }
    }

    // 2c. Evaluate candidate score based on matches

    // CASE A: Strong Title + Author Match
    if (titleSim >= 0.85 && authorSim >= 0.75) {
      const score = parseFloat((0.70 * titleSim + 0.30 * authorSim).toFixed(4));
      candidates.push({
        book,
        confidence: Math.min(0.98, score),
        matchType: 'TITLE_AUTHOR_EXACT',
        evidence: `Exact match for title "${book.title}" and author "${book.author}".`
      });
      continue;
    }

    // CASE B: Strong Title Match
    if (titleSim >= 0.75) {
      if (normAuthor && authorSim >= 0.60) {
        const score = parseFloat((0.70 * titleSim + 0.30 * authorSim).toFixed(4));
        candidates.push({
          book,
          confidence: Math.min(0.95, score),
          matchType: 'TITLE_AUTHOR_EXACT',
          evidence: `Strong match for title "${book.title}" and author "${book.author}".`
        });
      } else if (!normAuthor) {
        // Title-only match when author is missing (BUG 5)
        const score = parseFloat(Math.min(0.92, titleSim * 0.95).toFixed(4));
        candidates.push({
          book,
          confidence: score,
          matchType: 'TITLE_SIMILAR',
          evidence: `High title similarity (${Math.round(titleSim * 100)}%) with catalog entry "${book.title}" (Author omitted/not detected).`
        });
      } else {
        // Author was provided but had lower similarity
        const score = parseFloat((0.80 * titleSim + 0.20 * authorSim).toFixed(4));
        candidates.push({
          book,
          confidence: score,
          matchType: 'TITLE_SIMILAR',
          evidence: `Title similarity (${Math.round(titleSim * 100)}%) with catalog entry "${book.title}".`
        });
      }
      continue;
    }

    // CASE C: Partial Title + Author Match (both >= 0.50)
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

    // CASE D: Moderate Title Match (0.55 to 0.74) for candidates list
    if (titleSim >= 0.55) {
      const score = parseFloat((titleSim * 0.85).toFixed(4));
      candidates.push({
        book,
        confidence: score,
        matchType: 'TITLE_SIMILAR',
        evidence: `Moderate title match (${Math.round(titleSim * 100)}%) with catalog entry "${book.title}".`
      });
      continue;
    }
  }

  // Sort candidates deterministically: confidence descending, then title ascending
  candidates.sort((a, b) => {
    if (Math.abs(b.confidence - a.confidence) > 0.0001) {
      return b.confidence - a.confidence;
    }
    return a.book.title.localeCompare(b.book.title);
  });

  // No candidates met similarity thresholds
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

  // Strong confident match (>= 0.80) with clear lead over second candidate (>= 0.08)
  const isConfidentSingleMatch = topMatch.confidence >= 0.80 &&
    (candidates.length === 1 || (topMatch.confidence - candidates[1].confidence) >= 0.08);

  return {
    matched: isConfidentSingleMatch,
    bestMatch: isConfidentSingleMatch ? topMatch.book : null,
    matchType: topMatch.matchType,
    confidence: topMatch.confidence,
    evidence: topMatch.evidence,
    candidates: candidates.slice(0, 5),
    normalizedQuery: { isbn: normIsbn, title: normTitle, author: normAuthor }
  };
}
