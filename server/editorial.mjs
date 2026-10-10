export function journalFor(content) {
  const categories = content.services.map(service => ({ id: service.slug, title: service.title }));
  categories.push({ id: 'prevention', title: 'Votre visite & prévention' });
  categories.push({ id: 'autres', title: 'Autres conseils dentaires' });
  const articles = (content.articles || []).map(article => {
    const category = categories.find(category => category.id === article.category) || categories.at(-1);
    const words = [article.title, ...(article.paragraphs || []), ...(article.sections || []).flatMap(section => [section.title, ...section.paragraphs]), article.localContext || ''].join(' ').trim().split(/\s+/).length;
    return { ...article, category: category.id, readingMinutes: Math.max(1, Math.ceil(words / 200)), categoryTitle: category.title };
  });
  const featuredSlugs = content.pages.resources?.featuredSlugs || [];
  const featured = featuredSlugs.map(slug => articles.find(article => article.slug === slug)).filter(Boolean);
  return { articles, categories: categories.filter(category => articles.some(article => article.category === category.id)), featured: featured.length ? featured : articles.slice(0, 3) };
}
