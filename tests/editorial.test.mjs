import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { presentation } from '../server/presentation.mjs';
import { validateContent } from '../server/store.mjs';

const seed = JSON.parse(fs.readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));

test('Every article remains in the journal after its CMS category changes', () => {
  const changed = structuredClone(seed);
  changed.articles[0].category = 'soins-generaux';
  const { journal } = presentation(changed);
  const article = journal.articles.find(item => item.slug === changed.articles[0].slug);
  assert.equal(article.category, 'autres');
  assert.ok(journal.categories.some(category => category.id === article.category));
  for (const item of journal.articles) assert.ok(journal.categories.some(category => category.id === item.category));
  assert.equal(journal.articles.length, seed.articles.length);
});

test('Invalid editorial structures are rejected before they can break a public page', () => {
  for (const mutation of [
    content => { content.articles[0].sections = [{ id: 'intro', title: 'Question', paragraphs: 'not-an-array' }]; },
    content => { content.articles[0].sections = [{ id: 'same', title: 'A', paragraphs: [] }, { id: 'same', title: 'B', paragraphs: [] }]; },
    content => { content.articles[0].questions = [{ question: 'Question', answer: null }]; },
    content => { content.team[0].education = [{ title: 'Diplôme', links: 'bad' }]; },
    content => { content.articles[0].sources = [{ title: 'Source', url: 'javascript:alert(1)' }]; }
  ]) {
    const content = structuredClone(seed);
    mutation(content);
    assert.ok(validateContent(content).length);
  }
  assert.deepEqual(validateContent(seed), []);
});

test('An interior homepage photo preserves the exterior arrival reference and parking destinations', () => {
  const content = presentation(seed);
  assert.notEqual(content.home.heroImage, content.home.arrivalImage);
  for (const parking of content.pages.directions.parking) {
    const walking = new URL(parking.walkingUrl);
    assert.equal(walking.searchParams.get('travelmode'), 'walking');
    assert.match(walking.searchParams.get('destination'), /192.*Fontainebleau/);
    assert.ok(walking.searchParams.get('origin'));
    assert.equal(parking.walkingMinutes, null);
  }
});
