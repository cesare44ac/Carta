import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const fileName = `Carta_${version}_x64-setup.exe`;
const source = resolve(root, 'desktop/src-tauri/target/release/bundle/nsis', fileName);
const destination = resolve(root, 'releases', fileName);

try {
  const details = await stat(source);
  if (!details.isFile() || details.size < 1024 * 1024) {
    throw new Error('Il file dell’installer è vuoto o incompleto.');
  }
} catch {
  throw new Error(`Installer ${fileName} non trovato nel percorso generato da Tauri.`);
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log(`Installer pronto: ${destination}`);
