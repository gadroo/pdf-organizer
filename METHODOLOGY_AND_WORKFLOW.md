# 🧠 PDF Organizer — Methodology, Workflow & Architecture

How the Next.js PDF Organizer ingests a PDF, guesses the correct order, and lets users fine‑tune and export it — end to end.

---

## 📐 System Architecture

```
┌────────────────────┐          POST /api/process           ┌────────────────────────────┐
│  Browser (Next.js) │ ───────────────────────────────────> │  API Route (App Router)    │
│  Upload + Editor   │ <─────────────────────────────────── │  OCR + Heuristics pipeline │
└────────────────────┘            JSON result               └────────────────────────────┘
        │                                                             │
        │                                                             ▼
        │                                                    Azure Document Intelligence
        │                                                    (with file/system cache)
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Client-side Editor                                                           │
│ - Zustand store keeps PDF bytes, order, selection, undo/redo stacks          │
│ - pdfjs-dist renders thumbnails/previews                                     │
│ - dnd-kit drives drag/drop ordering + keyboard shortcuts                     │
│ - pdf-lib reorders and downloads the final PDF locally (no server export)    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Frameworks & libraries**
- **UI**: Next.js App Router (client components), Tailwind CSS styles in `src/app/globals.css`
- **State**: Zustand store in `src/lib/store/pdfStore.ts`
- **Drag & drop**: `@dnd-kit/core` for ordering and selection affordances
- **Thumbnails**: `pdfjs-dist` renderer (dynamic import to avoid SSR issues)
- **Export**: `pdf-lib` reorders pages and downloads entirely in the browser
- **OCR**: Azure Document Intelligence client with on-disk + in-memory caching (`lib/ocr/azure.ts`)
- **Heuristics**: Page-number and structural strategies (`lib/heuristics/*`) backed by `config/docRules.json`

---

## 🔄 End-to-End Flow (Upload → Edit → Export)

### Function-by-Function Workflow (main path)
1. `src/app/page.tsx > Home()`  
   Renders landing UI and the upload `DropZone`.
2. `src/components/upload/DropZone.tsx > processFile(file)`  
   Validates PDF, reads bytes, seeds Zustand via `setPdf`, shows success state.
3. `src/components/upload/DropZone.tsx > processPdfForReorganization()`  
   Calls `/api/process` with the uploaded file; on success maps API response into `setPages` and navigates to `/editor`.
4. `src/app/api/process/route.ts > POST(request)`  
   Entry to the server pipeline: validates file, loads PDF for page count, calls `extractPageContents`, then runs heuristics and returns JSON.
5. `src/app/api/process/route.ts > extractPageContents(pdfBytes, pageCount)`  
   Uses `AzureOCRClient.analyzePDF` to get per-page text/metadata; falls back to placeholders if OCR unavailable.
6. `lib/ocr/azure.ts > AzureOCRClient.analyzePDF({ file })`  
   Splits PDF into per-page requests, checks cache (`FileOCRCache`), calls Azure if configured, returns text + header/footer hints.
7. `lib/heuristics/index.ts > HeuristicsOrchestrator.processPages(pageContents)`  
   Iterates enabled strategies, collects `OrderingResult`s, picks the best via `selectBestStrategy`, and packages stats.
8. `lib/heuristics/pageNumbers.ts > PageNumberStrategy.attemptOrdering(pageContents)`  
   Detects explicit numbers (`detectExplicitPageNumbers`), gathers sequence/structural signals (`detectSequenceMarkers`, `detectContinuationHints`, `analyzeStructuralAnchors`), resolves gaps (`resolveOrphanPlacements`), and computes confidence.
9. `lib/heuristics/structure.ts > StructuralPatternStrategy.attemptOrdering(pageContents)`  
   Scores headers/footers/signature cues, assigns structural priorities, sorts pages, and computes confidence.
10. `lib/heuristics/index.ts > selectBestStrategy(...)`  
    Chooses the winning order (confidence + small quality boost), returned as `finalResult`.
11. `src/components/upload/DropZone.tsx > setPages(...)`  
    Saves pages + suggested order, resets undo/redo stacks, and redirects to the editor.
12. `src/app/editor/page.tsx > EditorPage()`  
    Loads state, wires keyboard shortcuts, renders `Toolbar`, `ThumbnailGrid`, and `ExportModal`.
13. `src/components/editor/ThumbnailGrid.tsx > useEffect(loadThumbnails)`  
    Dynamically imports `PDFRenderer`, loads the PDF bytes copy, and renders thumbnails in batches.
14. `src/components/editor/ThumbnailGrid.tsx > reorderPages(from, to)`  
    Updates `pageOrder` in Zustand when drag/drop finishes.
15. `src/components/editor/ExportModal.tsx > handleExport()`  
    Creates `PDFManipulator`, calls `loadPDF`, then `reorderPages(pageOrder)` to build the new PDF.
16. `lib/pdf/manipulate.ts > PDFManipulator.reorderPages(order)`  
    Validates the order, copies pages into a new `PDFDocument`, returns bytes.
17. `lib/pdf/manipulate.ts > PDFManipulator.downloadPDF({ filename })`  
    Creates a Blob URL from the reordered bytes and triggers a browser download.

### 1) Upload & Validation (`src/app/page.tsx`, `src/components/upload/DropZone.tsx`)
1. User drags/drops or browses for a file (max 100 MB, `.pdf` enforced).
2. File bytes are read into a `Uint8Array`; `usePdfStore.setPdf` persists bytes + filename.
3. UI shows staged “Upload successful” state; user clicks **Reorganize PDF** to continue.

### 2) Server-side Processing (`POST /api/process`)
1. API route validates the file name/size and confirms the PDF opens via `pdf-lib`.
2. `extractPageContents` calls `AzureOCRClient` with per-page caching:
   - In `analyzePDF`, the client loops over each page; on a cache miss it calls `extractSinglePage(pdfBytes, pageIndex)` to produce a one-page PDF, then hands that to `analyzeSinglePage` for Azure OCR (keeps requests under the 4 MB limit).
   - Uses `.ocr-cache` directory for 24h cache; cache hits skip Azure; cache misses trigger the split + per-page Azure call.
   - If Azure env vars are missing, returns placeholder content with low confidence.
3. Builds `PageContent[]` (text + optional header/footer metadata) for heuristics.

### 3) Heuristics Orchestration (`lib/heuristics/index.ts`)
1. `HeuristicsOrchestrator` loads strategies (configurable priorities):
   - `PageNumberStrategy` (priority 100)
   - `StructuralPatternStrategy` (priority 70)
2. Each enabled strategy runs if it “canHandle” the pages and returns `OrderingResult`.
3. Selector chooses the highest-confidence result (with a slight boost for reliable page numbers).
4. Response includes `suggestedOrder`, strategy confidences, and truncated OCR snippets.

### 4) Client Editor (`src/app/editor/page.tsx`)
1. Redirects to `/` if no PDF bytes exist in the store.
2. Generates thumbnails via `PDFRenderer` (pdfjs) in small batches; caches renderer in a ref.
3. Drag/drop reorders via `usePdfStore.reorderPages`; selection supports shift-range, delete, select-all, undo/redo (keyboard shortcuts wired).
4. Double-click opens a high-res preview (re-renders the page at higher scale).

### 5) Export (`src/components/editor/ExportModal.tsx`)
1. `PDFManipulator` loads the original bytes, validates order integrity, and copies pages in the new order.
2. Downloads locally with `pdf-lib` (no server round-trip), applying user filename normalization.

---

## 🧠 Heuristics Details

### Orchestrator (`lib/heuristics/index.ts`)
- Strategy list + priorities come from constructor config; defaults require ≥0.6 confidence.
- Keeps per-strategy results, processing stats, and returns a `comparison` object describing the winner + runners-up.

### Strategy 1: PageNumberStrategy (`lib/heuristics/pageNumbers.ts`)
- **Detection**: Regex pool from `config/docRules.json.general_patterns.page_number_patterns` plus fallbacks (`-(\\d+)-`, `page (\d+)`, `p. ?(\d+)`, etc.).
- **Region scoring**: Searches header, footer, header+footer, then full page; stores matches in `patternMatches`.
- **Sequence signals**:
  - **Sequence markers** (`sequenceMarkers.ts`): finds “Article IV”, “Section 4.2”, “Schedule A”, “Exhibit B” with ordinal extraction.
  - **Continuation hints** (`continuationDetection.ts`): mid-sentence / explicit “continued” detection to link adjacent pages.
  - **Structural anchors** (`structuralAnchors.ts`): header/title vs. signature/footer weights.
  - **Gap resolver** (`gapResolver.ts`): starts from anchored pages, inserts others using sequence/continuation/structural cues; appends leftovers as fallback.
- **Confidence**: Coverage of explicit numbers + sequence quality + heuristic coverage, capped at 0.98; reasoning lists placements for transparency.

### Strategy 2: StructuralPatternStrategy (`lib/heuristics/structure.ts`)
- Scores each page for header-like text, footer/signature cues, content density, and title markers.
- Prioritizes likely title pages first, content middle, signature/footer last.
- Confidence scales with how distinct structural priorities are across the document (range-based).

### Detailed Function Flow — PageNumberStrategy (numbers present or inferred)
1. `PageNumberStrategy.attemptOrdering(pageContents)`  
   Entry for the strategy; orchestrates detection, placement, and scoring.
2. `detectExplicitPageNumbers(pageContents, buildPatternList(), log)` (from `pageNumberDetection.ts`)  
   - Builds candidate regions per page (`buildCandidateRegions`) using header/footer metadata then full page.  
   - Iterates regex patterns; sets `pageContents[i].detectedPageNum`, returns `pageNumbers` map + `patternMatches`.
3. `summarizeNumberSequence(pageNumbers, totalPages)`  
   Computes coverage, missing/duplicate numbers, and sequence quality.
4. `gatherPlacementSignals(pageContents)`  
   - `detectSequenceMarkers` (in `sequenceMarkers.ts`): extracts Article/Section/Schedule/Exhibit markers with ordinals.  
   - `analyzeStructuralAnchors` (in `structuralAnchors.ts`): scores header/title/signature/footer cues and priorities.  
   - `detectContinuationHints` (in `continuationDetection.ts`): finds explicit “continued” or mid-sentence breaks.
5. `resolveOrphanPlacements({...})` (in `gapResolver.ts`)  
   - Starts with anchored pages from explicit numbers (`initialOrder`).  
   - If no anchors, `chooseStartPage` seeds an anchor via structural/sequence strength.  
   - For each unplaced page, builds candidates:  
     * `buildSequencePlacement` (slots between existing markers)  
     * `buildContinuationPlacement` (uses continuation hints)  
     * `buildStructuralPlacement` (title to front, signatures to end)  
   - Inserts when score ≥ threshold; appends unresolved pages as fallback.  
   - Returns final `order`, `placements`, and `heuristicCoverage`.
6. `computeConfidence(coverage, sequenceQuality, heuristicCoverage)`  
   Blends explicit coverage, sequence quality, and heuristic placement coverage (capped at 0.98).
7. `buildReasoning(context)`  
   Summarizes coverage, sequence quality, heuristic coverage, and sample placement reasons (first few placements).

### Detailed Function Flow — StructuralPatternStrategy (no/weak numbers path)
1. `StructuralPatternStrategy.attemptOrdering(pageContents)`  
   Entry for structural-only ordering.
2. For each page:  
   - Split into lines; assemble `scoreFactors` (header_like, footer_like, content_density, has_title, has_signature_space).  
   - Header scan (first 3 lines) for ALLCAPS titles or keywords like “application/report/contract”.  
   - Footer scan (last 3 lines) for page/ signature/date cues; signature phrases across full content.  
   - `calculateStructuralPriority(scoreFactors)` (from `structuralAnchors.ts`): lowers priority for titles/headers, raises for signatures/footers, adjusts by density.  
   - `calculateStructuralOverallScore(scoreFactors)` (from `structuralAnchors.ts`): weighted 0–1 aggregate.
3. Collect `structuralScores` (index, sample content, scores, priority, overallScore); log notable title/signature detections.
4. Sort by `priority` ascending → `order`.
5. Compute confidence from priority range spread (distinctiveness) with upper bound 0.8.
6. Build reasoning (counts headers/signatures, priority range) and return `OrderingResult`.

---

## 🧭 Detailed Front-end Map (where each step lives)

- **Landing & upload mount**: `src/app/page.tsx` renders hero + `<DropZone />`.
- **Upload & staging**: `src/components/upload/DropZone.tsx`
  - `processFile` validates PDF/size, reads bytes, seeds Zustand via `setPdf(bytes, file.name)`, shows staged success.
  - “Reorganize PDF” button → `processPdfForReorganization` → `fetch('/api/process', POST)` with the original file in `FormData`; sets `setProcessing(true, 40)`.
  - On success: maps API response to `setPages(pages, suggestedOrder)` and `router.push('/editor')`.
  - “Reselect” resets state and reopens the file picker; errors show retry affordance.
- **State model**: `src/lib/store/pdfStore.ts` holds `pdfBytes`, `filename`, `pages`, `pageOrder`, selection set, undo/redo stacks, processing/error flags; actions: `setPdf`, `setPages`, `reorderPages`, `deleteSelected`, `toggleSelection` (shift-range aware), `selectAll`, `clearSelection`, `undo/redo`.
- **Editor shell & shortcuts**: `src/app/editor/page.tsx` guards for missing PDF (redirects home), wires keyboard shortcuts (undo/redo, delete, select-all, clear, export), renders `Toolbar`, `ThumbnailGrid`, `ExportModal`.
- **Thumbnails & preview**: `src/components/editor/ThumbnailGrid.tsx` dynamically imports `PDFRenderer` (`lib/pdf/render.ts`), clones `pdfBytes`, renders thumbnails in batches; drag/drop → `reorderPages`; click/shift-click selects; double-click opens preview dialog; arrow buttons/keys move prev/next preview.
- **Thumbnail card UI**: `src/components/editor/ThumbnailItem.tsx` shows drag handle, selection check, current vs original index, detected page number/confidence badge.
- **Toolbar**: `src/components/editor/Toolbar.tsx` toggles select-all/deselect-all, delete, undo/redo, shows selection count/page count, and triggers export.
- **Export flow**: `src/components/editor/ExportModal.tsx` builds default filename, on export creates `PDFManipulator`, `loadPDF(pdfBytes)`, `reorderPages(pageOrder)` (order validation), normalizes `.pdf` suffix, and calls `downloadPDF` to save locally; shows errors inline.

## 🛠️ Detailed Back-end Map (where each step lives)

- **API entry**: `src/app/api/process/route.ts > POST`
  - Validates file presence/type/size; loads PDF via `pdf-lib` for `pageCount`.
  - Calls `extractPageContents(pdfBytes, pageCount)`.
- **Per-page OCR split & cache**: `extractPageContents` → `new AzureOCRClient({ useCache: true })` → `analyzePDF` in `lib/ocr/azure.ts`
  - Loop per page; **cache hit**: return cached OCR (`.ocr-cache`, 24h). **Cache miss**: `const singlePagePdf = await this.extractSinglePage(pdfBytes, pageIndex);` (uses `pdf-lib` to isolate one page), then `analyzeSinglePage(singlePagePdf, pageNumber)` sends to Azure with retry/backoff and inter-request delay to avoid throttling.
  - If Azure creds are missing, returns placeholder low-confidence content; header/footer text and dimensions are extracted when available.
- **Heuristics orchestration**: `src/app/api/process/route.ts` builds `PageContent[]` and calls `new HeuristicsOrchestrator().processPages(...)` (`lib/heuristics/index.ts`), which runs:
  - `pageNumbers` strategy (`lib/heuristics/pageNumbers.ts`) and
  - `structure` strategy (`lib/heuristics/structure.ts`);
  - selects the best `finalResult` by confidence (with a small boost for explicit numbers).
- **API response**: returns pages (truncated OCR), `suggestedOrder`, `heuristicUsed`, `confidence`, `reasoning`, per-strategy orders/confidences, and timing; consumed by `DropZone.processPdfForReorganization`.
- **Export/reorder implementation**: `lib/pdf/manipulate.ts` — `loadPDF`, `reorderPages` (validates indices, duplicates, completeness; copies pages into a new PDF), optional metadata setters, `downloadPDF` builds a blob URL and triggers download.

## ✅ Testing Status

- **Configured runners**: `package.json` exposes `npm test` / `npm run test:watch` (Jest).
- **Current suite**: No test files are present in the repo (`*.test.*`/`*.spec.*` not found). There is currently no automated coverage for upload, OCR orchestration, heuristics, or editor interactions.
- **Implication**: Behavior is validated manually; consider adding unit tests around `lib/heuristics/*`, `lib/ocr/azure.ts` (with mocks), and integration tests for `/api/process` plus UI component tests for `DropZone` and `ThumbnailGrid`.
### Document Rules (`config/docRules.json`)
- Defines document types (loan agreements, mortgages) with section indicators and boost patterns.
- Supplies general patterns for first/last pages, continuation, section breaks, and page-number regexes.

---

## 🖥️ Client Editor Mechanics

- **State model** (`src/lib/store/pdfStore.ts`):
  - Keeps `pages`, `pageOrder`, `selectedIds`, undo/redo stacks, progress + errors.
  - `setPages` seeds undo history with the original order; `reorderPages` pushes history snapshots.
  - Selection supports toggles + shift-range; `deleteSelected` prunes the order array.
- **Thumbnails & previews** (`src/components/editor/ThumbnailGrid.tsx`):
  - Dynamic import of `PDFRenderer` to avoid SSR worker issues; batches renders (4 at a time) to reduce jank.
  - Stores thumbnails in a `Map` keyed by original page index; high-res preview re-renders at larger scale.
- **Toolbar** (`src/components/editor/Toolbar.tsx`):
  - Undo/redo, select-all/deselect-all, delete, and export entry point; keyboard shortcuts mirrored in the page-level listeners.

---

## 📤 API Contract (`src/app/api/process/route.ts`)

- **Request**: `multipart/form-data` with `file` (PDF). Hard limit 100 MB.
- **Response**:
  ```json
  {
    "pages": [{ "index": 0, "ocrText": "...", "detectedPageNum": 1, "confidence": 0.9 }],
    "suggestedOrder": [0,1,2],
    "heuristicUsed": "explicit_page_numbers",
    "confidence": 0.92,
    "reasoning": ["Used page_numbers strategy", "..."],
    "processingTimeMs": 1234,
    "strategyResults": { "page_numbers": { "order": [...], "confidence": 0.92, "method": "explicit_page_numbers" } }
  }
  ```
- **Health check**: `GET /api/process` reports Azure configuration and cache status.

---

## ⚙️ Configuration & Ops

- **Azure OCR** (`lib/ocr/azure.ts`):
  - Env vars: `AZURE_FORM_RECOGNIZER_ENDPOINT` and `AZURE_FORM_RECOGNIZER_KEY` (or `NEXT_PUBLIC_*` equivalents).
  - Per-page calls stay under 4 MB; uses hash-based cache keys (`.ocr-cache`) with memory + disk caching (24h TTL).
  - Graceful fallback to placeholder content when Azure is unavailable.
- **PDF worker**: `pdfjs-dist` workerSrc set to jsDelivr CDN inside `lib/pdf/render.ts`.
- **Limits**: 100 MB upload cap; rejects empty PDFs and unreadable files early.

---

## 🧪 Testing & Debugging

- **Jest**: `npm test` from `pdf-organizer/` (Node env by default; add `@jest-environment jsdom` for component tests).
- **Heuristics fixtures/tests**: `lib/heuristics/__tests__/*` cover sequence markers, continuation hints, and gap resolution.
- **PDF manipulation tests**: `lib/pdf/__tests__/manipulate.test.ts`.
- **Store tests**: `src/lib/store/__tests__/pdfStore.test.ts` verify ordering + undo/redo behavior.
- **Logging**: API route logs file metadata, OCR status (cache hits/misses), strategy confidences, and chosen method.

---

**Quick mental model**: Upload → Azure OCR (or placeholders) → Heuristics choose the best order → Thumbnails render → User drag/drop edits → pdf-lib exports locally. No reconstructed PDF ever leaves the browser. 🎉
