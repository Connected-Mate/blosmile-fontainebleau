import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { validateContent } from '../server/store.mjs';
import { makeSeo, sitemap, getSiteConfig } from '../server/seo.mjs';

const fixture = {
  practice: { name: 'Blosmile', phone: '01 64 22 23 03', address: '192 rue Grande', city: 'Fontainebleau', postalCode: '77300', email:'contact@example.org',logo:'/logo.png',mapUrl:'https://maps.google.com/',hoursSummary:'8h–12h',equipment:[],hours: [{ day: 'Lundi',hours:'08:00–12:00', periods: [['08:00', '12:00']] }] },
  home: { title: 'Notre cabinet',steps:[] },
  team: [{ id: 'praticien', name: 'Dr Exemple', role: 'Chirurgien-dentiste', kind:'dentist',image:'/portrait.png',focus:'',qualifications:[] }],
  services: [{ slug: 'implantologie', title: 'Implantologie',body:[],treatments:[],practitionerIds:[],educationalLinks:[], seoTitle: 'Implantologie à Fontainebleau | Blosmile', seoDescription: 'Notre présentation du traitement.' }],
  faq: [{ question: 'Où ?', answer: 'À Fontainebleau.' }], pages: {team:{},cabinet:{images:[]},services:{},contact:{preparation:[]},faq:{}}, legal: {}, seo: { indexable: false, siteUrl: '' }
};

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'blosmile-test-'));
  mkdirSync(join(dir, 'data'));mkdirSync(join(dir, 'views'));mkdirSync(join(dir, 'public/admin'), { recursive:true });
  writeFileSync(join(dir, 'data/content.json'), JSON.stringify(fixture));
  writeFileSync(join(dir, 'views/page.ejs'), '<!doctype html><html lang="fr"><head><title><%= seo.title %></title><meta name="robots" content="<%= seo.robots %>"><script type="application/ld+json" nonce="<%= nonce %>"><%- seo.jsonLd %></script></head><body><h1><%= content.home.title %></h1><p><%= page %></p></body></html>');
  writeFileSync(join(dir, 'public/admin/index.html'), '<html><body>Administration</body></html>');
  const { app, store } = createApp({ root:dir, initialPassword:'test-password-very-long', loginRateLimit:30 });
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='',csrf='';
  const request=async(path,options={})=>{
    const response=await fetch(base+path,{...options,headers:{...(cookie?{Cookie:cookie}:{}),...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(options.method&&options.method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(options.headers||{})},redirect:'manual'});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  const login=async()=>{
    const session=await(await request('/api/admin/session')).json();csrf=session.csrfToken;
    const response=await request('/api/admin/login',{method:'POST',body:JSON.stringify({username:'admin',password:'test-password-very-long'})});
    assert.equal(response.status,200);csrf=(await response.json()).csrfToken;
  };
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,base,store,request,login,getCookie:()=>cookie,getCsrf:()=>csrf,setCsrf:value=>{csrf=value;}};
}

test('admin authentication protects content and rotates session/CSRF after login', async t=>{
  const app=await setup(t);
  assert.equal((await app.request('/api/admin/content')).status,401);
  const sessionResponse=await app.request('/api/admin/session');
  assert.match(sessionResponse.headers.get('set-cookie'),/HttpOnly/);
  assert.match(sessionResponse.headers.get('set-cookie'),/SameSite=Strict/);
  const anonymousCookie=app.getCookie();
  assert.equal((await app.request('/api/admin/login',{method:'POST',headers:{'X-CSRF-Token':'invalid'},body:JSON.stringify({username:'admin',password:'test-password-very-long'})})).status,403);
  await app.login();assert.notEqual(app.getCookie(),anonymousCookie);
  assert.equal((await app.request('/api/admin/content')).status,200);
  const unauthorized=await fetch(app.base+'/api/admin/content',{headers:{Cookie:anonymousCookie}});
  assert.equal(unauthorized.status,401);
});

test('saving persists content, validates edits, rejects stale revisions and restores earlier content',async t=>{
  const app=await setup(t);await app.login();
  const initial=await(await app.request('/api/admin/content')).json();
  const changed=structuredClone(initial.content);changed.home.title='Un nouveau sourire';
  const result=await app.request('/api/admin/content',{method:'PUT',body:JSON.stringify({content:changed,expectedUpdatedAt:initial.updatedAt})});assert.equal(result.status,200);
  assert.equal(app.store.getContent().content.home.title,'Un nouveau sourire');
  assert.equal((await app.request('/api/admin/content',{method:'PUT',body:JSON.stringify({content:changed,expectedUpdatedAt:'stale'})})).status,409);
  const invalid=structuredClone(changed);invalid.services[0].slug='../../admin';
  assert.equal((await app.request('/api/admin/content',{method:'PUT',body:JSON.stringify({content:invalid})})).status,422);
  const restore=await app.request('/api/admin/revisions/1/restore',{method:'POST',body:'{}'});assert.equal(restore.status,200);
  assert.equal(app.store.getContent().content.home.title,fixture.home.title);
  assert.equal(app.store.listRevisions().length,3);
  const exported=await app.request('/api/admin/export');assert.match(exported.headers.get('content-disposition'),/attachment/);assert.deepEqual(await exported.json(),fixture);
});

test('mutations require CSRF and reject another origin',async t=>{
  const app=await setup(t);await app.login();
  const body=JSON.stringify({content:fixture});
  assert.equal((await app.request('/api/admin/content',{method:'PUT',headers:{'X-CSRF-Token':''},body})).status,403);
  assert.equal((await app.request('/api/admin/content',{method:'PUT',headers:{Origin:'https://attacker.invalid'},body})).status,403);
  assert.equal((await app.request('/api/admin/content',{method:'PUT',headers:{Origin:app.base},body})).status,200);
});

test('image uploads inspect raster signatures and refuse SVG; uploaded files are served',async t=>{
  const app=await setup(t);await app.login();
  const badForm=new FormData();badForm.append('file',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/png'}),'pretend.png');
  assert.equal((await app.request('/api/admin/media',{method:'POST',body:badForm})).status,422);
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WZkAAAAASUVORK5CYII=','base64');
  const validForm=new FormData();validForm.append('file',new Blob([bytes],{type:'image/png'}),'portrait.png');
  const response=await app.request('/api/admin/media',{method:'POST',body:validForm});assert.equal(response.status,201);
  const {media}=await response.json();assert.match(media.url,/^\/uploads\/\d+-[a-f0-9]+\.png$/);
  const served=await app.request(media.url);assert.equal(served.status,200);assert.equal(served.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await(await app.request('/api/admin/media')).json()).media.length,1);
});

test('password changes revoke existing sessions and remove the initial plaintext access file',async t=>{
  const app=await setup(t);await app.login();
  const oldCookie=app.getCookie();
  assert.match(readFileSync(join(app.dir,'.local/admin-access.txt'),'utf8'),/Identifiant : admin/);
  const response=await app.request('/api/admin/password',{method:'POST',body:JSON.stringify({currentPassword:'test-password-very-long',newPassword:'a-new-password-with-24-chars'})});assert.equal(response.status,200);
  app.setCsrf((await response.json()).csrfToken);
  assert.equal((await fetch(app.base+'/api/admin/content',{headers:{Cookie:oldCookie}})).status,401);
  assert.throws(()=>readFileSync(join(app.dir,'.local/admin-access.txt')),{code:'ENOENT'});
  assert.equal((await app.request('/api/admin/content')).status,200);
  assert.equal((await app.request('/api/admin/logout',{method:'POST',body:'{}'})).status,200);
  assert.equal((await app.request('/api/admin/content')).status,401);
});

test('public rendering, redirects, errors and local robots are correct',async t=>{
  const app=await setup(t);
  const page=await app.request('/');assert.equal(page.status,200);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');assert.match(page.headers.get('content-security-policy'),/nonce-/);
  const html=await page.text();assert.match(html,/application\/ld\+json/);assert.match(html,/noindex, nofollow/);
  const alias=await app.request('/l-equipe');assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'/equipe');
  assert.equal((await app.request('/soins/implantologie')).status,200);
  assert.equal((await app.request('/soins/inexistant')).status,404);
  assert.match(await(await app.request('/robots.txt')).text(),/Disallow: \//);
  const xml=await(await app.request('/sitemap.xml')).text();assert.doesNotMatch(xml,/<loc>/);
  assert.match(await(await app.request('/llms.txt')).text(),/192 rue Grande/);
  assert.equal((await app.request('/api/admin/revisions/%/restore',{method:'POST',body:'{}'})).status,400);
  assert.equal((await app.request('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json;charset=unsupported'},body:'{}'})).status,415);
});

test('SEO uses verified domain only, emits safe structured data and preserves custom service metadata',()=>{
  const local=makeSeo(fixture,'home');assert.equal(local.canonical,'');assert.equal(local.noindex,true);
  const publicContent=structuredClone(fixture);publicContent.seo={siteUrl:'https://cabinet.example.org',indexable:true};
  assert.equal(getSiteConfig(publicContent).indexable,true);
  publicContent.home.title='<script>alert(1)</script>';publicContent.faq[0].answer='</script><script>alert(1)</script>';
  const seo=makeSeo(publicContent,'home');assert.equal(seo.noindex,false);assert.equal(seo.canonical,'https://cabinet.example.org/');assert.doesNotMatch(seo.jsonLd,/<script>/);assert.doesNotThrow(()=>JSON.parse(seo.jsonLd));
  assert.equal(makeSeo(publicContent,'service',fixture.services[0]).title,fixture.services[0].seoTitle);
  assert.match(sitemap(publicContent,'2026-10-10T00:00:00Z'),/https:\/\/cabinet.example.org\/soins\/implantologie/);
  publicContent.seo.siteUrl='http://127.0.0.1:3000';assert.equal(getSiteConfig(publicContent).indexable,false);
});

test('validation reports malformed collections, duplicate slugs and unsafe URLs without crashing',()=>{
  assert.equal(validateContent(fixture).length,0);
  assert.ok(validateContent({...fixture,services:{bad:true}}).length);
  assert.ok(validateContent({...fixture,team:[null]}).length);
  assert.ok(validateContent({...fixture,practice:{...fixture.practice,phone:null}}).some(error=>error.includes('practice.phone')));
  assert.ok(validateContent({...fixture,home:{...fixture.home,steps:null}}).some(error=>error.includes('home.steps')));
  assert.ok(validateContent({...fixture,pages:{...fixture.pages,cabinet:null}}).some(error=>error.includes('pages.cabinet')));
  assert.ok(validateContent({...fixture,team:[{...fixture.team[0],qualifications:'invalid'}]}).some(error=>error.includes('qualifications')));
  assert.ok(validateContent({...fixture,services:[...fixture.services,...fixture.services]}).some(error=>error.includes('plusieurs')));
  assert.ok(validateContent({...fixture,home:{heroImage:'javascript:alert(1)'}}).length);
  assert.ok(validateContent(JSON.parse('{"practice":{"name":"x"},"team":[],"services":[],"faq":[],"__proto__":{"polluted":true}}')).length);
});
