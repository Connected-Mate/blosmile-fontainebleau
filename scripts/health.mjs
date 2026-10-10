const base=process.env.LOCAL_URL||'http://127.0.0.1:3000';
const paths=['/health','/','/equipe','/le-cabinet','/soins','/contact','/venir','/itineraire/qr.png','/cabinet.vcf','/questions-frequentes','/conseils','/admin','/robots.txt','/sitemap.xml','/llms.txt'];
let failed=false;
for(const path of paths){try{const r=await fetch(base+path,{signal:AbortSignal.timeout(5000)});console.log(`${r.status} ${path}`);if(!r.ok)failed=true;}catch(e){failed=true;console.log(`ERREUR ${path} : ${e.message}`);}}
if(failed)process.exitCode=1;
