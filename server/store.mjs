import { getDirections } from './directions.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_CONTENT = {
  practice: { name: 'Blosmile', city: 'Fontainebleau', phone: '', address: '', postalCode: '', email: '', logo: '', mapUrl: '', hoursSummary: '', hours: [], equipment: [] },
  home: { title: 'Votre cabinet dentaire à Fontainebleau', steps: [] },
  team: [], services: [], faq: [], legal: {}, seo: { siteUrl: '', indexable: false }, pages: { team: {}, cabinet: { images: [] }, services: {}, contact: { preparation: [] }, faq: {} }
};

export function passwordHash(password) {
  const salt = randomBytes(24).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [salt, hash] = encoded.split(':');
    const expected = Buffer.from(hash, 'hex');
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export const digest = value => createHash('sha256').update(value).digest('hex');

export function createStore({ dbPath, seedPath, accessPath, initialPassword }) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL, created_at TEXT NOT NULL, actor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, username TEXT, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
  `);
  if (!db.prepare('SELECT id FROM content WHERE id=1').get()) {
    const content = seedPath && existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : DEFAULT_CONTENT;
    const articleSeedPath = seedPath ? join(dirname(seedPath), 'articles.json') : null;
    if (!content.articles && articleSeedPath && existsSync(articleSeedPath)) content.articles = JSON.parse(readFileSync(articleSeedPath, 'utf8'));
    const timestamp = new Date().toISOString();
    db.prepare('INSERT INTO content VALUES (1,?,?)').run(JSON.stringify(content), timestamp);
    db.prepare('INSERT INTO revisions (json,created_at,actor) VALUES (?,?,?)').run(JSON.stringify(content), timestamp, 'Installation');
  }
  if (!db.prepare('SELECT username FROM admins LIMIT 1').get()) {
    const password = initialPassword || randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO admins VALUES (?,?)').run('admin', passwordHash(password));
    if (accessPath) {
      mkdirSync(dirname(accessPath), { recursive: true, mode: 0o700 });
      writeFileSync(accessPath, `Administration Blosmile\nAdresse : http://127.0.0.1:${process.env.PORT || 3000}/admin\nIdentifiant : admin\nMot de passe : ${password}\n\nCe fichier local contient un secret. Ne le publiez pas.\nModifiez le mot de passe dans les réglages de l’administration.\n`, { mode: 0o600 });
    }
  }
  const store = {
    db,
    getContent() {
      const row = db.prepare('SELECT * FROM content WHERE id=1').get();
      return { content: JSON.parse(row.json), updatedAt: row.updated_at };
    },
    saveContent(content, actor = 'admin') {
      const json = JSON.stringify(content);
      const previousTime = db.prepare('SELECT updated_at FROM content WHERE id=1').get()?.updated_at;
      const timestamp = new Date(Math.max(Date.now(), Date.parse(previousTime || '') + 1 || 0)).toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE content SET json=?,updated_at=? WHERE id=1').run(json, timestamp);
        const result = db.prepare('INSERT INTO revisions (json,created_at,actor) VALUES (?,?,?)').run(json, timestamp, actor);
        db.prepare('DELETE FROM revisions WHERE id NOT IN (SELECT id FROM revisions ORDER BY id DESC LIMIT 100)').run();
        db.exec('COMMIT');
        return { updatedAt: timestamp, revisionId: Number(result.lastInsertRowid) };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    listRevisions() {
      return db.prepare('SELECT id,created_at AS createdAt,actor FROM revisions ORDER BY id DESC LIMIT 100').all();
    },
    getRevision(id) {
      const row = db.prepare('SELECT * FROM revisions WHERE id=?').get(id);
      return row ? JSON.parse(row.json) : null;
    },
    getAdmin(username) { return db.prepare('SELECT * FROM admins WHERE username=?').get(username); },
    changePassword(username, password) {
      db.prepare('UPDATE admins SET password_hash=? WHERE username=?').run(passwordHash(password), username);
      db.prepare('DELETE FROM sessions WHERE username=?').run(username);
    },
    createSession(username = null) {
      const id = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + (username ? 8 * 60 * 60 * 1000 : 30 * 60 * 1000);
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(id), username, csrf, expiresAt);
      return { id, username, csrf, expiresAt };
    },
    getSession(id) {
      if (!id || id.length > 100) return null;
      return db.prepare('SELECT username,csrf,expires_at AS expiresAt FROM sessions WHERE id=? AND expires_at>?').get(digest(id), Date.now()) || null;
    },
    deleteSession(id) { if (id) db.prepare('DELETE FROM sessions WHERE id=?').run(digest(id)); },
    addMedia(file) {
      const date = new Date().toISOString();
      const result = db.prepare('INSERT INTO media (filename,original_name,mime,size,created_at) VALUES (?,?,?,?,?)').run(file.filename, file.originalName, file.mime, file.size, date);
      return { id: Number(result.lastInsertRowid), ...file, url: `/uploads/${file.filename}`, createdAt: date };
    },
    listMedia() {
      return db.prepare('SELECT id,filename,original_name AS originalName,mime,size,created_at AS createdAt FROM media ORDER BY id DESC').all().map(row => ({ ...row, url: `/uploads/${row.filename}` }));
    },
    close() { db.close(); }
  };
  return store;
}

export function validateContent(content) {
  const errors = [];
  if (!content || Array.isArray(content) || typeof content !== 'object') return ['Le contenu doit être un objet JSON.'];
  if (!content.practice || Array.isArray(content.practice) || typeof content.practice !== 'object') errors.push('La section « practice » doit être un objet.');
  for (const key of ['team', 'services', 'faq']) {
    if (!Array.isArray(content[key])) errors.push(`La section « ${key} » doit être une liste.`);
  }
  const required = (path, kind) => {
    const value = path.split('.').reduce((node, key) => node?.[key], content);
    const valid = kind === 'array' ? Array.isArray(value) : kind === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : typeof value === kind;
    if (!valid) errors.push(`${path} : ${kind === 'array' ? 'une liste est requise' : kind === 'object' ? 'une section est requise' : 'un texte est requis'}.`);
    return valid ? value : undefined;
  };
  for (const key of ['home', 'pages', 'legal', 'seo']) required(key, 'object');
  for (const key of ['name', 'phone', 'address', 'postalCode', 'city', 'email', 'logo', 'mapUrl', 'hoursSummary']) required(`practice.${key}`, 'string');
  for (const key of ['team', 'cabinet', 'services', 'contact', 'faq']) required(`pages.${key}`, 'object');
  for (const path of ['practice.hours', 'practice.equipment', 'home.steps', 'pages.cabinet.images', 'pages.contact.preparation']) required(path, 'array');
  const checkTextArray = (value, path) => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) errors.push(`${path} : une liste de textes est requise.`);
  };
  if (Array.isArray(content.practice?.hours)) for (const [index, item] of content.practice.hours.entries()) {
    if (!item || typeof item.day !== 'string' || typeof item.hours !== 'string' || !Array.isArray(item.periods)) errors.push(`practice.hours.${index} : indiquez un jour, un texte d’horaires et une liste de plages horaires.`);
    else if (item.periods.some(period => !Array.isArray(period) || period.length !== 2 || period.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))) errors.push(`practice.hours.${index}.periods : chaque plage doit contenir deux heures au format HH:MM.`);
  }
  for (const path of ['practice.equipment', 'home.steps']) {
    const value = path.split('.').reduce((node,key) => node?.[key],content);
    if (Array.isArray(value)) for (const [index,item] of value.entries()) {
      const fields = path === 'home.steps' ? ['title','text'] : ['name','summary'];
      if (!item || fields.some(key => typeof item[key] !== 'string')) errors.push(`${path}.${index} : les champs ${fields.join(', ')} doivent être des textes.`);
    }
  }
  if (Array.isArray(content.pages?.cabinet?.images)) content.pages.cabinet.images.forEach((item,i)=>{if(typeof item !== 'string' && (!item || ['src','alt','caption'].some(key=>typeof item[key] !== 'string')))errors.push(`pages.cabinet.images.${i} : une image avec description et légende est requise.`);});
  if (content.pages?.contact?.preparation) checkTextArray(content.pages.contact.preparation, 'pages.contact.preparation');
  for (const key of ['team', 'services', 'faq', 'articles']) {
    if (Array.isArray(content[key])) for (const [index, item] of content[key].entries()) {
      if (!item || Array.isArray(item) || typeof item !== 'object') errors.push(`${key}.${index} : chaque élément doit être un objet.`);
    }
  }
  if (content.practice && typeof content.practice.name !== 'string') errors.push('Le nom du cabinet est requis.');
  if (Array.isArray(content.team)) for (const [index, member] of content.team.entries()) {
    if (member && typeof member === 'object' && (typeof member.name !== 'string' || !member.name.trim())) errors.push(`team.${index} : renseignez le nom de la personne.`);
    if (member && typeof member === 'object') {
      checkTextArray(member.qualifications, `team.${index}.qualifications`);
      for (const key of ['id', 'role', 'kind', 'image', 'focus']) if (typeof member[key] !== 'string') errors.push(`team.${index}.${key} : un texte est requis.`);
    }
  }
  if (Array.isArray(content.faq)) for (const [index, item] of content.faq.entries()) {
    if (item && typeof item === 'object' && (typeof item.question !== 'string' || typeof item.answer !== 'string')) errors.push(`faq.${index} : la question et la réponse doivent être des textes.`);
  }
  const walk = (value, path = '', depth = 0) => {
    if (errors.length > 20) return;
    if (depth > 16) { errors.push(`${path} : imbrication trop profonde.`); return; }
    if (typeof value === 'string') {
      if (value.length > 30000) errors.push(`${path} : texte limité à 30 000 caractères.`);
      const key = path.split('.').at(-1);
      if (/(image|photo|avatar|logo|cover|src|url|href|link)$/i.test(key) && value && !/^(https?:\/\/|\/(?!\/)|mailto:|tel:|#)/i.test(value)) {
        errors.push(`${path} : utilisez une URL http(s), un chemin /images/… ou un lien mailto:/tel:.`);
      }
      if (/^\s*(javascript|data|vbscript):/i.test(value)) errors.push(`${path} : protocole non autorisé.`);
    } else if (Array.isArray(value)) {
      if (value.length > 200) errors.push(`${path} : 200 éléments maximum.`);
      value.forEach((item, index) => walk(item, `${path}.${index}`, depth + 1));
    } else if (value && typeof value === 'object') {
      if (Object.keys(value).length > 150) errors.push(`${path} : trop de champs.`);
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) errors.push(`${path}.${key} : nom de champ interdit.`);
        if ((/(url|image|photo|logo|title|description|caption|alt)$/i.test(key) || ['telephone','phoneInternational','sourceDate','updatedAt'].includes(key)) && typeof item !== 'string') errors.push(`${path}.${key} : un texte est requis.`);
        walk(item, path ? `${path}.${key}` : key, depth + 1);
      }
    } else if (value !== null && !['number', 'boolean'].includes(typeof value)) errors.push(`${path} : valeur non prise en charge.`);
  };
  walk(content);
  if(getDirections(content).googleUrl.length>1800)errors.push('L’adresse complète est trop longue pour les liens d’itinéraire. Limitez l’adresse aux coordonnées postales.');
  for (const [page, metadata] of Object.entries(content.seo?.pages || {})) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) errors.push(`seo.pages.${page} : une section est requise.`);
    else for (const key of ['title','description']) if (metadata[key] !== undefined && typeof metadata[key] !== 'string') errors.push(`seo.pages.${page}.${key} : un texte est requis.`);
  }
  if(content.pages?.privacy?.sections !== undefined){
    if(!Array.isArray(content.pages.privacy.sections))errors.push('pages.privacy.sections : une liste est requise.');
    else content.pages.privacy.sections.forEach((section,i)=>{if(!section||typeof section.title !== 'string') errors.push(`pages.privacy.sections.${i} : un titre est requis.`);checkTextArray(section?.paragraphs,`pages.privacy.sections.${i}.paragraphs`);});
  }
  const slugs = new Set();
  for (const service of Array.isArray(content.services) ? content.services : []) {
    if (!service || typeof service !== 'object') { errors.push('Chaque soin doit être un objet.'); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(service.slug || '')) errors.push('Chaque soin doit posséder un identifiant « slug » en minuscules, chiffres et tirets.');
    else if (slugs.has(service.slug)) errors.push(`Le soin « ${service.slug} » existe plusieurs fois.`);
    slugs.add(service.slug);
    if (typeof service.title !== 'string' || !service.title.trim()) errors.push(`Soin ${service.slug || ''} : renseignez un titre.`);
    for (const key of ['body', 'treatments', 'practitionerIds']) checkTextArray(service[key], `services.${service.slug || '?'}.${key}`);
    if (!Array.isArray(service.educationalLinks) || service.educationalLinks.some(link => !link || typeof link.url !== 'string' || typeof link.title !== 'string')) errors.push(`services.${service.slug || '?'}.educationalLinks : une liste de ressources avec un titre et une URL est requise.`);
  }
  const articleSlugs = new Set();
  if (content.articles !== undefined && !Array.isArray(content.articles)) errors.push('La section « articles » doit être une liste.');
  const checkLinks = (items, path) => {
    if (!Array.isArray(items) || items.some(item => !item || typeof item.title !== 'string' || typeof item.url !== 'string')) errors.push(`${path} : une liste de liens avec titre et URL est requise.`);
  };
  for (const person of Array.isArray(content.team) ? content.team : []) {
    if (!person || typeof person !== 'object') continue;
    if (person.education !== undefined) {
      if (!Array.isArray(person.education)) errors.push('Les formations doivent être une liste.');
      else person.education.forEach(item => {
        if (!item || typeof item.title !== 'string') errors.push('Chaque formation doit avoir un intitulé.');
        if (item?.links !== undefined) checkLinks(item.links, 'Liens de formation');
      });
    }
    if (person.institutionLinks !== undefined) checkLinks(person.institutionLinks, 'Établissements de formation');
  }
  for (const article of Array.isArray(content.articles) ? content.articles : []) {
    if (!article || typeof article !== 'object') continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || '')) errors.push('Chaque article doit posséder un identifiant « slug » en minuscules, chiffres et tirets.');
    else if (articleSlugs.has(article.slug)) errors.push(`L’article « ${article.slug} » existe plusieurs fois.`);
    articleSlugs.add(article.slug);
    if (typeof article.title !== 'string' || !article.title.trim()) errors.push(`Article ${article.slug || ''} : un titre est requis.`);
    if (!Array.isArray(article.paragraphs) || article.paragraphs.some(value => typeof value !== 'string')) errors.push(`Article ${article.slug || ''} : les paragraphes doivent être une liste de textes.`);
    if (article.sections !== undefined) {
      if (!Array.isArray(article.sections)) errors.push('Les parties du conseil doivent être une liste.');
      else {
        const ids = new Set();
        for (const section of article.sections) {
          if (!section || typeof section.title !== 'string' || !/^[a-z0-9-]+$/.test(section.id || '') || ids.has(section.id)) errors.push('Chaque partie de conseil doit avoir un titre et un identifiant unique.');
          if (section?.id) ids.add(section.id);
          checkTextArray(section?.paragraphs, 'Paragraphes de la partie');
        }
      }
    }
    if (article.consultationQuestions !== undefined) checkTextArray(article.consultationQuestions, 'Questions de consultation');
    if (article.questions !== undefined && (!Array.isArray(article.questions) || article.questions.some(item => !item || typeof item.question !== 'string' || typeof item.answer !== 'string'))) errors.push('Les questions du conseil doivent contenir une question et une réponse.');
    if (article.sources !== undefined) checkLinks(article.sources, 'Sources du conseil');
    if (article.localContext !== undefined && typeof article.localContext !== 'string') errors.push('Le contexte local doit être un texte.');
  }
  return [...new Set(errors)].slice(0, 20);
}
