// Explicitly export only published content and referenced images from the local CMS.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateContent } from '../server/store.mjs';

const root = resolve(import.meta.dirname, '..');
const database = join(root, '.local/blosmile.sqlite');
if (!existsSync(database)) throw new Error('Démarrez le back-office local avant de synchroniser son contenu.');
const db = new DatabaseSync(database, { readOnly: true });
let content;
try { content = JSON.parse(db.prepare('SELECT json FROM content WHERE id=1').get().json); }
finally { db.close(); }
const errors = validateContent(content);
if (errors.length) throw new Error(errors.join('\n'));
const uploads = new Set();
function prepare(value) {
  if (typeof value === 'string' && value.startsWith('/uploads/')) {
    const name = value.slice('/uploads/'.length);
    if (!/^[\w-]+\.(?:png|jpg|jpeg|webp|gif)$/i.test(name)) throw new Error('Nom de média importé invalide.');
    uploads.add(name);
    return '/assets/cms/' + name;
  }
  if (Array.isArray(value)) return value.map(prepare);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, prepare(item)]));
  return value;
}
const published = prepare(content);
for (const name of uploads) {
  const source = join(root, '.local/uploads', name);
  if (!existsSync(source)) throw new Error('Un média référencé est absent : ' + name);
}
if (uploads.size) mkdirSync(join(root, 'public/assets/cms'), { recursive: true });
for (const name of uploads) copyFileSync(join(root, '.local/uploads', name), join(root, 'public/assets/cms', name));
const destination = join(root, 'data/content.json');
const next = JSON.stringify(published, null, 2) + '\n';
if (readFileSync(destination, 'utf8') !== next) writeFileSync(destination, next);
console.log(`Contenu public synchronisé ; ${uploads.size} média(s) importé(s) copié(s). Aucun accès administrateur ni session exporté.`);
console.log('Vérifiez les changements, puis commitez et poussez vers main pour publier.');
