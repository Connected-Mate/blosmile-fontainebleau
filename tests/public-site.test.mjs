import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createApp } from '../server/index.mjs';
import { validateContent, createStore } from '../server/store.mjs';
import { makeSeo } from '../server/seo.mjs';
import { presentation } from '../server/presentation.mjs';
const root=resolve(import.meta.dirname,'..');
const seed=JSON.parse(readFileSync(resolve(root,'data/content.json'),'utf8'));

test('all real public pages render, contain one h1, and have no broken internal content links',async t=>{
  const {app,store}=createApp({dbPath:':memory:',accessPath:false,initialPassword:'temporary-test-only-password'});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const urls=['/','/equipe','/le-cabinet','/soins','/contact','/venir','/questions-frequentes','/mentions-legales','/confidentialite','/conseils',...seed.services.map(s=>'/soins/'+s.slug),...seed.articles.map(a=>'/conseils/'+a.slug)];
  const resources=new Set();
  for(const url of urls){const r=await fetch(base+url);assert.equal(r.status,200,url);const html=await r.text();assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,url);assert.doesNotMatch(html,/\[object Object\]/,url);for(const[,ref]of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g))resources.add(ref);const ld=html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]+?)<\/script>/);assert.doesNotThrow(()=>JSON.parse(ld[1]));}
  for(const ref of resources){const response=await fetch(base+ref,{method:'HEAD'});assert.equal(response.status,200,ref);}
  for(const article of seed.articles){const response=await fetch(base+'/blog/articles/'+article.slug,{redirect:'manual'});assert.equal(response.status,301);assert.equal(response.headers.get('location'),'/conseils/'+article.slug);}
  assert.equal((await fetch(base+'/page-qui-n-existe-pas')).status,404);
});

test('edits to hours and phone update the public presentation and structured data together',()=>{
  const content=structuredClone(seed);content.practice.phone='01 23 45 67 89';content.practice.hours[0].periods=[['09:00','12:30']];
  const shown=presentation(content);assert.equal(shown.practice.phoneInternational,'+33123456789');assert.equal(shown.practice.appointmentUrl,'tel:+33123456789');assert.equal(shown.practice.hours[0].hours,'09:00–12:30');assert.equal(shown.practice.hoursLabel,'Nos horaires d’ouverture');
  const schema=JSON.parse(makeSeo(shown,'home').jsonLd)['@graph'][0];assert.equal(schema.telephone,'+33123456789');assert.equal(schema.openingHoursSpecification[0].opens,'09:00');
});

test('malformed optional fields cannot be saved and do not crash defensive SEO rendering',()=>{
  for(const [path,value] of [[['seo','pages'],{team:{title:{bad:true}}}],[['practice','appointmentUrl'],{}],[['practice','telephone'],{}],[['meta','sourceUrl'],{}]]){const c=structuredClone(seed);let target=c;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=value;assert.ok(validateContent(c).length,path.join('.'));}
  const c=structuredClone(seed);c.seo.pages={team:{title:{bad:true}}};assert.doesNotThrow(()=>makeSeo(c,'team'));
  c.practice.phone='';c.practice.telephone={};assert.doesNotThrow(()=>makeSeo(c,'home'));
});

test('rapid saves have unique concurrency tokens, preventing same-millisecond lost updates',()=>{
  const store=createStore({dbPath:':memory:',seedPath:resolve(root,'data/content.json'),accessPath:false,initialPassword:'temporary-test-password'});
  try{const tokens=new Set();for(let i=0;i<50;i++)tokens.add(store.saveContent(seed).updatedAt);assert.equal(tokens.size,50);}finally{store.close();}
});
