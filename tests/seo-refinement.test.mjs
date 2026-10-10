import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSeo, sitemap, llmsText, getSiteConfig } from '../server/seo.mjs';
import { presentation } from '../server/presentation.mjs';

const seed = JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));
const production = () => ({ ...structuredClone(seed), seo: { ...structuredClone(seed.seo), siteUrl: 'https://cabinet.example.org', indexable: true } });
const graphFor = (content, page, service, article) => JSON.parse(makeSeo(content, page, service, article).jsonLd)['@graph'];
const nodeOfType = (graph, type) => graph.find(node => node['@type'] === type);

test('schema links each page to the site, dentist and canonical URL without duplicate FAQ entities', () => {
  const content = presentation(production());
  for (const [page, type, path] of [['team', 'AboutPage', '/equipe'], ['contact', 'ContactPage', '/contact'], ['directions', 'ContactPage', '/venir'], ['services', 'CollectionPage', '/soins'], ['faq', 'FAQPage', '/questions-frequentes']]) {
    const graph = graphFor(content, page);
    const webPage = nodeOfType(graph, type);
    assert.equal(webPage.url, `https://cabinet.example.org${path}`);
    assert.equal(webPage.about['@id'], 'https://cabinet.example.org/#cabinet');
    assert.equal(webPage.isPartOf['@id'], 'https://cabinet.example.org/#website');
    assert.equal(nodeOfType(graph, 'BreadcrumbList')['@id'], webPage.breadcrumb['@id']);
    if (page === 'faq') {
      assert.equal(graph.filter(node => node['@type'] === 'FAQPage').length, 1);
      assert.equal(webPage.mainEntity.length, content.faq.length);
      assert.doesNotMatch(JSON.stringify(webPage), /\{\{phone\}\}/);
    }
  }
  const home = graphFor(content, 'home');
  assert.equal(nodeOfType(home, 'BreadcrumbList'), undefined);
  assert.equal(nodeOfType(home, 'FAQPage').mainEntity.length, 5);
  const article = content.articles[0];
  const articleGraph = graphFor(content, 'article', undefined, article);
  assert.equal(nodeOfType(articleGraph, 'Article').mainEntityOfPage['@id'], nodeOfType(articleGraph, 'WebPage')['@id']);
  assert.equal(nodeOfType(articleGraph, 'Article').dateModified, undefined);
});

test('structured local facts use the current address, phone, map and explicit closures', () => {
  const content = production();
  content.practice.phone = '01 23 45 67 89';
  content.practice.address = '12 rue de Test';
  content.practice.hours[0].periods = [['09:15', '12:30']];
  const clinic = nodeOfType(graphFor(content, 'contact'), 'Dentist');
  assert.deepEqual(clinic.address, { '@type': 'PostalAddress', streetAddress: '12 rue de Test', addressLocality: 'Fontainebleau', postalCode: '77300', addressRegion: 'Seine-et-Marne', addressCountry: 'FR' });
  assert.equal(clinic.telephone, '+33123456789');
  assert.match(new URL(clinic.hasMap).searchParams.get('query'), /12 rue de Test, 77300 Fontainebleau/);
  assert.doesNotMatch(clinic.hasMap, /192/);
  assert.match(makeSeo(content, 'directions').description, /12 rue de Test, 77300 Fontainebleau/);
  assert.equal(clinic.image, 'https://cabinet.example.org/assets/cabinet-facade-fontainebleau.jpeg');
  assert.equal(clinic.openingHoursSpecification[0].opens, '09:15');
  for (const day of ['Saturday', 'Sunday']) {
    const closure = clinic.openingHoursSpecification.find(item => item.dayOfWeek.endsWith(day));
    assert.equal(closure.opens, '00:00');
    assert.equal(closure.closes, '00:00');
  }
  content.practice.geo = { lat: 0, lng: 0 };
  assert.deepEqual(nodeOfType(graphFor(content, 'contact'), 'Dentist').geo, { '@type': 'GeoCoordinates', latitude: 0, longitude: 0 });
  content.practice.geo.lat = 91;
  assert.equal(nodeOfType(graphFor(content, 'contact'), 'Dentist').geo, undefined);
});

test('every indexable page has a distinct title, description and canonical, including directions', () => {
  const content = production();
  const pages = ['home', 'team', 'cabinet', 'services', 'contact', 'directions', 'faq', 'resources'].map(page => makeSeo(content, page));
  pages.push(...content.services.map(service => makeSeo(content, 'service', service)));
  pages.push(...content.articles.map(article => makeSeo(content, 'article', undefined, article)));
  for (const field of ['title', 'description', 'canonical']) {
    assert.equal(new Set(pages.map(page => page[field])).size, pages.length, field);
    assert.ok(pages.every(page => typeof page[field] === 'string' && page[field].length));
  }
  assert.ok(pages.every(page => page.noindex === false));
});

test('sitemap excludes nonindexable pages and emits only validated page-specific modification dates', () => {
  const content = production();
  const unchanged = sitemap(content, '2026-10-10T00:00:00Z');
  assert.doesNotMatch(unchanged, /<lastmod>/);
  assert.match(unchanged, /<loc>https:\/\/cabinet\.example\.org\/venir<\/loc>/);
  assert.doesNotMatch(unchanged, /mentions-legales|confidentialite|\/admin/);
  content.articles[0].updatedAt = '2025-02-12T14:00:00Z';
  content.articles[1].updatedAt = '2025-02-30';
  content.articles[2].updatedAt = '2099-01-01';
  content.articles.push(content.articles[0]);
  const result = sitemap(content);
  assert.equal((result.match(/<lastmod>/g) || []).length, 1);
  assert.match(result, /<lastmod>2025-02-12T14:00:00Z<\/lastmod>/);
  assert.equal((result.match(new RegExp(`<loc>https://cabinet.example.org/conseils/${content.articles[0].slug}</loc>`, 'g')) || []).length, 1);
  content.seo.indexable = false;
  assert.doesNotMatch(sitemap(content), /<loc>/);
});

test('the factual text export includes full address, hours, closures, contact method and all advice links', () => {
  const content = production();
  const result = llmsText(content);
  assert.match(result, /192 Rue Grande, 77300 Fontainebleau, FR/);
  assert.match(result, /Lundi : 08:00–12:00 · 14:00–19:00/);
  assert.match(result, /Samedi : Fermé/);
  assert.match(result, /Rendez-vous : par téléphone/);
  assert.match(result, /https:\/\/cabinet\.example\.org\/venir/);
  assert.equal((result.match(/https:\/\/cabinet\.example\.org\/conseils\//g) || []).length, content.articles.length);
});

test('LAN, loopback and reserved local hosts cannot be indexed even if the checkbox is enabled', () => {
  const content = production();
  for (const hostname of ['localhost', 'localhost.', '127.0.0.1', '192.168.1.42', '10.0.0.1', '172.16.0.20', '169.254.1.3', '[::]', '[::1]', '[fd00::1]', '[fe80::1]', 'cabinet.local', 'cabinet.internal', 'cabinet']) {
    content.seo.siteUrl = `http://${hostname}:3000`;
    assert.equal(getSiteConfig(content).indexable, false, hostname);
  }
  content.seo.siteUrl = 'https://cabinet.example.org';
  assert.equal(getSiteConfig(content).indexable, true);
});
