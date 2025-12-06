# PDF Organizer

A simple Next.js app for uploading, reordering, and saving PDFs. This guide is written so anyone—even with no coding experience—can get it running.

## What you need
- Node.js 18.18+ and npm (download from https://nodejs.org if you don’t have it).
- A terminal (macOS Terminal, Windows PowerShell, or Linux shell).

## Quick start (local run)
1) Download the code  
   - Easiest: click the green “Code” button on GitHub → “Download ZIP”, then unzip.  
   - Or clone (if you have git):  
     `git clone https://github.com/gadroo/pdf-organizer.git`

2) Open a terminal in the project folder (the one that contains `package.json`).

3) Install the app (one-time)  
   `npm install`

4) Start the app  
   `npm run dev`  
   Wait until you see “ready” and a URL like `http://localhost:3000`.

5) Use it  
   - Open `http://localhost:3000` in your browser.  
   - Upload a PDF, reorder pages, then download/export.

6) Stop the app  
   - Return to the terminal and press `Ctrl+C`.

## Production build (optional)
- Build: `npm run build`  
- Start the built app: `npm run start` (served on port 3000 by default).

## Tests (optional)
- Run all tests: `npm test`  
- Watch mode: `npm run test:watch`

## Troubleshooting
- “command not found node” → Install Node.js from https://nodejs.org.  
- Port already in use → close other apps on port 3000 or run `PORT=3001 npm run dev`.  
- Fresh install issues → try `rm -rf node_modules package-lock.json && npm install`.
