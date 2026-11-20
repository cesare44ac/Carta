import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, frontend, styles, rust, translations, packageText, tauriText, suggestions, vendoredGlib] = await Promise.all([
  readFile(path.join(root, 'outputs/carta/index.html'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/marketplace.js'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/marketplace.css'), 'utf8'),
  readFile(path.join(root, 'desktop/src-tauri/src/lib.rs'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/i18n.js'), 'utf8'),
  readFile(path.join(root, 'package.json'), 'utf8'),
  readFile(path.join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'),
  readFile(path.join(root, 'outputs/carta/topic-suggestions.js'), 'utf8'),
  readFile(path.join(root, 'desktop/src-tauri/vendor/glib-0.18.5/src/variant_iter.rs'), 'utf8'),
]);

const pkg = JSON.parse(packageText);
const tauri = JSON.parse(tauriText);
assert.match(pkg.version, /^3\.5\.\d+$/, 'The package must retain a valid patch version');
assert.equal(tauri.version, pkg.version, 'The desktop bundle and package versions must match');
assert.match(html, /id="discoverOpen"/, 'The library must have a discovery entry point');
assert.match(html, /data-source="lse"[\s\S]*data-source="imf"[\s\S]*data-source="ecb"[\s\S]*data-source="fed"/, 'The four requested institutions must be selectable');
assert.match(html, /data-tab="research"[\s\S]*data-tab="news"/, 'Research and news must have separate views');
assert.match(frontend, /textContent\s*=/, 'Untrusted titles and abstracts must be rendered as text');
assert.doesNotMatch(frontend, /\.innerHTML\s*=/, 'Untrusted source metadata must not be inserted as HTML');
assert.match(html, /id="discoverQuery"[^>]*maxlength="160"/, 'Search terms must have a bounded length in the UI');
assert.match(html, /id="discoverTheme"[^>]*list="discoverThemeSuggestions"[^>]*maxlength="120"/, 'The theme filter must support bounded manual entry and local suggestions');
assert.match(html, /topic-suggestions\.js/, 'The local topic suggester must load before marketplace search');
assert.match(frontend, /requestId !== researchRequest/, 'Stale search responses must not replace newer results');
assert.match(frontend, /requestId !== newsRequest/, 'Stale news responses must not replace newer results');
assert.match(frontend, /carta-library-updated/, 'Topic suggestions must refresh when the library changes');
assert.match(frontend, /search_open_access_research', \{ query, theme, source \}/, 'The chosen topic must be sent as a separate search filter');
assert.match(frontend, /byId\('discoverTheme'\)\.addEventListener\('change'/, 'Changing the theme must refresh research results');
assert.match(styles, /translateX\(-102%\)/, 'The discovery panel must animate in from the left');
assert.match(styles, /prefers-reduced-motion/, 'Panel motion must respect reduced-motion preferences');
assert.match(rust, /filter=|open_access\.is_oa:true/, 'Search must require an open access location');
assert.match(rust, /title_and_abstract\.search:/, 'The selected topic must narrow results by title and abstract');
assert.match(rust, /fn normalize_research_theme/, 'The theme filter must be bounded and sanitized before building an API filter');
assert.match(vendoredGlib, /let mut p: \*mut libc::c_char[\s\S]*?&mut p,/, 'The vendored GLib out-pointer must use the upstream soundness fix');
const topicTestContext = { window: {} };
runInNewContext(suggestions, topicTestContext);
const suggestedTopics = topicTestContext.window.cartaSuggestTopics(['Toward a New Economic Growth Model for China']);
assert.ok(suggestedTopics.some(topic => topic.toLowerCase() === 'economic growth'), 'Suggestions should infer a useful phrase from a book title');
assert.ok(suggestedTopics.includes('China'), 'Suggestions should include a distinctive title term');
assert.ok(!suggestedTopics.some(topic => /^(toward|new|model|the)$/i.test(topic)), 'Generic title words must not be suggested');
assert.equal(topicTestContext.window.cartaSuggestTopics([]).length, 0, 'An empty library must produce no topic suggestions');
for (const id of ['I909854389', 'I1310145890', 'I153515283', 'I2802905149']) {
  assert.ok(rust.includes(id), `Missing institution identifier ${id}`);
}
assert.match(rust, /"https:\/\/www\.imf\.org\/en\/publications\/rss/, 'IMF news must use its official publication feed');
assert.match(rust, /"https:\/\/www\.ecb\.europa\.eu\/rss\//, 'ECB news must use official RSS feeds');
assert.match(rust, /"https:\/\/www\.federalreserve\.gov\/feeds\//, 'Federal Reserve news must use official RSS feeds');
assert.match(rust, /"https:\/\/blogs\.lse\.ac\.uk\//, 'LSE news must come from an LSE-hosted feed');
assert.match(translations, /'Scopri': 'Discover'/, 'The new library entry point must be translated into English');
assert.match(translations, /'Tema': 'Topic'/, 'The theme filter must be translated into English');
assert.match(translations, /'Ricerche': 'Research'/, 'The research view must be translated into English');
assert.match(translations, /'Notizie': 'News'/, 'The news view must be translated into English');

console.log('Marketplace checks passed: open access filtering, institutional sources, safe rendering, language strings, and left drawer.');
