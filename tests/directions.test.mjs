import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { createApp } from '../server/index.mjs';
import { getDirections, contactCard } from '../server/directions.mjs';
import { validateContent } from '../server/store.mjs';
import { makeSeo } from '../server/seo.mjs';
import { presentation } from '../server/presentation.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));

test('address edits update every provider, visible location and downloadable contact', () => {
  const content = structuredClone(seed);
  Object.assign(content.practice, { address: '8 Rue de l’Église & des Arts', postalCode: '75001', city: 'Paris' });
  const shown = presentation(content), routes = shown.directions;
  assert.equal(routes.addressLine, '8 Rue de l’Église & des Arts, 75001 Paris');
  for (const provider of routes.providers) {
    const params = new URL(provider.url).searchParams;
    assert.equal(params.get('destination') || params.get('q') || params.get('daddr'), routes.destination);
    assert.equal(new URL(provider.url).protocol, 'https:');
    assert.doesNotMatch(provider.url, /127\.0\.0\.1|192\+Rue/);
  }
  assert.match(shown.home.heroCaption, /8 Rue de l’Église & des Arts · Paris/);
  assert.match(shown.pages.contact.access, /8 Rue de l’Église & des Arts à Paris/);
  assert.equal(new URL(shown.practice.mapUrl).searchParams.get('query'), routes.destination);
  const seo = makeSeo(content, 'home');
  assert.match(seo.description, /8 Rue de l’Église & des Arts/);
  assert.match(seo.title, /Paris/);
  assert.doesNotMatch(seo.description, /192 rue Grande|Fontainebleau|\{\{/i);
  const card = contactCard(content);
  assert.match(card, /ADR;TYPE=WORK:;;8 Rue de l’Église & des Arts;Paris;;75001;France/);
  assert.match(card, /TEL;TYPE=WORK,VOICE:\+33164222303/);
  assert.ok(card.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  content.practice.address='é'.repeat(500);
  assert.ok(validateContent(content).some(error=>error.includes('trop longue')));
});

test('generated QR images decode to the exact chosen destination and change after CMS edits', async t => {
  const { app, store } = createApp({ dbPath: ':memory:', accessPath: false, initialPassword: 'test-only-temporary-password' });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function decode(provider) {
    const response = await fetch(base + '/itineraire/qr.png?app=' + provider.id);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/png/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(decoded, 'The rendered PNG must be readable by an independent QR decoder');
    assert.equal(decoded.data, provider.url);
  }
  for (const provider of getDirections(seed).providers) await decode(provider);
  const changed = structuredClone(seed); changed.practice.address = '8 Rue de l’Église';
  store.saveContent(changed);
  await decode(getDirections(changed).providers[0]);
  assert.equal((await fetch(base + '/itineraire/qr.png?app=unknown')).status, 400);
  const response = await fetch(base + '/cabinet.vcf');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.match((await response.text()).replace(/\r\n /g, ''), /8 Rue de l’Église/);
  const html = await (await fetch(base + '/venir?app=waze')).text();
  assert.match(html, /value="waze" selected/);
  assert.match(html, /id="transfert-telephone"[^>]*open/);
  assert.match(html, /src="\/itineraire\/qr.png\?app=waze"/);
  assert.doesNotMatch(html, /\{\{address\}\}|\[object Object\]/);
});
