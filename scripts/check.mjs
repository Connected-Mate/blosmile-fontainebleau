import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';
import { presentation } from '../server/presentation.mjs';
import { makeSeo } from '../server/seo.mjs';
import { validateContent } from '../server/store.mjs';
const root=path.resolve(import.meta.dirname,'..');
const content=presentation(JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8')));
const errors=validateContent(content);if(errors.length)throw new Error(errors.join('\n'));
const pages=['home','team','cabinet','services','contact','directions','faq','legal','privacy','resources','notfound'].map(page=>({page,service:null,article:null}));
for(const service of content.services)pages.push({page:'service',service,article:null});
for(const article of content.articles||[])pages.push({page:'article',article,service:null});
const missing=new Set();let count=0;
for(const page of pages){const html=await ejs.renderFile(path.join(root,'views/page.ejs'),{content,...page,member:null,seo:makeSeo(content,page.page,page.service,page.article),nonce:'test-nonce',qrProvider:content.directions.providers[0],qrRequested:false});if((html.match(/<h1(?:\s|>)/g)||[]).length!==1)throw new Error(`${page.page}: titre h1 manquant ou multiple`);for(const [,url]of html.matchAll(/(?:src|href)="(\/(?:assets|fonts|css|js)\/[^"?#]+)"/g)){if(!fs.existsSync(path.join(root,'public',url)))missing.add(url);}count++;}
if(missing.size)throw new Error('Fichiers introuvables : '+[...missing].join(', '));
console.log(`${count} pages HTML rendues ; contenu validé ; toutes les images et ressources référencées existent.`);
