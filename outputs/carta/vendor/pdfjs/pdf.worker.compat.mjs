if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    configurable: true,
    writable: true,
    value() {
      let hex = '';
      for (const byte of this) hex += byte.toString(16).padStart(2, '0');
      return hex;
    },
  });
}

// Browser workers use the module for its side effects. PDF.js also imports
// workerSrc directly when it falls back to a fake worker (Node and WebViews
// without Worker support), so forward the handler export for that path.
export { WorkerMessageHandler } from './pdf.worker.min.mjs';
