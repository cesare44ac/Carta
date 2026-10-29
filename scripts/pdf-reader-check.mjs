import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfRoot = path.join(root, 'outputs/carta/vendor/pdfjs');
const pdfjs = await import(pathToFileURL(path.join(pdfRoot, 'pdf.min.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(pdfRoot, 'pdf.worker.compat.mjs')).href;

function createPdf() {
  const pageStream = text => `BT /F1 20 Tf 72 720 Td (${text}) Tj ET`;
  const streams = [pageStream('Carta PDF first page'), pageStream('Carta PDF second page')];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(streams[0])} >>\nstream\n${streams[0]}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(streams[1])} >>\nstream\n${streams[1]}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, '0')} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(source);
}

const loadingTask = pdfjs.getDocument({
  data: createPdf(),
  standardFontDataUrl: pathToFileURL(path.join(pdfRoot, 'standard_fonts/')).href,
  useWasm: false,
  isEvalSupported: false,
  enableXfa: false,
  verbosity: 0,
});
const pdfDocument = await loadingTask.promise;
try {
  assert.equal(pdfDocument.numPages, 2, 'The bundled PDF.js must read the document page count');
  const page = await pdfDocument.getPage(2);
  const text = await page.getTextContent();
  assert.match(text.items.map(item => item.str).join(' '), /Carta PDF second page/,
    'The bundled PDF.js must extract selectable text from a page');
} finally {
  await loadingTask.destroy();
}

console.log('PDF reader check passed: bundled PDF.js loaded a two-page document and extracted selectable text.');
