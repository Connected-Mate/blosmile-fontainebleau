import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ejs from 'ejs';
import QRCode from 'qrcode';
import { presentation } from '../server/presentation.mjs';
import { makeSeo, sitemap, llmsText, getSiteConfig } from '../server/seo.mjs';
import { contactCard } from '../server/directions.mjs';
import { validateContent } from '../server/store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const marker = '.blosmile-pages-build.json';
const publicPages = {
  '/': 'home', '/equipe': 'team', '/formations': 'formations', '/le-cabinet': 'cabinet', '/soins': 'services',
  '/contact': 'contact', '/venir': 'directions', '/questions-frequentes': 'faq',
  '/mentions-legales': 'legal', '/confidentialite': 'privacy', '/conseils': 'resources'
};
const legacyAliases = {
  '/l-equipe': '/equipe', '/nos-cabinets': '/le-cabinet', '/notre-clinique': '/le-cabinet',
  '/le-cabinet-dentaire': '/le-cabinet', '/implantologie': '/soins/implantologie',
  '/esthetique': '/soins/esthetique', '/endodontie': '/soins/endodontie',
  '/parodontologie': '/soins/parodontologie', '/contactez-nous': '/contact',
  '/contactez-nous-1': '/contact', '/politique-de-confidentialite': '/confidentialite',
  '/cgu': '/mentions-legales'
};
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const decodeHtml = value => value.replace(/&amp;/g, '&').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)));
const jsonForHtml = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function configuration(input) {
  if (!input) throw new Error('PAGES_URL est obligatoire, par exemple https://compte.github.io/blosmile-fontainebleau.');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('PAGES_URL doit être une URL HTTPS publique sans identifiants, paramètres ni fragment.');
  const basePath = url.pathname.replace(/\/+$/, '');
  if (basePath.split('/').some(segment => segment && !/^[a-zA-Z0-9._~-]+$/.test(segment))) throw new Error('PAGES_URL contient un chemin de dépôt non pris en charge.');
  const siteUrl = url.origin + basePath;
  return { origin: url.origin, basePath, siteUrl };
}

// The server intentionally treats SITE_URL as an origin. Normalize the generated
// SEO in this exporter; leave the local server and its administration unchanged.
function withSeoOrigin(origin, callback) {
  const previous = process.env.SITE_URL;
  process.env.SITE_URL = origin;
  try { return callback(); }
  finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
}

async function existingOutputIsSafe(outDir) {
  if (outDir === root || root.startsWith(outDir + path.sep) || outDir === path.parse(outDir).root) throw new Error('Le dossier de sortie ne peut pas être le projet ou un de ses parents.');
  for (const reserved of ['public', 'server', 'views', 'data', 'scripts', 'tests', 'research', 'node_modules', '.git', '.local']) {
    const folder = path.join(root, reserved);
    if (outDir === folder || outDir.startsWith(folder + path.sep)) throw new Error(`Dossier de sortie réservé : ${reserved}.`);
  }
  try {
    const stat = await fs.lstat(outDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('La sortie existante doit être un dossier ordinaire.');
    const entries = await fs.readdir(outDir);
    if (entries.length && !entries.includes(marker)) throw new Error('La sortie contient des fichiers étrangers à cet export. Choisissez un dossier vide.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function listFiles(directory, prefix = '') {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Lien symbolique refusé dans le site public : ${relative}`);
    if (entry.isDirectory()) found.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

export async function buildPages({ siteUrl = process.env.PAGES_URL, outDir = process.env.PAGES_OUTPUT || path.join(root, 'dist'), indexable = process.env.PAGES_INDEXABLE !== 'false', preview } = {}) {
  const config = configuration(siteUrl);
  preview ??= JSON.parse(await fs.readFile(path.join(root, 'data/preview.json'), 'utf8'));
  if (!preview || typeof preview.enabled !== 'boolean') throw new Error('La configuration de démonstration doit définir enabled à true ou false.');
  if (preview.enabled && (!Number.isFinite(Date.parse(preview.expiresAt)) || !['collaborator', 'expiresLabel', 'version'].every(key => typeof preview[key] === 'string' && preview[key].trim()))) throw new Error('La démonstration doit définir son auteur, sa date de retrait et sa version.');
  // Preview status wins over CLI flags and saved SEO options. The public preview
  // must never become indexable because an old deployment still sets "true".
  indexable = Boolean(indexable) && !preview.enabled;
  const previewDescription = preview.enabled ? `Prévisualisation temporaire du projet de démonstration Blosmile, réalisé avec ${preview.collaborator}. URL soumise à une consigne de non-indexation. Retrait prévu le ${preview.expiresLabel}.` : '';
  outDir = path.resolve(outDir);
  await existingOutputIsSafe(outDir);
  const raw = JSON.parse(await fs.readFile(path.join(root, 'data/content.json'), 'utf8'));
  const errors = validateContent(raw);
  if (errors.length) throw new Error(`Contenu invalide :\n${errors.join('\n')}`);
  // Only this in-memory public copy is adapted. The CMS database and seed stay intact.
  raw.seo = { ...raw.seo, siteUrl: config.origin, indexable: Boolean(indexable), indexingEnabled: Boolean(indexable) };
  if (!withSeoOrigin(config.origin, () => getSiteConfig(raw)).siteUrl || (indexable && !withSeoOrigin(config.origin, () => getSiteConfig(raw)).indexable)) throw new Error('L’URL fournie ne correspond pas à un hôte public indexable.');
  raw.legal.host = 'GitHub Pages — GitHub, Inc. Service d’hébergement : https://pages.github.com/.';
  raw.legal.missingFields = (raw.legal.missingFields || []).map(field => field === 'Hébergeur et éditeur du nouveau site' ? 'Identité juridique de l’éditeur du site' : field);
  const adminPrivacy = raw.pages.privacy?.sections?.find(section => section.title === 'Espace cabinet');
  if (adminPrivacy) adminPrivacy.paragraphs = ['Cette version publique est un site statique hébergé sur GitHub Pages. Elle ne comporte ni espace d’administration connecté ni cookie d’authentification. Le cabinet conserve séparément son outil local de gestion des contenus, qui n’est pas accessible depuis ce site. Aucun dossier patient n’y est publié.'];
  if (Array.isArray(raw.pages.privacy?.sections)) raw.pages.privacy.sections.push({ title: 'Hébergement', paragraphs: ['Ce site est hébergé sur GitHub Pages. GitHub reçoit et enregistre l’adresse IP des visiteurs à des fins de sécurité. Pour plus d’informations sur le service : https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages.'] });
  const content = presentation(raw);
  content.preview = { ...preview };
  content.directions.providers = content.directions.providers.map(provider => ({ ...provider, staticImageUrl: `/itineraire/${provider.id}.png`, staticPageUrl: `/venir/${provider.id}/` }));
  const routes = Object.entries(publicPages).map(([route, page]) => ({ route, page, service: null, article: null }));
  for (const service of content.services) routes.push({ route: `/soins/${service.slug}`, page: 'service', service, article: null });
  for (const article of content.articles || []) routes.push({ route: `/conseils/${article.slug}`, page: 'article', service: null, article });
  const aliases = { ...legacyAliases };
  for (const article of content.articles || []) aliases[`/blog/articles/${article.slug}`] = `/conseils/${article.slug}`;
  const variants = content.directions.providers.map(qrProvider => ({ route: qrProvider.staticPageUrl.replace(/\/$/, ''), page: 'directions', service: null, article: null, qrProvider, variant: true }));
  const routeSet = new Set([...routes, ...variants].map(item => item.route).concat(Object.keys(aliases)));
  const localPath = value => {
    const url = new URL(decodeHtml(value), config.origin);
    const pagePath = url.pathname.replace(/\/$/, '') || '/';
    const pathname = routeSet.has(pagePath) ? (pagePath === '/' ? '/' : pagePath + '/') : url.pathname;
    return config.basePath + pathname + url.search + url.hash;
  };
  const absolute = value => {
    if (typeof value !== 'string' || !value.startsWith(config.origin + '/')) return value;
    return config.origin + localPath(value.slice(config.origin.length));
  };
  const rewriteGraph = value => Array.isArray(value) ? value.map(rewriteGraph) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteGraph(item)])) : absolute(value);
  const rewriteCss = css => css.replace(/url\((['"]?)(\/(?!\/)[^)'"\s]+)\1\)/g, (_, quote, url) => `url(${quote}${localPath(url)}${quote})`);
  const rewriteHtml = html => html
    .replace(/(\s(?:href|src|action|poster|data-image|data-qr-source|data-qr-page|data-static-page)=["'])(\/(?!\/)[^"']*)(["'])/g, (_, start, url, end) => start + escapeHtml(localPath(url)) + end)
    .replace(/(\ssrcset=["'])([^"']*)(["'])/g, (_, start, values, end) => start + values.replace(/(^|,\s*)(\/(?!\/)[^,\s]+)/g, (match, space, url) => space + escapeHtml(localPath(url))) + end)
    .replace(/\snonce="[^"]*"/g, '');
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(outDir), '.blosmile-pages-'));
  const write = async (name, value) => {
    const filename = path.join(staging, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, value);
  };
  try {
    // Explicit allowlist: administration, sessions, source JSON and secrets can
    // never become part of the published artifact through a recursive root copy.
    for (const assetRoot of ['assets', 'fonts', 'css', 'js', 'uploads']) {
      const source = path.join(root, 'public', assetRoot);
      try {
        for (const file of await listFiles(source)) {
          if (file.split('/').some(segment => segment.startsWith('.'))) continue;
          if (!/\.(?:png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|otf|css|js|pdf|txt)$/i.test(file)) throw new Error(`Extension publique non autorisée : ${assetRoot}/${file}`);
          const original = await fs.readFile(path.join(source, file));
          await write(path.posix.join(assetRoot, file), file.endsWith('.css') ? rewriteCss(original.toString('utf8')) : original);
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await write('favicon.svg', await fs.readFile(path.join(root, 'public/favicon.svg')));
    await write('.nojekyll', '');
    await write('cabinet.vcf', contactCard(content));
    for (const provider of content.directions.providers) await write(provider.staticImageUrl.slice(1), await QRCode.toBuffer(provider.url, { type: 'png', width: 360, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#103656', light: '#ffffff' } }));
    const allPages = [...routes, ...variants, { route: '/404.html', page: 'notfound', service: null, article: null }];
    for (const entry of allPages) {
      const seo = withSeoOrigin(config.origin, () => makeSeo(content, entry.page, entry.service, entry.article));
      seo.canonical = absolute(seo.canonical);
      seo.ogImage = absolute(seo.ogImage);
      seo.siteUrl = config.siteUrl;
      seo.jsonLd = jsonForHtml(rewriteGraph(JSON.parse(seo.jsonLd)));
      if (entry.variant) { seo.noindex = true; seo.robots = 'noindex, follow'; }
      if (preview.enabled) {
        seo.noindex = true;
        seo.robots = 'noindex, nofollow, noarchive';
        seo.title = `Démo — ${seo.title}`;
        seo.description = previewDescription;
      }
      const html = await ejs.renderFile(path.join(root, 'views/page.ejs'), {
        content, ...entry, member: null, seo, nonce: '', staticMode: true, staticBasePath: config.basePath,
        qrProvider: entry.qrProvider || content.directions.providers[0], qrRequested: Boolean(entry.variant)
      });
      if (/<a\b[^>]*href="\/admin"/.test(html)) throw new Error('Le modèle public expose encore le lien du back-office.');
      const outputFile = entry.page === 'notfound' ? '404.html' : entry.route === '/' ? 'index.html' : entry.route.slice(1) + '/index.html';
      await write(outputFile, rewriteHtml(html));
    }
    for (const [from, to] of Object.entries(aliases)) {
      const destination = config.origin + localPath(to);
      await write(from.slice(1) + '/index.html', `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preview.enabled ? 'Démo — ' : ''}Cette page a déménagé | Blosmile</title>${preview.enabled ? `<meta name="description" content="${escapeHtml(previewDescription)}">` : ''}<meta name="robots" content="${preview.enabled ? 'noindex, nofollow, noarchive' : 'noindex, follow'}"><link rel="canonical" href="${escapeHtml(destination)}"><meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}"></head><body><p>Cette page a déménagé. <a href="${escapeHtml(localPath(to))}">Ouvrir la nouvelle page Blosmile</a>.</p></body></html>`);
    }
    const xml = withSeoOrigin(config.origin, () => sitemap(content)).replace(/<loc>([^<]+)<\/loc>/g, (_, url) => `<loc>${escapeHtml(absolute(decodeHtml(url)))}</loc>`);
    await write('sitemap.xml', xml);
    // Allow retrieval of preview HTML: blocking robots would prevent them from
    // reading the noindex directive. Public URLs are not access-controlled.
    await write('robots.txt', preview.enabled ? `# Démonstration temporaire : les pages portent la directive noindex.\n# L’exploration est autorisée pour permettre la lecture de cette directive.\nUser-agent: *\nAllow: ${config.basePath || ''}/\n` : indexable ? `User-agent: *\nAllow: ${config.basePath || ''}/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
    const llms = preview.enabled ? `# Blosmile — démonstration temporaire\n\n${previewDescription}\n\nCette prévisualisation ne constitue pas le site officiel du cabinet. Ne pas l’indexer ni la citer comme source de référence. La consigne noindex n’est pas un contrôle d’accès : l’URL reste accessible aux personnes qui la connaissent.\n` : withSeoOrigin(config.origin, () => llmsText(content)).replace(/\]\((https?:\/\/[^)]+)\)/g, (_, url) => `](${absolute(url)})`);
    await write('llms.txt', llms);
    // Validate every emitted local resource before replacing the previous build.
    const files = await listFiles(staging);
    const fileSet = new Set(files);
    const unresolved = new Set();
    const verify = value => {
      if (!value.startsWith('/') || value.startsWith('//')) return;
      const pathname = decodeURIComponent(new URL(decodeHtml(value), config.origin).pathname);
      if (!(pathname === config.basePath || pathname.startsWith(config.basePath + '/'))) { unresolved.add(value); return; }
      const relative = pathname.slice(config.basePath.length).replace(/^\//, '');
      if (fileSet.has(relative) || fileSet.has(path.posix.join(relative, 'index.html'))) return;
      unresolved.add(value);
    };
    for (const file of files) {
      if (file.endsWith('.html')) {
        const html = await fs.readFile(path.join(staging, file), 'utf8');
        if (/\/(?:api\/admin|admin(?:["'/?#]))/.test(html)) throw new Error(`Référence privée détectée : ${file}`);
        for (const [, value] of html.matchAll(/\s(?:href|src|action|poster|data-image|data-qr-source|data-qr-page|data-static-page)=["']([^"']*)["']/g)) verify(value);
      } else if (file.endsWith('.css')) {
        for (const [, , value] of (await fs.readFile(path.join(staging, file), 'utf8')).matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)) verify(value);
      }
    }
    if (unresolved.size) throw new Error(`Références locales introuvables dans l’export :\n${[...unresolved].join('\n')}`);
    const summary = { siteUrl: config.siteUrl, basePath: config.basePath, outDir, pages: routes.length, variants: variants.length, aliases: Object.keys(aliases).length, qrCodes: content.directions.providers.length, files: files.length + 1, indexable: Boolean(indexable), previewEnabled: preview.enabled, preview: { ...preview } };
    await write(marker, JSON.stringify({ ...summary, outDir: undefined }, null, 2) + '\n');
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.rename(staging, outDir);
    return summary;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await buildPages();
    console.log(`Export GitHub Pages : ${result.pages} pages, ${result.variants} variantes QR, ${result.aliases} anciennes adresses, ${result.files} fichiers.\n${result.siteUrl}/\nDossier : ${result.outDir}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
