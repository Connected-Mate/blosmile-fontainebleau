import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPages } from './build-pages.mjs';

const root = path.resolve(import.meta.dirname, '..');
const marker = '.blosmile-pages-build.json';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function configuration(input) {
  if (!input) throw new Error('PAGES_URL est obligatoire pour publier la démonstration.');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('PAGES_URL doit être une URL HTTPS sans identifiants, paramètres ni fragment.');
  const basePath = url.pathname.replace(/\/+$/, '');
  if (basePath.split('/').some(segment => segment && !/^[a-zA-Z0-9._~-]+$/.test(segment))) throw new Error('PAGES_URL contient un chemin de dépôt non pris en charge.');
  return { siteUrl: url.origin + basePath, basePath };
}

async function assertOwnedOutput(outDir) {
  if (outDir === root || root.startsWith(outDir + path.sep) || outDir === path.parse(outDir).root) throw new Error('Le dossier de sortie ne peut pas être le projet ou un de ses parents.');
  for (const reserved of ['public', 'server', 'views', 'data', 'scripts', 'tests', 'research', 'node_modules', '.github', '.git', '.local']) {
    const directory = path.join(root, reserved);
    if (outDir === directory || outDir.startsWith(directory + path.sep)) throw new Error(`Dossier de sortie réservé : ${reserved}.`);
  }
  try {
    const stat = await fs.lstat(outDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('La sortie existante doit être un dossier ordinaire.');
    const entries = await fs.readdir(outDir);
    if (entries.length && !entries.includes(marker)) throw new Error('La sortie contient des fichiers étrangers à cet export. Choisissez un dossier vide.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function closureHtml(preview) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#103656"><meta name="robots" content="noindex, nofollow, noarchive"><title>Démo terminée | Blosmile</title><meta name="description" content="Cette prévisualisation temporaire du projet Blosmile est terminée."><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#103656;background:#f6f3ed}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:clamp(20px,6vw,72px)}main{width:min(100%,680px);background:#fff;border:1px solid #e1e6e7;border-radius:28px;padding:clamp(28px,6vw,64px)}.brand{font-size:28px;font-weight:700;letter-spacing:-1.5px;margin:0 0 48px}.brand span{color:#777fa6;margin-left:8px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#64778a}h1{font-size:clamp(32px,6vw,50px);line-height:1.08;letter-spacing:-2px;margin:18px 0 24px}p{line-height:1.7;font-size:16px}small{display:block;border-top:1px solid #e1e6e7;padding-top:22px;margin-top:30px;color:#64778a;line-height:1.7}
</style></head><body><main><p class="brand" aria-label="Blosmile">blosmile<span aria-hidden="true">:)</span></p><p class="eyebrow">Démonstration terminée</p><h1>Cette prévisualisation<br>est maintenant fermée.</h1><p>Ce projet était un prototype de démonstration réalisé avec ${escapeHtml(preview.collaborator)}. Son accès temporaire a pris fin.</p><small>Fin de la période de démonstration : ${escapeHtml(preview.expiresLabel)}.<br>Cette page ne constitue pas le site officiel du cabinet.</small></main></body></html>\n`;
}

/** Publish the preview before its deadline; withdraw all site assets afterwards. */
export async function releasePages({ now = Date.now(), siteUrl = process.env.PAGES_URL, outDir = process.env.PAGES_OUTPUT || path.join(root, 'dist'), preview } = {}) {
  const clock = Number(now);
  if (!Number.isFinite(clock)) throw new Error('La date de publication est invalide.');
  preview ??= JSON.parse(await fs.readFile(path.join(root, 'data/preview.json'), 'utf8'));
  if (!preview || typeof preview.enabled !== 'boolean') throw new Error('La configuration de démonstration doit définir enabled à true ou false.');
  const deadline = Date.parse(preview.expiresAt);
  if (preview.enabled && (!Number.isFinite(deadline) || !['collaborator', 'expiresLabel', 'version'].every(key => typeof preview[key] === 'string' && preview[key].trim()))) throw new Error('La démonstration doit définir son auteur, sa date de retrait et sa version.');
  if (!preview.enabled || clock < deadline) return { ...await buildPages({ siteUrl, outDir, preview }), expired: false };

  const config = configuration(siteUrl);
  outDir = path.resolve(outDir);
  await assertOwnedOutput(outDir);
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(outDir), '.blosmile-withdraw-'));
  const previous = staging + '-previous';
  let movedPrevious = false;
  const html = closureHtml(preview);
  const summary = { ...config, outDir, expired: true, indexable: false, previewEnabled: true, preview: { ...preview }, pages: 0, variants: 0, aliases: 0, qrCodes: 0, files: 7 };
  try {
    const files = {
      'index.html': html,
      '404.html': html,
      'robots.txt': `# Démonstration terminée. Laisser lire la directive noindex des pages de fermeture.\nUser-agent: *\nAllow: ${config.basePath || ''}/\n`,
      'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
      'llms.txt': '# Démonstration Blosmile terminée\n\nLa prévisualisation temporaire a été retirée. Cette URL ne constitue pas le site officiel du cabinet et ne doit pas être utilisée comme source de référence.\n',
      '.nojekyll': '',
      [marker]: JSON.stringify({ ...summary, outDir: undefined }, null, 2) + '\n'
    };
    await Promise.all(Object.entries(files).map(([filename, contents]) => fs.writeFile(path.join(staging, filename), contents)));
    // Check ownership immediately before replacement. Keep the complete previous
    // export available for rollback until the finished staging directory lands.
    await assertOwnedOutput(outDir);
    try { await fs.rename(outDir, previous); movedPrevious = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await fs.rename(staging, outDir); }
    catch (error) {
      if (movedPrevious) await fs.rename(previous, outDir);
      throw error;
    }
    if (movedPrevious) await fs.rm(previous, { recursive: true, force: true });
    return summary;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const summary = await releasePages();
    console.log(summary.expired ? `Démonstration terminée : site et médias retirés de l’export.\n${summary.siteUrl}/\nDossier : ${summary.outDir}` : `Démonstration publiée : ${summary.pages} pages.\n${summary.siteUrl}/\nDossier : ${summary.outDir}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
