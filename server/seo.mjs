import { getDirections } from './directions.mjs';

const definitions = {
  home: { path: '/', title: 'Blosmile — Cabinet dentaire à Fontainebleau', description: 'Découvrez Blosmile, votre cabinet dentaire à Fontainebleau : équipe, soins dentaires, informations pratiques et prise de rendez-vous.' },
  formations: { path: '/formations', title: 'Parcours et formations des dentistes à Fontainebleau | Blosmile', description: 'Les cursus universitaires et formations publiés par les chirurgiens-dentistes Blosmile à Fontainebleau, avec les liens vers les établissements.' },
  team: { path: '/equipe', title: 'Notre équipe de chirurgiens-dentistes à Fontainebleau | Blosmile', description: 'Rencontrez les praticiens et l’équipe du cabinet dentaire Blosmile à Fontainebleau.' },
  cabinet: { path: '/le-cabinet', title: 'Le cabinet dentaire à Fontainebleau | Blosmile', description: 'Découvrez le cabinet dentaire Blosmile à Fontainebleau, ses espaces et son approche des soins.' },
  services: { path: '/soins', title: 'Les soins dentaires à Fontainebleau | Blosmile', description: 'Informations sur les soins proposés au cabinet dentaire Blosmile à Fontainebleau et leur déroulement.' },
  directions: { path: '/venir', title: 'Venir au cabinet dentaire à Fontainebleau | Blosmile', description: 'Retrouvez l’adresse du cabinet Blosmile à Fontainebleau, choisissez votre itinéraire avec Google Maps, Waze ou Plans, et préparez votre venue.' },
  contact: { path: '/contact', title: 'Contact et accès au cabinet à Fontainebleau | Blosmile', description: 'Adresse, téléphone, horaires et accès au cabinet dentaire Blosmile à Fontainebleau.' },
  faq: { path: '/questions-frequentes', title: 'Vos questions sur le cabinet dentaire | Blosmile Fontainebleau', description: 'Les réponses aux questions pratiques sur les rendez-vous, les soins et votre venue au cabinet Blosmile à Fontainebleau.' },
  resources: { path: '/conseils', title: 'Conseils dentaires et informations sur les soins | Blosmile Fontainebleau', description: 'Des informations générales sur les soins dentaires pour préparer vos échanges avec les chirurgiens-dentistes Blosmile à Fontainebleau.' },
  legal: { path: '/mentions-legales', title: 'Mentions légales | Blosmile', description: 'Informations légales relatives au site du cabinet dentaire Blosmile à Fontainebleau.' },
  privacy: { path: '/confidentialite', title: 'Protection de vos données | Blosmile', description: 'Informations sur la protection des données et la confidentialité du site du cabinet dentaire Blosmile.' },
  notfound: { path: '', title: 'Page introuvable | Blosmile', description: 'Cette page est introuvable. Retrouvez les informations du cabinet dentaire Blosmile à Fontainebleau.' }
};

export function getSiteConfig(content) {
  const configured = process.env.SITE_URL || content.seo?.siteUrl || '';
  let siteUrl = '';
  try {
    const url = new URL(configured);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) siteUrl = url.origin;
  } catch { /* A production hostname is intentionally optional in local mode. */ }
  let publicHost = false;
  if (siteUrl) {
    const host = new URL(siteUrl).hostname.replace(/\.$/, '');
    const privateIpv4 = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(host);
    const privateIpv6 = /^\[(?:::1?$|::ffff:|f[cd]|fe[89ab])/i.test(host.replace(/\]$/, ''));
    publicHost = !privateIpv4 && !privateIpv6 && !/^(?:localhost|0)$/i.test(host) && !/(?:^|\.)(?:local|localhost|test|invalid|example|internal|home|lan)$/i.test(host) && (host.includes('.') || host.startsWith('['));
  }
  const indexable = publicHost && (content.seo?.indexable === true || content.seo?.indexingEnabled === true);
  return { siteUrl, indexable };
}

const weekdays = { Lundi: 'Monday', Mardi: 'Tuesday', Mercredi: 'Wednesday', Jeudi: 'Thursday', Vendredi: 'Friday', Samedi: 'Saturday', Dimanche: 'Sunday' };
const arrayValue = value => Array.isArray(value) ? value : [];
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const textValue = value => typeof value === 'string' ? value : '';
const imageValue = value => textValue(value) || textValue(value?.src) || textValue(value?.url);
const absoluteUrl = (value, base) => {
  if (!textValue(value) || !base) return '';
  try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
};

function postalAddress(practice) {
  const address = practice.address;
  const fields = typeof address === 'object' && address ? address : {};
  return {
    '@type': 'PostalAddress',
    streetAddress: textValue(address) || textValue(fields.street || fields.streetAddress || fields.line1),
    addressLocality: textValue(fields.city || fields.addressLocality || practice.city),
    postalCode: textValue(fields.postalCode || fields.zip || practice.postalCode),
    addressRegion: textValue(fields.region || fields.addressRegion || practice.department),
    addressCountry: textValue(fields.country || fields.addressCountry || practice.country) || 'FR'
  };
}

function openingHours(practice) {
  const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return arrayValue(practice.hours).flatMap(item => {
    if (!weekdays[item?.day] || !Array.isArray(item.periods)) return [];
    const day = { '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${weekdays[item.day]}` };
    // An empty list explicitly means closed in the CMS and the visible timetable.
    if (!item.periods.length) return [{ ...day, opens: '00:00', closes: '00:00' }];
    return item.periods.filter(period => Array.isArray(period) && period.length === 2 && period.every(isTime)).map(period => ({ ...day, opens: period[0], closes: period[1] }));
  });
}

const validModifiedDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return '';
  const time = Date.parse(value);
  const calendarDate = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) && Number.isFinite(calendarDate) && time <= Date.now() && new Date(calendarDate).toISOString().slice(0, 10) === value.slice(0, 10) ? value : '';
};

export function makeSeo(content, page, service, article) {
  const { siteUrl, indexable } = getSiteConfig(content);
  const base = definitions[page] || definitions.notfound;
  const metadata = content.seo?.pages?.[page] || content.pages?.[page]?.seo || {};
  const directions = getDirections(content);
  const defaultDescription = page === 'directions' && directions.addressLine ? `Rejoignez Blosmile au ${directions.addressLine}. Itinéraires Google Maps, Waze et Apple Plans, adresse à enregistrer et QR code pour votre téléphone.` : base.description;
  const serviceTitle = textValue(service?.title) || textValue(service?.name) || 'Soins dentaires';
  const path = page === 'service' ? `/soins/${service.slug}` : page === 'article' ? `/conseils/${article.slug}` : base.path;
  const rawTitle = page === 'article' ? article.seoTitle || `${article.title} | Blosmile Fontainebleau` : page === 'service' ? service.seoTitle || service.seo?.title || `${serviceTitle} à Fontainebleau | Blosmile` : metadata.title || (page === 'home' && content.seo?.title) || base.title;
  const rawDescription = page === 'article' ? article.seoDescription || article.description || article.summary || '' : page === 'service' ? service.seoDescription || service.seo?.description || service.description || service.excerpt || `Informations sur ${serviceTitle.toLowerCase()} au cabinet dentaire Blosmile à Fontainebleau.` : metadata.description || (page === 'home' && content.seo?.description) || defaultDescription;
  const resolveFacts = value => textValue(value).replace(/\{\{(address|postalCode|city|phone)\}\}/g,(_,key)=>textValue(content.practice?.[key]));
  const title = resolveFacts(rawTitle) || base.title;
  const description = resolveFacts(rawDescription) || defaultDescription;
  const practice = content.practice || {};
  const address = postalAddress(practice);
  const telephone = (textValue(practice.phone) || textValue(practice.telephone) || textValue(practice.phoneInternational)).replace(/[^+\d]/g, '').replace(/^0/, '+33');
  const clinic = {
    '@type': 'Dentist',
    name: practice.name || 'Blosmile',
    description: resolveFacts(content.seo?.description) || definitions.home.description,
    ...(siteUrl ? { '@id': `${siteUrl}/#cabinet`, url: `${siteUrl}/` } : {}),
    ...(telephone ? { telephone } : {}),
    ...(textValue(practice.email) ? { email: practice.email } : {}),
    ...(address.streetAddress ? { address } : {}),
    ...(absoluteUrl(imageValue(practice.heroImage || content.seo?.ogImage), siteUrl) ? { image: absoluteUrl(imageValue(practice.heroImage || content.seo?.ogImage), siteUrl) } : {}),
    ...(absoluteUrl(imageValue(practice.logo), siteUrl) ? { logo: absoluteUrl(imageValue(practice.logo), siteUrl) } : {}),
    ...(Number.isFinite(practice.geo?.lat) && Number.isFinite(practice.geo?.lng) && Math.abs(practice.geo.lat) <= 90 && Math.abs(practice.geo.lng) <= 180 ? { geo: { '@type': 'GeoCoordinates', latitude: practice.geo.lat, longitude: practice.geo.lng } } : {}),
    ...(address.streetAddress ? { hasMap: directions.mapUrl } : {}),
    ...(Array.isArray(practice.hours) ? { openingHoursSpecification: openingHours(practice) } : {})
  };
  const graph = [clinic];
  if (page === 'service') graph.push({ '@type': 'Service', ...(siteUrl ? { '@id': `${siteUrl}${path}#service` } : {}), name: serviceTitle, description: textValue(description), areaServed: { '@type': 'City', name: practice.city || 'Fontainebleau' }, ...(siteUrl ? { url: `${siteUrl}${path}`, provider: { '@id': `${siteUrl}/#cabinet` } } : {}) });
  if (page === 'article') graph.push({ '@type': 'Article', ...(siteUrl ? { '@id': `${siteUrl}${path}#article`, mainEntityOfPage: { '@id': `${siteUrl}${path}#webpage` } } : {}), headline: article.title, description: textValue(description), inLanguage: 'fr-FR', ...(siteUrl ? { url: `${siteUrl}${path}`, publisher: { '@id': `${siteUrl}/#cabinet` } } : {}), ...(absoluteUrl(imageValue(article.image), siteUrl) ? { image: absoluteUrl(imageValue(article.image), siteUrl) } : {}), ...(validModifiedDate(article.updatedAt) ? { dateModified: article.updatedAt } : {}) });
  if (siteUrl && page !== 'notfound') {
    const crumbs = [{ '@type': 'ListItem', position: 1, name: 'Accueil', item: `${siteUrl}/` }];
    if (page === 'service') crumbs.push({ '@type': 'ListItem', position: 2, name: 'Les soins', item: `${siteUrl}/soins` });
    if (page === 'article') crumbs.push({ '@type': 'ListItem', position: 2, name: 'Conseils dentaires', item: `${siteUrl}/conseils` });
    if (page !== 'home') crumbs.push({ '@type': 'ListItem', position: crumbs.length + 1, name: page === 'article' ? article.title : page === 'service' ? serviceTitle : title.split('|')[0].trim(), item: `${siteUrl}${path}` });
    if (page !== 'home') graph.push({ '@type': 'BreadcrumbList', '@id': `${siteUrl}${path}#breadcrumb`, itemListElement: crumbs });
    graph.push({ '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: `${siteUrl}/`, name: textValue(content.seo?.siteName) || practice.name || 'Blosmile', inLanguage: 'fr-FR', publisher: { '@id': `${siteUrl}/#cabinet` } });
  }
  if (page !== 'notfound') {
    const types = { formations: 'AboutPage', team: 'AboutPage', cabinet: 'AboutPage', contact: 'ContactPage', directions: 'ContactPage', services: 'CollectionPage', resources: 'CollectionPage', faq: 'FAQPage' };
    graph.push({
      '@type': types[page] || 'WebPage', name: title, description, inLanguage: 'fr-FR',
      ...(siteUrl ? {
        '@id': `${siteUrl}${path}#webpage`, url: `${siteUrl}${path}`,
        isPartOf: { '@id': `${siteUrl}/#website` }, about: { '@id': `${siteUrl}/#cabinet` },
        ...(page !== 'home' ? { breadcrumb: { '@id': `${siteUrl}${path}#breadcrumb` } } : {}),
        ...(['service', 'article'].includes(page) ? { mainEntity: { '@id': `${siteUrl}${path}#${page}` } } : {})
      } : {})
    });
  }
  if (['home', 'faq'].includes(page) && arrayValue(content.faq).length) {
    const mainEntity = (page === 'home' ? content.faq.slice(0, 5) : content.faq).filter(item => textValue(item.question || item.q) && textValue(item.answer || item.a)).map(item => ({ '@type': 'Question', name: item.question || item.q, acceptedAnswer: { '@type': 'Answer', text: item.answer || item.a } }));
    if (page === 'faq') graph.at(-1).mainEntity = mainEntity;
    else graph.push({ '@type': 'FAQPage', ...(siteUrl ? { '@id': `${siteUrl}/#questions`, isPartOf: { '@id': `${siteUrl}/#webpage` } } : {}), mainEntity });
  }
  if (page === 'team') for (const member of arrayValue(content.team)) {
    if (!member.name) continue;
    graph.push({ '@type': 'Person', ...(siteUrl && /^[a-z0-9-]+$/.test(member.id) ? { '@id': `${siteUrl}/equipe#${member.id}` } : {}), name: member.name, ...(member.role ? { jobTitle: member.role } : {}), ...(absoluteUrl(imageValue(member.image || member.photo), siteUrl) ? { image: absoluteUrl(imageValue(member.image || member.photo), siteUrl) } : {}), ...(siteUrl ? { worksFor: { '@id': `${siteUrl}/#cabinet` } } : {}) });
  }
  return {
    title: textValue(title), description: textValue(description).slice(0, 320),
    canonical: siteUrl && page !== 'notfound' ? `${siteUrl}${path}` : '',
    noindex: !indexable || ['notfound', 'legal', 'privacy'].includes(page),
    robots: !indexable || page === 'notfound' ? 'noindex, nofollow' : ['legal', 'privacy'].includes(page) ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    ogImage: absoluteUrl(imageValue(article?.image || service?.image || content.seo?.ogImage || content.home?.image || content.home?.heroImage || practice.logo), siteUrl),
    siteUrl, indexable, jsonLd: safeJson({ '@context': 'https://schema.org', '@graph': graph })
  };
}

export function sitemap(content) {
  const { siteUrl, indexable } = getSiteConfig(content);
  const xmlEscape = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
  // A global CMS save is not evidence that every page was meaningfully modified.
  // Include lastmod only when that page has its own valid modification date.
  const pages = indexable ? [
    ...Object.entries(definitions).filter(([key]) => !['notfound', 'legal', 'privacy'].includes(key)).map(([key, value]) => ({ path: value.path, modified: validModifiedDate(content.pages?.[key]?.updatedAt || (key === 'home' && content.home?.updatedAt)) })),
    ...arrayValue(content.services).filter(item => /^[a-z0-9-]+$/.test(item.slug)).map(item => ({ path: `/soins/${item.slug}`, modified: validModifiedDate(item.updatedAt) })),
    ...arrayValue(content.articles).filter(item => /^[a-z0-9-]+$/.test(item.slug)).map(item => ({ path: `/conseils/${item.slug}`, modified: validModifiedDate(item.updatedAt) }))
  ] : [];
  const uniquePages = [...new Map(pages.map(page => [page.path, page])).values()];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${uniquePages.map(page => `<url><loc>${xmlEscape(siteUrl + page.path)}</loc>${page.modified ? `<lastmod>${xmlEscape(page.modified)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}

export function llmsText(content) {
  const practice = content.practice || {};
  const { siteUrl, indexable } = getSiteConfig(content);
  const address = postalAddress(practice);
  const addressText = [address.streetAddress, [address.postalCode, address.addressLocality].filter(Boolean).join(' '), address.addressCountry].filter(Boolean).join(', ');
  const hours = arrayValue(practice.hours).filter(item => weekdays[item?.day]).map(item => `- ${item.day} : ${Array.isArray(item.periods) ? item.periods.length ? item.periods.map(period => arrayValue(period).join('–')).join(' · ') : 'Fermé' : textValue(item.hours) || 'À confirmer'}`).join('\n');
  const label = value => textValue(value).replace(/[\r\n\[\]]/g, ' ').trim();
  const links = [
    ...Object.entries(definitions).filter(([key]) => !['notfound', 'legal', 'privacy'].includes(key)).map(([, value]) => `- [${label(value.title.split('|')[0])}](${siteUrl}${value.path})`),
    ...arrayValue(content.services).filter(service => /^[a-z0-9-]+$/.test(service.slug)).map(service => `- [${label(service.title || service.name)}](${siteUrl}/soins/${service.slug})`)
  ].join('\n');
  const articles = arrayValue(content.articles).filter(article => /^[a-z0-9-]+$/.test(article.slug)).map(article => `- [${label(article.title)}](${siteUrl}/conseils/${article.slug})`).join('\n');
  return `# ${practice.name || 'Blosmile'} — Cabinet dentaire à ${practice.city || 'Fontainebleau'}

> Informations factuelles du cabinet. Les informations du site ne remplacent pas une consultation.

${!indexable ? 'Version locale de travail : contenu à valider avant publication.\n\n' : ''}## Informations pratiques

- Adresse : ${addressText || 'À renseigner'}
- Téléphone : ${practice.phone || practice.telephone || 'À renseigner'}
${practice.email ? `- E-mail : ${practice.email}\n` : ''}${practice.appointmentMethod === 'telephone' ? '- Rendez-vous : par téléphone auprès du secrétariat.\n' : ''}${address.streetAddress ? `- Plan : ${getDirections(content).mapUrl}\n` : ''}
## Horaires

${hours || 'Horaires à confirmer auprès du secrétariat.'}

## Équipe

${arrayValue(content.team).map(member => `- ${member.name}${member.role ? ` — ${member.role}` : ''}`).join('\n')}

## Pages de référence

${links}
${articles ? `\n## Conseils dentaires\n\n${articles}\n` : ''}`;
}
