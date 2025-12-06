# PDF Organizer

A lightweight Next.js app to upload a PDF, reorder pages, and download the result. This guide is written so anyone—even with no coding experience—can set it up.

## What’s inside
- Drag-and-drop PDF upload and thumbnail grid for reordering
- Save/export the reordered PDF
- Optional Azure OCR integration (returns placeholder text if not configured)
- Tests via Jest; linting via ESLint

## Requirements
- Node.js 18.18+ and npm (grab from https://nodejs.org if you don’t have it)
- A terminal (macOS Terminal, Windows PowerShell, or Linux shell)

## Quick start (local run)
1) Download the code  
   - Easiest: GitHub → green “Code” → “Download ZIP”, then unzip.  
   - Or clone (if you have git):  
     `git clone https://github.com/gadroo/pdf-organizer.git`

2) Open a terminal in the project folder (the one with `package.json`).

3) Install once  
   `npm install`

4) Start the app  
   `npm run dev`  
   Wait for “ready” and a link like `http://localhost:3000`.

5) Use it  
   - Open `http://localhost:3000` in your browser.  
   - Upload a PDF, drag to reorder, then download/export.

6) Stop  
   - Go back to the terminal and press `Ctrl+C`.

## Optional: enable real OCR (Azure)
By default, OCR falls back to placeholder text. To use Azure Document Intelligence:
1) In the project root, create `.env.local` with:
   ```
   AZURE_FORM_RECOGNIZER_ENDPOINT=<your endpoint>
   AZURE_FORM_RECOGNIZER_KEY=<your key>
   ```
   (If you also need them client-side, add the `NEXT_PUBLIC_` versions.)
2) Restart `npm run dev` after saving the file.

## Useful scripts
- `npm run dev` — start locally (port 3000)
- `npm run build` — production build
- `npm run start` — run the built app
- `npm run lint` — ESLint
- `npm test` — run tests
- `npm run test:watch` — watch mode

## Tests (optional)
- `npm test` to run once
- `npm run test:watch` for continuous feedback

## Troubleshooting
- “command not found node” → install Node.js from https://nodejs.org.  
- Port already in use → stop other apps on port 3000 or run `PORT=3001 npm run dev`.  
- Install issues → try `rm -rf node_modules package-lock.json && npm install`.  
- OCR still placeholder → double-check `.env.local` values and restart `npm run dev`.
