(() => {
  'use strict';
  const root = document.querySelector('[data-journal]');
  if (!root) return;
  const search = root.querySelector('[data-journal-search]');
  const cards = Array.from(root.querySelectorAll('[data-journal-card]'));
  const groups = Array.from(root.querySelectorAll('[data-journal-group]'));
  const filters = Array.from(root.querySelectorAll('[data-category-filter]'));
  let category = 'all';
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  function update() {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    let count = 0;
    for (const card of cards) {
      card.hidden = !((category === 'all' || card.dataset.category === category) && terms.every(term => normalize(card.dataset.search).includes(term)));
      if (!card.hidden) count += 1;
    }
    for (const group of groups) group.hidden = !Array.from(group.querySelectorAll('[data-journal-card]')).some(card => !card.hidden);
    for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === category));
    root.querySelector('[data-journal-count]').textContent = `${count} conseil${count === 1 ? '' : 's'} ${count === 1 ? 'trouvé' : 'trouvés'}`;
    root.querySelector('[data-journal-empty]').hidden = count !== 0;
  }
  search.addEventListener('input', update);
  for (const button of filters) button.addEventListener('click', () => { category = button.dataset.categoryFilter; update(); });
  root.querySelector('[data-journal-reset]').addEventListener('click', () => { category = 'all'; search.value = ''; update(); search.focus(); });
  root.querySelector('[data-journal-controls]').hidden = false;
  root.querySelector('[data-journal-fallback]').hidden = true;
})();
