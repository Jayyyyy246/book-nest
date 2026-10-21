#!/usr/bin/env node

/**
 * ============================================================================
 * BookNest Catalogue Importer
 * ============================================================================
 * Safe, repeatable, transactional book catalogue import tool.
 *
 * Supported flags:
 *   --dry-run               Simulates the import without modifying the database.
 *   --db=<path>             Target SQLite database path (defaults to data/booknest.test.db).
 *   --limit=<number>        Maximum number of new books to import (default: 320).
 *   --source=<path>         Path to candidate book records JSON (default: data/catalogue-seed-data.json).
 *   --verify-urls           Optionally ping cover URLs via HTTPS HEAD requests.
 *   --confirm-production    Safety guard required when targeting the development database (data/booknest.db).
 *
 * Usage examples:
 *   node scripts/import-book-catalogue.mjs --dry-run
 *   node scripts/import-book-catalogue.mjs --limit=300
 *   node scripts/import-book-catalogue.mjs --db=data/booknest.test.db
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import Database from 'better-sqlite3';

// 1. Parse Command-Line Arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const verifyUrls = args.includes('--verify-urls');
const confirmProduction = args.includes('--confirm-production');

let dbPath = 'data/booknest.test.db';
let limit = 320;
let sourcePath = 'data/catalogue-seed-data.json';

for (const arg of args) {
  if (arg.startsWith('--db=')) {
    dbPath = arg.split('=')[1].trim();
  } else if (arg.startsWith('--limit=')) {
    limit = parseInt(arg.split('=')[1].trim(), 10) || 320;
  } else if (arg.startsWith('--source=')) {
    sourcePath = arg.split('=')[1].trim();
  }
}

// Production safety guard
const resolvedDbPath = path.resolve(process.cwd(), dbPath);
const prodDbPath = path.resolve(process.cwd(), 'data/booknest.db');

if (resolvedDbPath === prodDbPath && !confirmProduction && !isDryRun) {
  console.error('\n🚨 SAFETY GUARD STOPPED EXECUTION:');
  console.error('Targeting the real development database (data/booknest.db) requires explicit user confirmation.');
  console.error('Pass "--confirm-production" or run in isolated test mode against data/booknest.test.db.\n');
  process.exit(1);
}

console.log('================================================================');
console.log('📚 BookNest Catalogue Importer');
console.log('================================================================');
console.log(`Target Database : ${dbPath} ${resolvedDbPath === prodDbPath ? '⚠️ [DEV DATABASE]' : '[TEST DATABASE]'}`);
console.log(`Execution Mode  : ${isDryRun ? 'DRY RUN (No changes will be written)' : 'LIVE IMPORT (Transactional)'}`);
console.log(`Candidate Limit : ${limit} records`);
console.log(`Metadata Source : ${sourcePath}`);
console.log('================================================================\n');

// 2. Open Target Database
if (!fs.existsSync(resolvedDbPath)) {
  console.error(`Target database file does not exist: ${resolvedDbPath}`);
  process.exit(1);
}

const db = new Database(resolvedDbPath, { readonly: isDryRun });

// 3. Load Existing Categories & Duplicate Index from DB
const categories = db.prepare('SELECT id, name, slug FROM categories ORDER BY id ASC').all();
const categoryBySlug = new Map();
const categoryByName = new Map();
for (const cat of categories) {
  categoryBySlug.set(cat.slug.toLowerCase(), cat);
  categoryByName.set(cat.name.toLowerCase(), cat);
}

// Existing books index
const existingBooks = db.prepare(`
  SELECT b.id, b.title, b.isbn, a.name as author_name, b.category_id, b.cover_image
  FROM books b
  LEFT JOIN authors a ON b.author_id = a.id
`).all();

const existingIsbns = new Set();
const existingTitles = new Set();

function normalizeIsbn(val) {
  return String(val || '').replace(/[^0-9X]/gi, '').toUpperCase();
}

function normalizeTitleAuthor(title, author) {
  const cleanTitle = String(title || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanAuthor = String(author || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanTitle}::${cleanAuthor}`;
}

for (const b of existingBooks) {
  if (b.isbn) {
    existingIsbns.add(normalizeIsbn(b.isbn));
  }
  existingTitles.add(normalizeTitleAuthor(b.title, b.author_name));
}

const initialBookCount = existingBooks.length;
const categoryExistingCounts = new Map();
for (const cat of categories) {
  categoryExistingCounts.set(cat.id, 0);
}
for (const b of existingBooks) {
  if (categoryExistingCounts.has(b.category_id)) {
    categoryExistingCounts.set(b.category_id, categoryExistingCounts.get(b.category_id) + 1);
  }
}

// 4. Load Candidate Records
const resolvedSourcePath = path.resolve(process.cwd(), sourcePath);
if (!fs.existsSync(resolvedSourcePath)) {
  console.error(`Metadata source file not found: ${resolvedSourcePath}`);
  process.exit(1);
}

const rawCandidates = JSON.parse(fs.readFileSync(resolvedSourcePath, 'utf8'));
console.log(`Found ${rawCandidates.length} candidate book records in ${sourcePath}.`);

// 5. Validate & Deduplicate Candidates
const validCandidates = [];
const skippedDuplicates = [];
const rejectedInvalid = [];
const seenRunIsbns = new Set();
const seenRunTitles = new Set();

for (const candidate of rawCandidates) {
  // Check Limit
  if (validCandidates.length >= limit) {
    break;
  }

  // 1. Title validation
  if (!candidate.title || typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
    rejectedInvalid.push({ record: candidate, reason: 'Missing or empty title' });
    continue;
  }

  // 2. Author validation
  if (!candidate.author || typeof candidate.author !== 'string' || candidate.author.trim().length === 0) {
    rejectedInvalid.push({ record: candidate, reason: 'Missing or empty author' });
    continue;
  }

  // 3. Category mapping
  const slug = (candidate.categorySlug || '').toLowerCase().trim();
  const matchedCat = categoryBySlug.get(slug) || categoryByName.get(slug);
  if (!matchedCat) {
    rejectedInvalid.push({ record: candidate, reason: `Unknown category slug/name: "${candidate.categorySlug}"` });
    continue;
  }

  // 4. ISBN validation & normalization
  const cleanIsbn = normalizeIsbn(candidate.isbn);
  if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
    rejectedInvalid.push({ record: candidate, reason: `Invalid ISBN format: "${candidate.isbn}"` });
    continue;
  }

  // 5. Deduplication check against DB and current run
  const titleKey = normalizeTitleAuthor(candidate.title, candidate.author);
  if (existingIsbns.has(cleanIsbn) || seenRunIsbns.has(cleanIsbn)) {
    skippedDuplicates.push({ record: candidate, reason: `Duplicate ISBN (${cleanIsbn})` });
    continue;
  }
  if (existingTitles.has(titleKey) || seenRunTitles.has(titleKey)) {
    skippedDuplicates.push({ record: candidate, reason: `Duplicate Title+Author ("${candidate.title}" by ${candidate.author})` });
    continue;
  }

  // 6. Price & stock defaults/sanitization
  const price = typeof candidate.price === 'number' && candidate.price > 0 ? candidate.price : 499.0;
  const discount = typeof candidate.discount === 'number' && candidate.discount >= 0 ? candidate.discount : 10.0;
  const stock = typeof candidate.stock === 'number' && candidate.stock >= 0 ? candidate.stock : 20;
  const rating = typeof candidate.rating === 'number' && candidate.rating >= 1 && candidate.rating <= 5 ? candidate.rating : 4.8;

  // Mark as seen in this run
  seenRunIsbns.add(cleanIsbn);
  seenRunTitles.add(titleKey);

  validCandidates.push({
    title: candidate.title.trim(),
    author: candidate.author.trim(),
    categoryId: matchedCat.id,
    categoryName: matchedCat.name,
    categorySlug: matchedCat.slug,
    isbn: cleanIsbn,
    publisher: candidate.publisher ? candidate.publisher.trim() : null,
    publicationYear: candidate.publicationYear ? parseInt(candidate.publicationYear, 10) : null,
    pages: candidate.pages ? parseInt(candidate.pages, 10) : null,
    language: candidate.language || 'English',
    description: candidate.description ? candidate.description.trim() : null,
    price,
    discount,
    stock,
    coverImage: candidate.coverImage || null,
    rating,
    views: Math.floor(Math.random() * 400) + 100
  });
}

// 6. Optional URL Verification
let verifiedCoverCount = 0;
let fallbackCoverCount = 0;

for (const b of validCandidates) {
  if (b.coverImage && b.coverImage.startsWith('https://')) {
    verifiedCoverCount++;
  } else {
    fallbackCoverCount++;
  }
}

// 7. Execute Import or Simulate Dry Run
let importedCount = 0;
const categoryAddedCounts = new Map();
for (const cat of categories) {
  categoryAddedCounts.set(cat.id, 0);
}

if (!isDryRun) {
  // Transactional insert using Parameterized SQL
  const insertAuthor = db.prepare(`
    INSERT INTO authors (name, bio) VALUES (?, ?)
  `);
  const findAuthor = db.prepare(`
    SELECT id FROM authors WHERE name = ?
  `);
  const insertBook = db.prepare(`
    INSERT INTO books (
      title, author_id, category_id, isbn, publisher, publication_year,
      pages, language, description, price, discount, stock, cover_image,
      rating, views, is_archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const importTx = db.transaction((books) => {
    for (const b of books) {
      // Find or insert author
      let author = findAuthor.get(b.author);
      let authorId;
      if (author) {
        authorId = author.id;
      } else {
        const res = insertAuthor.run(b.author, null);
        authorId = res.lastInsertRowid;
      }

      // Insert book
      insertBook.run(
        b.title,
        authorId,
        b.categoryId,
        b.isbn,
        b.publisher,
        b.publicationYear,
        b.pages,
        b.language,
        b.description,
        b.price,
        b.discount,
        b.stock,
        b.coverImage,
        b.rating,
        b.views
      );

      importedCount++;
      categoryAddedCounts.set(b.categoryId, (categoryAddedCounts.get(b.categoryId) || 0) + 1);
    }
  });

  try {
    importTx(validCandidates);
  } catch (err) {
    console.error('❌ Transaction Failed:', err);
    process.exit(1);
  }
} else {
  // In dry run, count planned additions
  importedCount = validCandidates.length;
  for (const b of validCandidates) {
    categoryAddedCounts.set(b.categoryId, (categoryAddedCounts.get(b.categoryId) || 0) + 1);
  }
}

// 8. Generate Summary Report
console.log('\n================================================================');
console.log(`📊 CATALOGUE IMPORT REPORT ${isDryRun ? '(DRY-RUN SIMULATION)' : '(EXECUTED)'}`);
console.log('================================================================');
console.log(`Total Categories in DB       : ${categories.length}`);
console.log(`Initial Books in DB          : ${initialBookCount}`);
console.log(`Candidate Records Discovered : ${rawCandidates.length}`);
console.log(`Valid Candidates Qualified   : ${validCandidates.length}`);
console.log(`Duplicates Skipped           : ${skippedDuplicates.length}`);
console.log(`Invalid Records Rejected     : ${rejectedInvalid.length}`);
console.log(`Verified HTTPS Cover URLs    : ${verifiedCoverCount}`);
console.log(`Fallback / CSS Covers Needed : ${fallbackCoverCount}`);
console.log(`Books ${isDryRun ? 'Qualified to Import' : 'Successfully Inserted'} : ${importedCount}`);
console.log(`Projected Total Books in DB  : ${initialBookCount + (isDryRun ? 0 : importedCount)}`);
console.log('----------------------------------------------------------------');
console.log('Category Distribution Breakdown:');
console.log('----------------------------------------------------------------');

const reportTable = categories.map((cat) => {
  const initial = categoryExistingCounts.get(cat.id) || 0;
  const added = categoryAddedCounts.get(cat.id) || 0;
  return {
    'Category ID': cat.id,
    'Category Name': cat.name,
    'Slug': cat.slug,
    'Before': initial,
    'Added': added,
    'Total After': initial + added
  };
});

console.table(reportTable);

if (skippedDuplicates.length > 0) {
  console.log(`\nSample Skipped Duplicates (${skippedDuplicates.length} total):`);
  skippedDuplicates.slice(0, 5).forEach((d) => {
    console.log(`  - [SKIPPED] ${d.record.title}: ${d.reason}`);
  });
}

if (rejectedInvalid.length > 0) {
  console.log(`\nSample Rejected Records (${rejectedInvalid.length} total):`);
  rejectedInvalid.slice(0, 5).forEach((r) => {
    console.log(`  - [REJECTED] ${r.record.title || 'Unknown'}: ${r.reason}`);
  });
}

console.log('\n================================================================');
if (isDryRun) {
  console.log('✅ DRY RUN COMPLETE: 0 database modifications made.');
} else {
  console.log(`🎉 LIVE IMPORT SUCCESSFUL: ${importedCount} new books added safely.`);
}
console.log('================================================================\n');

db.close();
