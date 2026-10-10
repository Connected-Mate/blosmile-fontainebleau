import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { releasePages } from '../scripts/release-pages.mjs';

const siteUrl = 'https://connected-mate.github.io/blosmile-test';
const preview = JSON.parse(await fs.readFile(new URL('../data/preview.json', import.meta.url), 'utf8'));
const deadline = Date.parse(preview.expiresAt);
const marker = '.blosmile-pages-build.json';

test('Publication keeps the preview before its deadline and removes all routes and assets at the exact boundary', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blosmile-lifecycle-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outDir = path.join(directory, 'public');
  const live = await releasePages({ now: deadline - 1, siteUrl, outDir, preview });
  assert.equal(live.expired, false);
  assert.equal(live.indexable, false);
  assert.ok(live.pages >= 30);
  await fs.access(path.join(outDir, 'equipe/index.html'));
  await fs.access(path.join(outDir, 'itineraire/google.png'));
  await fs.access(path.join(outDir, 'assets'));
  const previousHtml = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(previousHtml, /noindex, nofollow, noarchive/);

  const closed = await releasePages({ now: deadline, siteUrl, outDir, preview });
  assert.equal(closed.expired, true);
  assert.equal(closed.indexable, false);
  assert.equal(closed.pages, 0);
  const files = (await fs.readdir(outDir, { recursive: true })).sort();
  assert.deepEqual(files, [marker, '.nojekyll', '404.html', 'index.html', 'llms.txt', 'robots.txt', 'sitemap.xml'].sort());
  const home = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(home, /prévisualisation<br>est maintenant fermée/);
  assert.match(home, /Victor Becquet/);
  assert.match(home, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.doesNotMatch(home, /(?:src|href)="|192 Rue Grande|application\/ld\+json|data-demo-dialog/);
  assert.equal(await fs.readFile(path.join(outDir, '404.html'), 'utf8'), home);
  assert.doesNotMatch(await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8'), /<loc>/);
  assert.equal(JSON.parse(await fs.readFile(path.join(outDir, marker), 'utf8')).expired, true);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['public'], 'No previous assets remain beside the completed export');

  const later = await releasePages({ now: deadline + 86400000, siteUrl, outDir, preview });
  assert.equal(later.expired, true, 'Later pushes cannot accidentally restore the expired preview');
  assert.deepEqual((await fs.readdir(outDir, { recursive: true })).sort(), files);
});

test('Expired publication refuses a foreign output and preserves its files', async t => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blosmile-foreign-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(outDir, 'keep.txt'), 'unrelated user file');
  await assert.rejects(releasePages({ now: deadline, siteUrl, outDir, preview }), /fichiers étrangers/);
  assert.equal(await fs.readFile(path.join(outDir, 'keep.txt'), 'utf8'), 'unrelated user file');
  assert.deepEqual(await fs.readdir(outDir), ['keep.txt']);
});

test('Invalid expiry configuration cannot silently publish a demonstration', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'blosmile-invalid-expiry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outDir = path.join(directory, 'public');
  await assert.rejects(releasePages({ now: deadline, siteUrl, outDir, preview: { ...preview, expiresAt: 'invalid' } }), /date de retrait/);
  await assert.rejects(releasePages({ now: NaN, siteUrl, outDir, preview }), /date de publication/);
  assert.deepEqual(await fs.readdir(directory), []);
});
