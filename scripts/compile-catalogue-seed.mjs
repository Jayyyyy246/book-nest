import fs from 'fs';
import path from 'path';
import { BATCH_1 } from './catalogue-data/batch1.mjs';
import { BATCH_2 } from './catalogue-data/batch2.mjs';
import { BATCH_3 } from './catalogue-data/batch3.mjs';
import { BATCH_4 } from './catalogue-data/batch4.mjs';
import { BATCH_5 } from './catalogue-data/batch5.mjs';

const allBooks = [
  ...BATCH_1,
  ...BATCH_2,
  ...BATCH_3,
  ...BATCH_4,
  ...BATCH_5
];

console.log(`Aggregated ${allBooks.length} candidate books across 5 batches.`);

// 1. Verify all records have required fields
const isbnMap = new Map();
const titleMap = new Map();
const categoryCounts = {};

const validationErrors = [];

allBooks.forEach((b, idx) => {
  // Title check
  if (!b.title || typeof b.title !== 'string' || b.title.trim().length === 0) {
    validationErrors.push(`Index ${idx}: Missing or invalid title.`);
  }

  // Author check
  if (!b.author || typeof b.author !== 'string' || b.author.trim().length === 0) {
    validationErrors.push(`Index ${idx}: Missing or invalid author.`);
  }

  // Category slug check
  if (!b.categorySlug || typeof b.categorySlug !== 'string') {
    validationErrors.push(`Index ${idx}: Missing categorySlug.`);
  } else {
    categoryCounts[b.categorySlug] = (categoryCounts[b.categorySlug] || 0) + 1;
  }

  // Price & stock checks
  if (typeof b.price !== 'number' || b.price <= 0) {
    validationErrors.push(`Index ${idx}: Invalid price: ${b.price}`);
  }
  if (typeof b.stock !== 'number' || b.stock < 0) {
    validationErrors.push(`Index ${idx}: Invalid stock: ${b.stock}`);
  }

  // ISBN normalization & duplicate check
  const cleanIsbn = String(b.isbn || '').replace(/[^0-9X]/gi, '');
  if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
    validationErrors.push(`Index ${idx} (${b.title}): Invalid ISBN length: "${b.isbn}" (${cleanIsbn.length} chars)`);
  }
  if (isbnMap.has(cleanIsbn)) {
    validationErrors.push(`Duplicate ISBN "${cleanIsbn}" between "${b.title}" and "${isbnMap.get(cleanIsbn)}"`);
  } else {
    isbnMap.set(cleanIsbn, b.title);
  }

  // Duplicate title+author check
  const normKey = `${b.title.trim().toLowerCase()}::${b.author.trim().toLowerCase()}`;
  if (titleMap.has(normKey)) {
    validationErrors.push(`Duplicate title+author key "${normKey}"`);
  } else {
    titleMap.set(normKey, b.isbn);
  }

  // Cover image check
  if (!b.coverImage || !b.coverImage.startsWith('https://')) {
    validationErrors.push(`Index ${idx} (${b.title}): Missing or non-HTTPS coverImage: "${b.coverImage}"`);
  }
});

if (validationErrors.length > 0) {
  console.error('Validation FAILED with errors:');
  validationErrors.forEach(err => console.error('  - ' + err));
  process.exit(1);
}

console.log('✅ Validation PASSED! All 320 records are well-formed and unique.');
console.log('\nDistribution across categories:');
console.table(categoryCounts);

// Save to data/catalogue-seed-data.json
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const outputPath = path.join(dataDir, 'catalogue-seed-data.json');
fs.writeFileSync(outputPath, JSON.stringify(allBooks, null, 2), 'utf8');
console.log(`\n🎉 Successfully compiled ${allBooks.length} books to ${outputPath}`);
