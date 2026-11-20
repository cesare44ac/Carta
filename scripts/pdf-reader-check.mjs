import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
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

const readerSource = await readFile(path.join(root, 'outputs/carta/document-readers.js'), 'utf8');
const lineFunction = readerSource.slice(readerSource.indexOf('  function pdfLineRects('), readerSource.indexOf('  // Element rects describe'));
const lineRects = runInNewContext(lineFunction + ';pdfLineRects');
const normalized = (x, y, w, h) => ({ x: x / 1000, y: y / 1000, w: w / 1000, h: h / 1000 });
const formulaBands = lineRects([
  normalized(10, 10, 20, 20), normalized(45, 10, 12, 20),
  normalized(70, 10, 80, 20), normalized(150, 24, 8, 10),
  normalized(10, 45, 130, 20)
], 1000, 1000);
assert.equal(formulaBands.length, 2, 'Formula runs, spaces and subscripts must merge on their own line');
assert.equal(formulaBands[0].w, .148, 'The band must bridge internal gaps without extending beyond the passage');
assert.equal(lineRects([normalized(10, 10, 40, 20)], 1000, 1000)[0].w, .04,
  'A single selected word must retain its own width');
assert.equal(lineRects([normalized(10, 10, 40, 20), normalized(400, 10, 60, 20)], 1000, 1000).length, 2,
  'Distant columns must remain separate');
console.log('PDF highlight geometry passed: formulas, subscripts, separate lines, columns and individual words.');
