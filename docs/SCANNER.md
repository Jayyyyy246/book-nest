# BookNest Deterministic Optical Scanner Documentation

## 1. Overview & Core Philosophy

The BookNest Scanner is a deterministic optical book and barcode identification system. Unlike previous mock prototypes, **the scanner never simulates recognition**. 

- **Zero Fake Recognition**: It never selects a random book, never generates hardcoded confidence scores (e.g. "99.4%"), and never fabricates OCR text sequences.
- **Strict Mode Separation**:
  1. `REAL CAMERA`: Interacts with hardware camera devices via `navigator.mediaDevices.getUserMedia`.
  2. `REAL IMAGE UPLOAD`: Processes user-uploaded image files (`.jpg`, `.jpeg`, `.png`, `.webp`).
  3. `DEMO SAMPLE`: Explicitly labelled preset catalog demonstrations. Samples are clearly marked with `DEMO` badges and note that hardware vision is bypassed.
- **Deterministic Prioritization**: Barcode and ISBN checksum verification are the primary identification mechanisms. If a barcode is unreadable, machine vision optical character recognition (OCR) extracts text for fuzzy string similarity matching against the catalog.
- **Honest Rejections**: If no catalog title meets similarity thresholds, the system presents `"No exact match found"` and transparently displays what text the camera detected. It never invents a match.

---

## 2. Scanner Architecture & Pipeline

```text
                     [ USER INPUT ]
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
    REAL CAMERA                         IMAGE UPLOAD
  (MediaDevices API)                 (JPG/PNG/WEBP < 10MB)
         │                                   │
         ▼                                   ▼
   Live Preview &                      Image Preview &
   Frame Capture                       "Use This Image"
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
            ▼ [ISBN Detected]             ▼ [No Barcode]
   BOOK METADATA LOOKUP            OCR TITLE/AUTHOR EXTRACTION
 (1. Warehouse DB                  (Google Gemini Vision OCR via
  2. OpenLibrary Fallback)          Server Proxy)
            │                             │
            │                             ▼
            │                   LOCAL CATALOG MATCHING
            │                   (Token Jaccard & Bigram Dice)
            │                             │
            └──────────────┬──────────────┘
                           │
                           ▼
                    RESULT EVALUATION
                           │
      ┌────────────────────┼────────────────────┐
      ▼                    ▼                    ▼
[Single Match]    [Multiple Candidates]    [No Match]
  Confidence >= 0.80   Confidence 0.50-0.79    Confidence < 0.50
  "BOOK FOUND"         "POSSIBLE MATCHES"      "NO MATCH FOUND"
  Genuine Evidence     User Selection          Honest Feedback
```

---

## 3. Identification & Matching Engine (`server/services/scannerMatcher.ts`)

### ISBN Normalization & Checksum Algorithms
- **ISBN-13 / EAN-13**: Strips spaces and hyphens. Validates checksum using Modulo 10 with alternating weights of 1 and 3:
  $$\left(10 - \left(\sum_{i=1}^{12} d_i \times (1 \text{ or } 3)\right) \pmod{10}\right) \pmod{10} = d_{13}$$
- **ISBN-10**: Validates checksum using Modulo 11 with weights 10 down to 1 (with `'X'` representing 10). Automatically converted to ISBN-13 (`978...`) with recalculation of check digit.

### Catalog Matching Hierarchy
The matching engine evaluates inputs against local catalog inventory in strict order of deterministic confidence:

| Priority | Match Type | Condition | Calculated Confidence | Evidence Output |
|---|---|---|---|---|
| **1** | `ISBN_EXACT` | Catalog book ISBN matches normalized scanned ISBN exactly | `1.0` (100%) | `"Deterministic 100% match on catalog ISBN"` |
| **2** | `ISBN_CONVERTED` | Catalog book ISBN matches converted ISBN-10/13 | `1.0` (100%) | `"Deterministic 100% match on converted ISBN-10/13"` |
| **3** | `TITLE_AUTHOR_EXACT` | Extracted title and author match catalog entry exactly | `0.95` (95%) | `"Exact match on title and author"` |
| **4** | `TITLE_SIMILAR` | Token Jaccard + Bigram Dice similarity $\ge 0.75$ | `0.75 – 0.92` | `"Strong title similarity: [Title]"` |
| **5** | `PARTIAL_CANDIDATE` | Similarity between $0.50$ and $0.74$ | `0.50 – 0.74` | Added to candidates list for user verification |
| **6** | `NO_MATCH` | No titles exceed 0.50 similarity | `0.0` (0%) | `"We couldn't confidently identify this textbook"` |

---

## 4. Hardware Camera Lifecycle & MediaDevices

The camera implementation adheres to modern browser security and performance guidelines:

1. **Explicit User Interaction**: `navigator.mediaDevices.getUserMedia` is called **only** when the user clicks `"Start Camera"`. No permission prompts are launched automatically.
2. **Mobile Environment Camera**: Configured with `{ facingMode: { ideal: 'environment' } }` to default to the rear camera on mobile devices.
3. **Capture Frame Review**: Users capture a video frame to a high-resolution off-screen `<canvas>`. The review HUD displays `"Use This Image"` and `"Retake"` buttons before running network recognition.
4. **Track Cleanup**: All `MediaStream` video tracks are explicitly stopped (`track.stop()`) on:
   - View unmount / navigation away from the scanner
   - Explicit `"Stop"` button click
   - Retake action
   - Camera initialization error
5. **Robust Error Handling**:
   - `NotAllowedError`: Displays `"Camera permission was denied. Please allow camera access in your browser settings, or use image upload below."`
   - `NotFoundError`: Displays `"No camera hardware found on this device. Please upload a book cover photo instead."`
   - Unhandled exceptions display an alert with an instant fallback `"Upload Cover Photo Instead"` button.

---

## 5. Security & Machine Vision Privacy

- **No Exposed API Keys**: Google Gemini Vision API calls are strictly handled by the backend Express server (`server/routes/scanner.ts`). No Google GenAI API keys are exposed to the client bundle.
- **Upload Validation**:
  - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Other types (e.g. GIF, SVG) are rejected with HTTP 400.
  - Maximum upload size: 10MB payload ceiling. Empty uploads or corrupt payloads are rejected.
- **Vision OCR Prompting**: The server-side Gemini prompt instructs the model to return **only** visible text lines without guessing or hallucinating missing fields.

---

## 6. Scanner State Machine

The interface implements an explicit 12-state deterministic state machine:

| State | Description | User Interface |
|---|---|---|
| `idle` | Waiting for user interaction | Viewfinder placeholder, Start Camera, Upload Photo, Manual ISBN input |
| `camera-starting` | Requesting browser media stream | Loading spinner, camera request HUD |
| `camera-ready` | Live video feed active | Real-time video preview, laser targeting reticle, Capture button |
| `captured` | Freeze frame captured | Captured frame preview, "Use This Image", "Retake" buttons |
| `processing` | Client barcode analysis | Scanning animation HUD |
| `isbn-detected` | Barcode extracted | Displaying ISBN vector badge |
| `ocr-processing` | Running machine vision OCR | Vision OCR processing badge |
| `searching` | Querying warehouse catalog | Candidate database lookup badge |
| `matched` | Confident single book identified | **BOOK FOUND** card with cover, pricing, stock, Add to Bag, Details |
| `multiple-matches` | Ambiguous title matches (3–5 books) | **POSSIBLE MATCHES** list with confidence chips & Select buttons |
| `no-match` | No confident catalog match | **NO MATCH FOUND** card, camera readout feedback, Try Again button |
| `error` | Camera denied or upload failure | Error banner with direct "Upload Cover Photo Instead" action |

---

## 7. Automated Test Suite (`scripts/test-scanner.mjs`)

A 43-assertion verification suite tests real end-to-end scanner behavior:

| # | Test Scenario | Verification Criteria | Status |
|---|---|---|---|
| **1** | Known ISBN (`9780132350884`) | Returns 200 OK, `ISBN_EXACT`, confidence 1.0, Clean Code | ✅ PASS |
| **2** | Unknown ISBN (`9780000000002`) | Returns 404 Not Found, `matched: false`, no fake book | ✅ PASS |
| **3** | Known Title (`"Atomic Habits"`) | Returns 200 OK, confidence $\ge 0.85$, identifies book | ✅ PASS |
| **4** | Unknown Title (`"Quantum Banana..."`) | Returns 200 OK, `matched: false`, confidence 0, no book | ✅ PASS |
| **5** | Multiple Candidates (`"Design"`) | Returns candidates list with calculated confidence | ✅ PASS |
| **6** | Empty Upload Validation | Rejects empty base64 with status 400 | ✅ PASS |
| **7** | Invalid Image Format | Rejects unsupported MIME types with status 400 | ✅ PASS |
| **8** | Blurry / Blank Image | Returns 404 with honest explanation that text is unreadable | ✅ PASS |
| **9** | Browser Camera Flow (Desktop) | Renders Start Camera, laser reticle, manual lookup, result card | ✅ PASS |
| **10** | Try Scanner Demo Mode | Displays explicit `DEMO SAMPLE` badge and vision bypass note | ✅ PASS |
| **11** | Mobile Viewport (iPhone SE) | Validates touch-friendly layout at 375x667 resolution | ✅ PASS |
| **12** | Camera Permission Denied | Simulates `NotAllowedError`, verifies alert & upload fallback | ✅ PASS |

To run the verification suite at any time:
```bash
node scripts/test-scanner.mjs
```

---

## 8. Current Limitations & Considerations

1. **Cover Occlusion**: If more than 60% of a book's title and author text is obscured, optical OCR will be unable to match against the catalog and will honestly return `"No exact match found"`.
2. **Barcode Reflections**: Glossy textbook covers under harsh fluorescent lighting may produce glare on the barcode. In such cases, taking a photo using the `"Upload Photo"` button with flash disabled produces the cleanest recognition.
3. **Local Warehouse Catalog**: The primary warehouse DB contains campus textbook inventory. When an ISBN is scanned that is not in the local catalog, the scanner queries OpenLibrary to identify the book title, but marks stock as `"Special Order"`.
