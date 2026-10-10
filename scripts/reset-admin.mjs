import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordHash } from '../server/store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = resolve(root, '.local/blosmile.sqlite');
if (!existsSync(dbPath)) {
  console.error('Démarrez le site une première fois avec npm start avant de réinitialiser l’accès.');
  process.exit(1);
}
const db = new DatabaseSync(dbPath);
const password = randomBytes(18).toString('base64url');
db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('INSERT INTO admins (username,password_hash) VALUES (?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash').run('admin', passwordHash(password));
  db.prepare('DELETE FROM sessions').run();
  db.exec('COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
finally { db.close(); }
mkdirSync(resolve(root, '.local'), { recursive: true, mode: 0o700 });
writeFileSync(resolve(root, '.local/admin-access.txt'), `Administration Blosmile\nAdresse : http://127.0.0.1:${process.env.PORT || 3000}/admin\nIdentifiant : admin\nMot de passe : ${password}\n\nAccès réinitialisé. Conservez ce fichier privé.\n`, { mode: 0o600 });
console.log('L’accès administrateur a été réinitialisé. Toutes les sessions ont été fermées.');
console.log('Le nouveau mot de passe est dans .local/admin-access.txt. Il n’est pas affiché dans le terminal.');
