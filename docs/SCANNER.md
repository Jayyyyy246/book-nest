# BookNest Deterministic Optical Scanner Documentation

## 1. Overview & Core Philosophy

The BookNest Scanner is a deterministic optical book and barcode identification system. Unlike previous mock prototypes, **the scanner never simulates recognition**. 

- **Zero Fake Recognition**: It never selects a random book, never generates hardcoded confidence scores (e.g. "99.4%"), and never fabricates OCR text sequences or prices.
- **Strict Mode Separation**:
  1. `REAL CAMERA`: Interacts with hardware camera devices via `navigator.mediaDevices.getUserMedia`.
  2. `REAL IMAGE UPLOAD`: Processes user-uploaded image files (`.jpg`, `.jpeg`, `.png`, `.webp`).
  3. `DEMO SAMPLE`: Explicitly labelled preset catalog demonstrations. Samples are clearly marked with `DEMO` badges and note that hardware vision is bypassed.
- **Deterministic Fallback Pipeline**:
  1. Browser `BarcodeDetector` when available.
  2. Captured/uploaded image sent to backend vision OCR.
  3. Backend vision/OCR extracts ISBN if visible.
  4. If ISBN is unavailable, extracts title + author from cover.
  5. Matches title/author against local warehouse catalog.
  6. If local catalog has no match, queries OpenLibrary metadata archive.
  7. Returns an honest "BOOK IDENTIFIED — NOT IN LOCAL STOCK" result instead of pretending no book exists.

---

## 2. Scanner Architecture & Pipeline

```text
                     [ USER INPUT ]
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
    REAL CAMERA                         IMAGE UPLOAD
  (MediaDevices API)                 (JPG/PNG/WEBP < 10MB)
  Ideal Environment                   Strict Type & Size
         │                                   │
         ▼                                   ▼
   Live Preview &                      Image Preview &
   Frame Capture (videoReady >= 2)     "Use This Image"
         │                                   │
         └─────────────────┬─────────────────┘
                           │
                           ▼
                  IMAGE PREPROCESSING
                           │
                           ▼
               BARCODE / ISBN DETECTION
             (Web BarcodeDetector API)
             Checksum: ISBN-10 / ISBN-13
                           │
            ┌──────────────┴──────────────┐
            ▼ [Barcode Detected]          ▼ [No Barcode]
   LOCAL / OPENLIBRARY LOOKUP      GEMINI MACHINE VISION OCR
   (1. Warehouse Catalog           (Prompt: title, author, publisher,
    2. OpenLibrary Fallback)        isbn, rawTextLines, isBook)
            │                             │
            │                             ▼
            │                   LOCAL CATALOG MATCHING
            │                   (Jaccard, Dice, Levenshtein, Subtitles)
            │                             │
            │              ┌──────────────┴──────────────┐
            │              ▼ [Local Match]               ▼ [No Local Match]
            │       LOCAL CATALOG MATCH           OPENLIBRARY SEARCH
            │     Confidence >= 0.80              (Query: title + author)
            │              │                             │
            └──────────────┼─────────────────────────────┘
                           │
                           ▼
                    RESULT EVALUATION
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
 [BOOK FOUND]    [NOT IN LOCAL STOCK]    [POSSIBLE MATCHES]
  Local warehouse  OpenLibrary verified    Multiple candidates
  Stock > 0        Stock = 0, Honest info  User selection
       │                   │                   │
       ▼                   ▼                   ▼
 [TEXT UNCLEAR]  [NO BOOK DETECTED]   [VISION UNCONFIGURED]
  Blurry cover    Non-book image       Missing GEMINI_API_KEY
```

---

## 3. Identification & Matching Engine (`server/services/scannerMatcher.ts`)

### Bi-directional ISBN-10 ↔ ISBN-13 Conversion & Checksum Algorithms
- **ISBN-13 / EAN-13**: Strips spaces and hyphens. Validates checksum using Modulo 10 with alternating weights of 1 and 3:
  $$\left(10 - \left(\sum_{i=1}^{12} d_i \times (1 \text{ or } 3)\right) \pmod{10}\right) \pmod{10} = d_{13}$$
- **ISBN-10**: Validates checksum using Modulo 11 with weights 10 down to 1 (with `'X'` representing 10). Automatically converted to ISBN-13 (`978...`) with check digit recalculation.
- **Bi-directional Conversion**: Handles catalog books in ISBN-13 matching input ISBN-10, and catalog books in ISBN-10 matching input ISBN-13 via `isbnsMatch()`.

### Multi-tiered Deterministic Catalog Matching Hierarchy

| Priority | Match Type | Condition | Calculated Confidence | Evidence Output |
|---|---|---|---|---|
| **1** | `ISBN_EXACT` | Scanned ISBN matches catalog ISBN directly or converted | `1.0` (100%) | `"Deterministic 100% match on catalog ISBN"` |
| **2** | `TITLE_AUTHOR_EXACT` | Extracted title and author match catalog entry | `0.95 – 0.98` | `"Exact match for title [Title] and author [Author]"` |
| **3** | `TITLE_SIMILAR` | Title similarity $\ge 0.75$ (author omitted or partial) | `0.75 – 0.92` | `"High title similarity with catalog entry"` |
| **4** | `TITLE_AUTHOR_PARTIAL` | Both title & author similarity $\ge 0.50$ | `0.50 – 0.74` | Added to candidates list for user verification |
| **5** | `EXTERNAL_TITLE_MATCH` | No local match, but identified via OpenLibrary archive | `0.85` | `"Identified via OpenLibrary external archive"` |
| **6** | `NO_MATCH` | No titles exceed 0.50 similarity threshold | `0.0` (0%) | Transparently displays detected OCR text readout |

---

## 4. Hardware Camera Lifecycle & MediaDevices

1. **Explicit User Interaction**: `navigator.mediaDevices.getUserMedia` is called **only** when the user clicks `"Start Camera"`.
2. **Mobile Environment Camera**: Configured with `{ facingMode: { ideal: 'environment' } }`. Gracefully falls back to standard video constraint `{ video: true }` if device constraints fail.
3. **High-Resolution Frame Capture**: Captures video frame to `<canvas>` using actual `videoWidth` and `videoHeight` (preserving aspect ratio without upscaling), only after `video.readyState >= 2`, at JPEG quality `0.95`.
4. **Stale State Bug Fix**: Uses `useRef<ScannerState>('idle')` synchronized with React state to ensure real-time interval callbacks check active state without stale closures.
5. **Track Cleanup**: Clears intervals and stops all `MediaStream` tracks on view unmount, camera stop, retake, or error.

---

## 5. Security & Vision Service Configuration

- **Environment Verification**: Backend verifies `GEMINI_API_KEY` before processing. If unconfigured, returns `503 Service Unavailable` with `matchType: "VISION_CONFIGURATION_ERROR"` and an honest error message. Never exposes API keys.
- **No Fabricated Metadata**: When books are retrieved from external sources (OpenLibrary), fields not provided (price, rating, publisher, pages) are set to `0` or empty strings. Stock is explicitly marked `0` with `isLocalCatalog: false`.
- **Upload Validation**: Restricts MIME types to `image/jpeg`, `image/png`, `image/webp`. Enforces strict 10MB payload ceiling.

---

## 6. The 9 Distinct Result States

The scanner UI cleanly differentiates between 9 dedicated result states:

1. `BOOK FOUND`: Book identified in local catalog with active stock. Active "Add to Bag" button.
2. `BOOK IDENTIFIED — NOT IN LOCAL STOCK`: Book identified via OpenLibrary or catalog with 0 stock. Displays honest external notice, disables Add to Bag.
3. `POSSIBLE MATCHES`: Ambiguous title/author matches (3–5 books) with confidence badges and "Select" buttons.
4. `BOOK COVER DETECTED — TEXT UNCLEAR`: Vision engine detected a book, but printed text was blurry or obscured.
5. `NO BOOK DETECTED`: Image does not depict a book cover, spine, or barcode.
6. `VISION SERVICE NOT CONFIGURED`: Server lacks `GEMINI_API_KEY`. Provides manual search guidance.
7. `CAMERA PERMISSION DENIED`: User or browser blocked camera access. Provides instant photo upload fallback.
8. `CAMERA NOT AVAILABLE`: Device hardware has no camera or device is in use by another program.
9. `INVALID IMAGE`: Uploaded file has unsupported format or exceeds 10MB.

### Optical Vision Readout (Debug HUD)
Whenever text is detected from an image, the UI presents an optical diagnostic readout displaying:
- Detected title
- Detected author
- Detected ISBN
- Detected publisher
- Extraction notes

---

## 7. Automated Test Suite (`scripts/test-scanner.mjs`)

The test suite validates 16 real end-to-end scenarios covering all requirements:

| # | Test Scenario | Verification Criteria | Status |
|---|---|---|---|
| **1** | Known ISBN (`9780132350884`) | Returns 200 OK, `ISBN_EXACT`, confidence 1.0, Clean Code, local stock | ✅ PASS |
| **2** | Unknown ISBN (`9780000000002`) | Returns 404 Not Found, `matched: false`, honest error | ✅ PASS |
| **3** | ISBN-10 (`0132350882`) | Returns 200 OK, converts to ISBN-13, matches Clean Code | ✅ PASS |
| **4** | ISBN-13 (`9780735211292`) | Returns 200 OK, matches Atomic Habits | ✅ PASS |
| **5** | Title-Only Match (`Atomic Habits`) | Returns 200 OK, confidence $\ge 0.85$, identifies book without author | ✅ PASS |
| **6** | Title + Author Match (`Clean Code`) | Returns 200 OK, `TITLE_AUTHOR_EXACT`, confidence $\ge 0.95$ | ✅ PASS |
| **7** | Unknown Title | Returns 200 OK, `matched: false`, confidence 0, no book invented | ✅ PASS |
| **8** | OCR Title without ISBN | Matches Pragmatic Programmer from title without ISBN | ✅ PASS |
| **9** | OCR Title + Partial Author | Tolerates OCR noise and partial author names | ✅ PASS |
| **10** | OpenLibrary External ISBN | Matches Crime & Punishment (`9780140449136`), `isLocalCatalog: false`, stock 0 | ✅ PASS |
| **11** | Unsupported Image Format | Rejects GIF with status 400 | ✅ PASS |
| **12** | Gemini Unavailable | Returns status 503, `VISION_CONFIGURATION_ERROR` | ✅ PASS |
| **13** | Blank Image | Returns 404 (or 503), `matched: false` | ✅ PASS |
| **14** | BarcodeDetector Unavailable | Simulates browser without BarcodeDetector, validates graceful fallback | ✅ PASS |
| **15** | Try Scanner Demo Mode | Displays explicit `DEMO SAMPLE` badge | ✅ PASS |
| **16** | Camera Permission Denied | Simulates `NotAllowedError`, verifies `CAMERA PERMISSION DENIED` state | ✅ PASS |

To run the verification suite:
```bash
node scripts/test-scanner.mjs
```
