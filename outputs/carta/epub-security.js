(() => {
  const limits = Object.freeze({
    maxArchiveBytes: 256 * 1024 * 1024,
    maxEntries: 20000,
    maxEntryBytes: 128 * 1024 * 1024,
    maxTotalBytes: 1024 * 1024 * 1024,
    maxContainerBytes: 1024 * 1024,
  });

  function validateEntries(files, bounds = limits) {
    const entries = Object.values(files || {});
    if (entries.length > bounds.maxEntries) {
      throw new Error('L’EPUB contiene troppi elementi o supera il limite di decompressione.');
    }

    let totalBytes = 0;
    for (const entry of entries) {
      const name = String(entry?.name || '').replace(/\\/g, '/');
      if (!name || name.startsWith('/') || name.split('/').includes('..') || name.length > 2048) {
        throw new Error('L’EPUB contiene un percorso interno non valido.');
      }
      if (entry.dir) continue;

      // JSZip exposes the declared uncompressed size on each central-directory entry.
      const size = Number(entry?._data?.uncompressedSize);
      if (!Number.isSafeInteger(size) || size < 0 || size > bounds.maxEntryBytes) {
        throw new Error('L’EPUB contiene un elemento troppo grande.');
      }
      totalBytes += size;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > bounds.maxTotalBytes) {
        throw new Error('L’EPUB supera il limite di decompressione.');
      }
    }
    return true;
  }

  async function validateArchive(file, ZipLibrary = globalThis.JSZip) {
    if (!file || !Number.isFinite(file.size)) {
      throw new Error('Il file EPUB non è leggibile.');
    }
    if (file.size > limits.maxArchiveBytes) {
      throw new Error('Il file EPUB supera il limite di 256 MB.');
    }
    if (!ZipLibrary) throw new Error('Lettore EPUB non disponibile.');

    let zip;
    try {
      const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file;
      zip = await ZipLibrary.loadAsync(bytes, { checkCRC32: false });
    } catch {
      throw new Error('Il file EPUB è danneggiato o non valido.');
    }
    validateEntries(zip.files);

    const container = zip.file('META-INF/container.xml');
    if (!container || Number(container._data?.uncompressedSize) > limits.maxContainerBytes) {
      throw new Error('Struttura EPUB non valida.');
    }
    const xml = new DOMParser().parseFromString(await container.async('text'), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) {
      throw new Error('Indice EPUB non valido.');
    }
    const rootfile = xml.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path') || '';
    const normalizedRootfile = rootfile.replace(/\\/g, '/');
    if (!normalizedRootfile || normalizedRootfile.startsWith('/') || normalizedRootfile.split('/').includes('..') || !zip.file(normalizedRootfile)) {
      throw new Error('Indice EPUB non valido.');
    }
    return true;
  }

  globalThis.cartaEpubSecurity = Object.freeze({ limits, validateEntries, validateArchive });
})();
