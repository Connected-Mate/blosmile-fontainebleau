import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { buildPages } from '../scripts/build-pages.mjs';
import { getDirections } from '../server/directions.mjs';

const sourcePath = new URL('../data/content.json', import.meta.url);
const sourceBefore = fs.readFileSync(sourcePath, 'utf8');
const seed = JSON.parse(sourceBefore);
const origin = 'https://connected-mate.github.io';
const siteUrl = origin + '/blosmile-test';
const basePath = '/blosmile-test/';
let directory, output, files, pages;
const read = name => fs.readFileSync(path.join(output, name), 'utf8');
const decode = value => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#34;|&quot;/g, '"');

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blosmile-pages-test-'));
  output = path.join(directory, 'public');
  await buildPages({ siteUrl, outDir: output, indexable: true, preview: { enabled: false } });
  files = fs.readdirSync(output, { recursive: true }).filter(file => fs.statSync(path.join(output, file)).isFile());
  pages = files.filter(file => file.endsWith('.html'));
});
after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

function assertLocalTarget(value, context, relativeBase = siteUrl + '/') {
  if (!value || /^(?:tel:|mailto:|data:|javascript:)/i.test(value)) return;
  const url = new URL(decode(value), relativeBase);
  if (url.origin !== origin) return;
  assert.ok(url.pathname.startsWith(basePath), `${context}: URL escapes the project path: ${value}`);
  const relative = decodeURIComponent(url.pathname.slice(basePath.length));
  const target = path.join(output, relative);
  assert.ok(fs.existsSync(target), `${context}: local target missing: ${value}`);
  if (fs.statSync(target).isDirectory()) assert.ok(fs.existsSync(path.join(target, 'index.html')), `${context}: directory has no index: ${value}`);
}

test('Pages export retains all public pages and every local HTML/CSS target under the project path', () => {
  assert.ok(pages.length >= 40, 'All content, fallback pages and legacy aliases must be exported');
  const required = ['index.html', 'equipe/index.html', 'le-cabinet/index.html', 'venir/index.html', 'contact/index.html', '404.html'];
  for (const service of seed.services) required.push(`soins/${service.slug}/index.html`);
  for (const article of seed.articles) required.push(`conseils/${article.slug}/index.html`);
  for (const file of required) assert.ok(files.includes(file), file);
  for (const file of pages) {
    const html = read(file);
    const pageUrl = siteUrl + '/' + file.replace(/index\.html$/, '');
    for (const [, attribute, value] of html.matchAll(/\b(href|src|action|data-image|data-qr-source|data-qr-page|data-static-page)="([^"]*)"/g)) assertLocalTarget(value, `${file} ${attribute}`, pageUrl);
    assert.doesNotMatch(html, /(?:href|src|action|data-image)="https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/);
  }
  for (const file of files.filter(file => file.endsWith('.css'))) {
    for (const [, value] of read(file).matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) assertLocalTarget(value, file, siteUrl + '/' + file);
  }
});

test('Canonical, social image and structured-data references consistently use the Pages project', () => {
  for (const file of ['index.html', 'equipe/index.html', 'venir/index.html', `conseils/${seed.articles[0].slug}/index.html`]) {
    const html = read(file);
    const canonical = decode(html.match(/<link rel="canonical" href="([^"]+)"/)[1]);
    assert.equal(canonical, siteUrl + '/' + file.replace(/index\.html$/, ''));
    assertLocalTarget(canonical, file);
    const image = decode(html.match(/<meta property="og:image" content="([^"]+)"/)[1]);
    assertLocalTarget(image, file + ' og:image');
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
    const visit = value => {
      if (typeof value === 'string' && value.startsWith(origin)) assertLocalTarget(value, file + ' JSON-LD');
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(graph);
    assert.match(html, /<meta name="robots" content="index, follow/);
  }
  for (const [, url] of read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) assertLocalTarget(url, 'sitemap.xml');
  assert.match(read('sitemap.xml'), /\/blosmile-test\/venir\//);
  assert.doesNotMatch(read('sitemap.xml'), /\/admin|\/api\/|mentions-legales|confidentialite/);
});

test('Every static QR independently decodes to its real destination and has a usable provider fallback', () => {
  for (const provider of getDirections(seed).providers) {
    const relative = `itineraire/${provider.id}.png`;
    const png = PNG.sync.read(fs.readFileSync(path.join(output, relative)));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, provider.url, relative);
    const variant = read(`venir/${provider.id}/index.html`);
    assert.match(variant, new RegExp(`src="${basePath}itineraire/${provider.id}\\.png"`));
    assert.match(variant, /id="transfert-telephone"[^>]*open/);
    assert.ok(variant.includes(provider.url.replace(/&/g, '&amp;')), 'Direct provider link stays usable without JavaScript');
    assert.ok(read('venir/index.html').includes(`${basePath}venir/${provider.id}/`), 'Every provider has a native static navigation fallback');
  }
  assert.doesNotMatch(read('venir/index.html'), /\/itineraire\/qr\.png\?app=/);
  const card = read('cabinet.vcf').replace(/\r\n /g, '');
  assert.match(card, /BEGIN:VCARD\r\nVERSION:3\.0/);
  assert.match(card, /ADR;TYPE=WORK:;;192 Rue Grande;Fontainebleau;;77300;France/);
  assert.doesNotMatch(card, /localhost|127\.0\.0\.1/);
});

test('Static artifact excludes authentication, local state, source files and credentials without mutating the seed', () => {
  for (const file of files) assert.doesNotMatch(file, /(?:^|\/)(?:\.local|\.git|admin|api|node_modules|server|research)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:\.sqlite(?:-wal|-shm)?|\.zip|\.ejs|\.mjs)$|admin-access/i, file);
  for (const file of pages) assert.doesNotMatch(read(file), /href="[^"]*\/admin(?:\/|"|\?)/);
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), sourceBefore);
  assert.match(read('mentions-legales/index.html'), /GitHub/);
  assert.doesNotMatch(read('mentions-legales/index.html'), /hébergement public à renseigner/);
});

test('Pages preview can preserve noindex while retaining correct public canonical links', async () => {
  const preview = path.join(directory, 'preview');
  await buildPages({ siteUrl, outDir: preview, indexable: false, preview: { enabled: false } });
  const html = fs.readFileSync(path.join(preview, 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /rel="canonical" href="https:\/\/connected-mate\.github\.io\/blosmile-test\/"/);
  assert.doesNotMatch(fs.readFileSync(path.join(preview, 'sitemap.xml'), 'utf8'), /<loc>/);
});

test('Default demo forces noindex on every page and alias despite an explicit indexing flag', async () => {
  const output = path.join(directory, 'demo');
  const summary = await buildPages({ siteUrl, outDir: output, indexable: true });
  assert.equal(summary.indexable, false);
  assert.equal(summary.previewEnabled, true);
  assert.equal(summary.preview.enabled, true);
  assert.equal(summary.preview.collaborator, 'Victor Becquet');
  assert.equal(summary.preview.expiresAt, '2026-10-17T17:30:00.000Z');
  const htmlFiles = fs.readdirSync(output, { recursive: true }).filter(file => file.endsWith('.html'));
  assert.ok(htmlFiles.length >= 40);
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(output, file), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive">/, file);
    assert.match(html, /<title>Démo — /, file);
    assert.doesNotMatch(html, /application\/ld\+json/, file);
    assert.match(html, /<meta name="description" content="Prévisualisation temporaire[^\"]*Victor Becquet[^\"]*17 octobre 2026 à 19 h 30/, file);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8'), /<loc>/);
  const robots = fs.readFileSync(path.join(output, 'robots.txt'), 'utf8');
  assert.match(robots, /Allow: \/blosmile-test\//);
  assert.doesNotMatch(robots, /Disallow:|Sitemap:/);
  const llms = fs.readFileSync(path.join(output, 'llms.txt'), 'utf8');
  assert.match(llms, /ne constitue pas le site officiel/);
  assert.match(llms, /accessible aux personnes qui la connaissent/);
  assert.doesNotMatch(llms, /192 Rue Grande|Informations pratiques|Pages de référence|\]\(https?:/);
});
