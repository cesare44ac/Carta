import { copyFile, mkdir, stat, readFile, unlink } from 'node:fs/promises';
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

// Use release history rather than remaining files: rerunning a build must not
// progressively delete older releases after the previous two are already gone.
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
const history = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)].map(match => match[1]);
const currentIndex = history.indexOf(version);
if (currentIndex < 0) throw new Error(`Versione ${version} assente dal changelog: pulizia interrotta.`);
const previousVersions = history.slice(currentIndex + 1, currentIndex + 3);
const installerDirs = new Set([
  dirname(source), dirname(destination),
  ...(process.env.CARTA_INSTALLER_OUTPUT_DIRS || '').split(';').filter(Boolean).map(value => resolve(value))
]);
for (const oldVersion of previousVersions) {
  for (const directory of installerDirs) {
    const oldInstaller = resolve(directory, `Carta_${oldVersion}_x64-setup.exe`);
    if (process.env.CARTA_CLEANUP_DRY_RUN === '1') {
      console.log(`Pulizia prevista: ${oldInstaller}`);
      continue;
    }
    try {
      await unlink(oldInstaller);
      console.log(`Installer precedente eliminato: ${oldInstaller}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
