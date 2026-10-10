import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import QRCode from 'qrcode';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, validateContent, verifyPassword } from './store.mjs';
import { presentation } from './presentation.mjs';
import { getDirections, contactCard } from './directions.mjs';
import { makeSeo, sitemap, llmsText, getSiteConfig } from './seo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_COOKIE = 'blosmile_session';
const cookieId = request => {
  const match = (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`));
  try { return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : ''; } catch { return ''; }
};
const safeEqual = (one, two) => {
  if (typeof one !== 'string' || typeof two !== 'string') return false;
  const a = Buffer.from(one), b = Buffer.from(two);
  return a.length === b.length && timingSafeEqual(a, b);
};
const imageFormat = buffer => {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buffer.length >= 14 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) && buffer.at(-1) === 0x3b) return { ext: 'gif', mime: 'image/gif' };
  return null;
};

export function createApp(options = {}) {
  const root = options.root || ROOT;
  const localPath = options.localPath || join(root, '.local');
  const uploadsDir = options.uploadsDir || join(localPath, 'uploads');
  mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
  const store = createStore({ dbPath: options.dbPath || join(localPath, 'blosmile.sqlite'), seedPath: options.seedPath || join(root, 'data/content.json'), accessPath: options.accessPath === false ? null : options.accessPath || join(localPath, 'admin-access.txt'), initialPassword: options.initialPassword });
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', join(root, 'views'));
  app.use((req, res, next) => {
    res.locals.nonce = randomBytes(18).toString('base64');
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'"], frameSrc: ['https://www.google.com', 'https://maps.google.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: null
    } },
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '2mb', strict: true }));
  app.use((req, res, next) => {
    if (!getSiteConfig(store.getContent().content).indexable || req.path.startsWith('/admin') || req.path.startsWith('/api/')) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use('/uploads', express.static(uploadsDir, { dotfiles: 'deny', immutable: true, maxAge: '30d', setHeaders: res => { res.set('X-Content-Type-Options', 'nosniff'); } }));
  app.use('/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/admin/assets', express.static(join(root, 'public/admin'), { dotfiles: 'deny' }));
  app.get('/admin', (req, res) => res.sendFile(join(root, 'public/admin/index.html')));
  app.use('/api/admin', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    req.sessionId = cookieId(req);
    req.adminSession = store.getSession(req.sessionId);
    next();
  });
  const setSession = (req, res, session) => {
    res.cookie(SESSION_COOKIE, session.id, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/', maxAge: session.expiresAt - Date.now() });
  };
  const requireAuth = (req, res, next) => {
    if (!req.adminSession?.username) return res.status(401).json({ error: 'Votre session a expiré. Reconnectez-vous.' });
    next();
  };
  const requireCsrf = (req, res, next) => {
    if (!req.adminSession || !safeEqual(req.get('x-csrf-token'), req.adminSession.csrf)) return res.status(403).json({ error: 'La vérification de sécurité a échoué. Rechargez la page.' });
    const origin = req.get('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* Deny invalid origins. */ }
      if (originHost !== req.get('host')) return res.status(403).json({ error: 'Origine de la requête non autorisée.' });
    }
    next();
  };
  app.get('/api/admin/session', (req, res) => {
    let session = req.adminSession;
    if (!session) { session = store.createSession(); setSession(req, res, session); }
    res.json({ authenticated: Boolean(session.username), username: session.username, csrfToken: session.csrf, expiresAt: session.expiresAt });
  });
  app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: options.loginRateLimit || 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' } }), requireCsrf, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 80 || password.length > 200) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
    const admin = store.getAdmin(username);
    const valid = verifyPassword(password, admin?.password_hash || '000000000000000000000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
    if (!admin || !valid) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    store.deleteSession(req.sessionId);
    const session = store.createSession(username);
    setSession(req, res, session);
    res.json({ authenticated: true, username, csrfToken: session.csrf, expiresAt: session.expiresAt });
  });
  app.post('/api/admin/logout', requireAuth, requireCsrf, (req, res) => {
    store.deleteSession(req.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
  app.get('/api/admin/content', requireAuth, (req, res) => res.json(store.getContent()));
  app.put('/api/admin/content', requireAuth, requireCsrf, (req, res) => {
    const { content, expectedUpdatedAt } = req.body || {};
    const errors = validateContent(content);
    if (errors.length) return res.status(422).json({ error: 'Certains champs doivent être corrigés.', errors });
    if (expectedUpdatedAt && expectedUpdatedAt !== store.getContent().updatedAt) return res.status(409).json({ error: 'Le contenu a changé dans une autre session. Exportez votre brouillon, puis rechargez avant de réessayer.' });
    res.json({ ok: true, ...store.saveContent(content, req.adminSession.username) });
  });
  app.get('/api/admin/export', requireAuth, (req, res) => {
    res.set('Content-Disposition', `attachment; filename="blosmile-contenu-${new Date().toISOString().slice(0, 10)}.json"`);
    res.type('application/json').send(JSON.stringify(store.getContent().content, null, 2));
  });
  app.get('/api/admin/revisions', requireAuth, (req, res) => res.json({ revisions: store.listRevisions() }));
  app.post('/api/admin/revisions/:id/restore', requireAuth, requireCsrf, (req, res) => {
    if(req.body?.expectedUpdatedAt && req.body.expectedUpdatedAt !== store.getContent().updatedAt) return res.status(409).json({error:'Le contenu a changé dans une autre session. Rechargez l’historique avant de restaurer cette version.'});
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Version invalide.' });
    const content = store.getRevision(Number(req.params.id));
    if (!content) return res.status(404).json({ error: 'Cette version est introuvable.' });
    const errors = validateContent(content);
    if (errors.length) return res.status(422).json({ error: 'Cette ancienne version contient des champs invalides.', errors });
    res.json({ ok: true, content, ...store.saveContent(content, `${req.adminSession.username} · restauration #${req.params.id}`) });
  });
  app.post('/api/admin/password', requireAuth, requireCsrf, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length > 200 || !verifyPassword(currentPassword, store.getAdmin(req.adminSession.username).password_hash)) return res.status(400).json({ error: 'Le mot de passe actuel est incorrect.' });
    if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 200) return res.status(422).json({ error: 'Le nouveau mot de passe doit contenir entre 12 et 200 caractères.' });
    if (currentPassword === newPassword) return res.status(422).json({ error: 'Choisissez un mot de passe différent du précédent.' });
    const username = req.adminSession.username;
    store.changePassword(username, newPassword);
    const session = store.createSession(username);
    setSession(req, res, session);
    const accessPath = options.accessPath === false ? null : options.accessPath || join(localPath, 'admin-access.txt');
    if (accessPath && existsSync(accessPath)) unlinkSync(accessPath);
    res.json({ ok: true, csrfToken: session.csrf });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
  app.get('/api/admin/media', requireAuth, (req, res) => {
    const assetDir=join(root,'public/assets');
    const originals=existsSync(assetDir)?readdirSync(assetDir,{withFileTypes:true}).filter(item=>item.isFile()&&/\.(jpe?g|png|webp|gif)$/i.test(item.name)).map(item=>({id:'original-'+item.name,url:'/assets/'+item.name,originalName:item.name.replace(/\.(jpe?g|png|webp|gif)$/i,'').replaceAll('-',' '),source:'original',size:statSync(join(assetDir,item.name)).size})):[];
    res.json({media:[...store.listMedia(),...originals]});
  });
  app.post('/api/admin/media', requireAuth, requireCsrf, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(422).json({ error: 'Sélectionnez une image à importer.' });
    const format = imageFormat(req.file.buffer);
    if (!format) return res.status(422).json({ error: 'Image non reconnue. Utilisez un vrai fichier JPEG, PNG, WebP ou GIF (8 Mo maximum). Les fichiers SVG sont refusés.' });
    const filename = `${Date.now()}-${randomBytes(12).toString('hex')}.${format.ext}`;
    writeFileSync(join(uploadsDir, filename), req.file.buffer, { mode: 0o600, flag: 'wx' });
    try {
      const media = store.addMedia({ filename, originalName: req.file.originalname.slice(0, 250), mime: format.mime, size: req.file.size });
      res.status(201).json({ ok: true, media });
    } catch (error) { unlinkSync(join(uploadsDir, filename)); throw error; }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Cette action est introuvable.' }));
  // Generated locally: visitors do not contact a QR-code or mapping service until choosing a link.
  const qrCache = new Map();
  let qrVersion = '';
  app.get('/itineraire/qr.png', async (req, res) => {
    const state = store.getContent();
    const provider = getDirections(state.content).providers.find(item => item.id === (req.query.app || 'google'));
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    if (!provider) return res.status(400).type('text/plain').send('Application inconnue.');
    if (qrVersion !== state.updatedAt) { qrCache.clear(); qrVersion = state.updatedAt; }
    if (!qrCache.has(provider.url)) qrCache.set(provider.url, QRCode.toBuffer(provider.url, {
      type: 'png', width: 360, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#103656', light: '#FFFFFF' }
    }).catch(error => { qrCache.delete(provider.url); throw error; }));
    res.type('png').send(await qrCache.get(provider.url));
  });
  app.get('/cabinet.vcf', (req, res) => {
    res.set({ 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': 'attachment; filename="blosmile-fontainebleau.vcf"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.send(contactCard(store.getContent().content));
  });
  app.use(express.static(join(root, 'public'), { dotfiles: 'deny', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: false }));
  const render = (page, status = 200) => (req, res, next) => {
    const content = presentation(store.getContent().content);
    const service = page === 'service' ? content.services?.find(item => item.slug === req.params.slug) : null;
    const article = page === 'article' ? content.articles?.find(item => item.slug === req.params.slug) : null;
    if ((page === 'service' && !service) || (page === 'article' && !article)) return render('notfound', 404)(req, res, next);
    const seo = makeSeo(content, page, service, article);
    const qrProvider = content.directions.providers.find(item => item.id === req.query.app) || content.directions.providers[0];
    res.status(status).render('page', { content, page, service, article, member: null, seo, qrProvider, qrRequested: content.directions.providers.some(item=>item.id===req.query.app), nonce: res.locals.nonce }, (error, html) => {
      if (error) return next(error);
      res.send(html);
    });
  };
  const aliases = { '/l-equipe': '/equipe', '/nos-cabinets': '/le-cabinet', '/notre-clinique': '/le-cabinet', '/le-cabinet-dentaire': '/le-cabinet', '/implantologie': '/soins/implantologie', '/esthetique': '/soins/esthetique', '/endodontie': '/soins/endodontie', '/parodontologie': '/soins/parodontologie', '/contactez-nous': '/contact', '/contactez-nous-1': '/contact', '/politique-de-confidentialite': '/confidentialite', '/cgu': '/mentions-legales' };
  for (const [from, to] of Object.entries(aliases)) app.get(from, (req, res) => res.redirect(301, to));
  for (const [path, page] of Object.entries({ '/': 'home', '/equipe': 'team', '/le-cabinet': 'cabinet', '/soins': 'services', '/contact': 'contact', '/venir': 'directions', '/questions-frequentes': 'faq', '/mentions-legales': 'legal', '/confidentialite': 'privacy' })) app.get(path, render(page));
  app.get('/soins/:slug', render('service'));
  app.get('/conseils', render('resources'));
  app.get('/conseils/:slug', render('article'));
  app.get('/blog/articles/:slug', (req, res, next) => {
    if (!store.getContent().content.articles?.some(article => article.slug === req.params.slug)) return render('notfound', 404)(req, res, next);
    res.redirect(301, `/conseils/${req.params.slug}`);
  });
  app.get('/sitemap.xml', (req, res) => { const state = store.getContent(); res.type('application/xml').send(sitemap(state.content, state.updatedAt)); });
  app.get('/robots.txt', (req, res) => {
    const { siteUrl, indexable } = getSiteConfig(store.getContent().content);
    res.type('text/plain').send(indexable ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
  });
  app.get('/llms.txt', (req, res) => res.type('text/plain').send(llmsText(store.getContent().content)));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(render('notfound', 404));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) return res.status(422).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'L’image dépasse la limite de 8 Mo.' : 'Import impossible. Envoyez une seule image.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Le contenu dépasse la limite de 2 Mo.' });
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Le document JSON est invalide.' });
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: 'La requête est invalide ou utilise un format non pris en charge.' });
    console.error(`[Blosmile] ${req.method} ${req.path}: ${error.message}`);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Une erreur est survenue. Votre contenu précédent reste enregistré.' });
    res.status(500).type('text/plain').send('La page est momentanément indisponible. Merci de réessayer.');
  });
  return { app, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { app, store } = createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(port, host, () => {
    console.log(`Blosmile fonctionne sur http://${host}:${port}`);
    console.log('Administration : /admin. Accès initial dans .local/admin-access.txt (fichier privé).');
  });
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
