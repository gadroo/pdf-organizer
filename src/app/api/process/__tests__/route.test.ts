import { POST, GET } from '../route';
import type { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';

const clearAzureEnv = () => {
  delete process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
  delete process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_ENDPOINT;
  delete process.env.AZURE_FORM_RECOGNIZER_KEY;
  delete process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_KEY;
};

async function buildPdfFile(pages: number): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage();
  }
  const bytes = await doc.save();
  return new File([bytes], 'sample.pdf', { type: 'application/pdf' });
}

function buildPostRequest(file?: File): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  const request = new Request('http://localhost/api/process', {
    method: 'POST',
    body: formData,
  });
  return request as unknown as NextRequest;
}

describe('/api/process route', () => {
  beforeEach(() => {
    clearAzureEnv();
  });

  it('returns health info from GET', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe('ok');
    expect(payload.endpoint).toBe('/api/process');
    expect(typeof payload.ocrConfigured).toBe('boolean');
  });

  it('falls back to placeholder OCR when Azure is not configured', async () => {
    const file = await buildPdfFile(2);
    const request = buildPostRequest(file);

    const response = await POST(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.pages).toHaveLength(2);
    expect(payload.pages[0].ocrText).toContain('Page 1');
    expect(payload.suggestedOrder).toHaveLength(2);
    expect(payload.heuristicUsed).toBeDefined();
    expect(payload.confidence).toBeGreaterThan(0);
  });

  it('rejects missing file uploads', async () => {
    const request = buildPostRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('INVALID_FILE');
  });

  it('rejects non-PDF uploads', async () => {
    const badFile = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' });
    const request = buildPostRequest(badFile);

    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe('INVALID_FILE');
  });
});
