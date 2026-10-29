import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [configText, capabilityText, html, actions, app, documentReaders, readerCss] = await Promise.all([
  readFile(path.join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'),
  readFile(path.join(root, 'desktop/src-tauri/capabilities/default.json'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/index.html'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/tauri-actions.js'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/app.js'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/document-readers.js'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/document-readers.css'), 'utf8'),
]);

const config = JSON.parse(configText);
const capability = JSON.parse(capabilityText);
assert.deepEqual(capability.permissions, ['core:event:allow-listen', 'core:event:allow-unlisten'],
  'Tauri must grant only the event APIs used by the frontend');
const csp = config.app.security.csp;
const scriptSrc = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1];
assert.ok(scriptSrc, 'CSP must define script-src');
assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/, 'script-src must reject inline scripts and eval');
assert.match(csp, /worker-src\s+'self'\s+blob:/, 'Local PDF rendering workers must be allowed without remote worker code');

const actionBlock = actions.match(/const actions = \{([\s\S]*?)\n  \};/)?.[1];
assert.ok(actionBlock, 'Static action map must exist');
const mappedActions = new Set(
  [...actionBlock.matchAll(/(['"])(.*?)\1\s*:/g)].map((match) => match[2]),
);
for (const [, action] of html.matchAll(/onclick="([^"]+)"/g)) {
  assert.ok(mappedActions.has(action), `Static click action is not safely bound: ${action}`);
}
for (const [, action] of html.matchAll(/oninput="([^"]+)"/g)) {
  assert.equal(action, 'setTypography()', `Unexpected inline input action: ${action}`);
  assert.match(actions, /querySelectorAll\('\[oninput="setTypography\(\)"\]'\)/,
    'Typography slider must be rebound without inline script execution');
}

for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  assert.match(attributes, /\bsrc=/i, 'HTML must not contain inline script blocks');
  assert.equal(body.trim(), '', 'HTML script tags must only load local assets');
}
for (const [, template] of app.matchAll(/\.innerHTML\s*=\s*`([\s\S]*?)`/g)) {
  assert.doesNotMatch(template, /\$\{/, 'Untrusted data must not be interpolated into innerHTML');
}
assert.doesNotMatch(app, /card\.innerHTML/, 'Book cards must not use an HTML injection sink');
assert.match(app, /allowScriptedContent:false,allowPopups:false/, 'EPUB scripts and popups must stay disabled');
assert.match(app, /function safeHighlightColor\(value\)\{return highlightPalette\.some\(item=>item\.color===value\)\?value:highlightPalette\[0\]\.color\}/,
  'Stored highlight colors must be selected from the fixed palette');
assert.match(html, /<script src="\.\/epub-security\.js"><\/script>/, 'EPUB archive validation must load before the reader');
assert.match(html, /<script src="\.\/vendor\/purify\.min\.js"><\/script>/, 'Markdown rendering must load the local HTML sanitizer');
assert.match(html, /<script src="\.\/vendor\/marked\.umd\.js"><\/script>/, 'Markdown rendering must use the local parser');
assert.match(documentReaders, /PDF_LIMIT\s*=\s*512\s*\*\s*1024\s*\*\s*1024/, 'PDF imports must have a bounded file size');
assert.match(documentReaders, /MAX_PDF_PAGES\s*=\s*5000/, 'PDF documents must have a bounded page count');
assert.match(documentReaders, /MARKDOWN_LIMIT\s*=\s*16\s*\*\s*1024\s*\*\s*1024/, 'Markdown imports must have a bounded file size');
assert.match(documentReaders, /MAX_MARKDOWN_LINES\s*=\s*50_000/, 'Markdown documents must have bounded parsing work');
assert.match(documentReaders, /isEvalSupported:\s*false/, 'PDF script actions must remain disabled');
assert.match(documentReaders, /enableXfa:\s*false/, 'XFA PDF forms must remain disabled');
assert.match(documentReaders, /DOMPurify\.sanitize\(html/, 'Markdown must be sanitized before display');
assert.match(documentReaders, /useWasm:\s*false/, 'PDF input must not activate document-provided WebAssembly');
assert.match(documentReaders, /pdf\.worker\.compat\.mjs/, 'PDF worker must load the local runtime compatibility shim');
assert.match(documentReaders, /classList\.toggle\('pdf-reader-open'/, 'PDF mode must activate its constrained viewport layout');
assert.match(readerCss, /body\.pdf-reader-open #readerView #stageScroll[\s\S]*?overflow-y:\s*auto/, 'PDF pages must scroll inside the reader viewport instead of the document body');
assert.match(readerCss, /body\.pdf-reader-open #readerView > \.reader-top[\s\S]*?flex:\s*0 0 64px/, 'PDF controls must remain visible while reading');
assert.match(await readFile(path.join(root, 'outputs/carta/vendor/pdfjs/pdf.worker.compat.mjs'), 'utf8'), /Uint8Array\.prototype\.toHex/, 'PDF worker must polyfill Uint8Array.toHex for older runtimes');
assert.equal((app.match(/cartaEpubSecurity\.validateArchive/g) || []).length, 3,
  'Validate EPUBs before import, cover extraction, and reading');

const require = createRequire(import.meta.url);
globalThis.JSZip = require(path.join(root, 'outputs/carta/vendor/jszip.min.js'));
await import(pathToFileURL(path.join(root, 'outputs/carta/epub-security.js')).href);
const zip = new globalThis.JSZip();
zip.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>');
zip.file('OPS/package.opf', '<package/>');
zip.file('OPS/book.xhtml', 'A'.repeat(2048));
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const loadedZip = await globalThis.JSZip.loadAsync(archive);
assert.equal(globalThis.cartaEpubSecurity.validateEntries(loadedZip.files), true,
  'Ordinary EPUB central-directory metadata must pass');
const previousDomParser = globalThis.DOMParser;
globalThis.DOMParser = class {
  parseFromString() {
    return {
      getElementsByTagName: (name) => name === 'parsererror' ? [] : [],
      getElementsByTagNameNS: (_namespace, name) => name === 'rootfile'
        ? [{ getAttribute: (attribute) => attribute === 'full-path' ? 'OPS/package.opf' : null }]
        : [],
    };
  }
};
try {
  assert.equal(await globalThis.cartaEpubSecurity.validateArchive(new Blob([archive])), true,
    'A structurally valid EPUB archive must pass preflight');
} finally {
  if (previousDomParser === undefined) delete globalThis.DOMParser;
  else globalThis.DOMParser = previousDomParser;
}
assert.throws(
  () => globalThis.cartaEpubSecurity.validateEntries(loadedZip.files, {
    ...globalThis.cartaEpubSecurity.limits,
    maxTotalBytes: 1024,
  }),
  /decompression/i,
  'Reject archives whose declared uncompressed total exceeds the limit',
);
assert.throws(
  () => globalThis.cartaEpubSecurity.validateEntries({
    '../outside.txt': { name: '../outside.txt', dir: false, _data: { uncompressedSize: 1 } },
  }),
  /percorso interno/i,
  'Reject traversal paths in archive entries',
);
await assert.rejects(
  globalThis.cartaEpubSecurity.validateArchive({
    size: globalThis.cartaEpubSecurity.limits.maxArchiveBytes + 1,
  }),
  /256 MB/i,
  'Reject oversized EPUB files before opening them',
);

console.log('Security checks passed: strict CSP, least-privilege Tauri permissions, safe rendering, and bounded EPUB/PDF/Markdown imports.');
