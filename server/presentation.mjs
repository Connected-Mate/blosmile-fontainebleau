import { getDirections } from './directions.mjs';
// Keep displayed facts and structured data based on the same editable values.
export function presentation(raw){
  const content=structuredClone(raw),p=content.practice;
  content.directions=getDirections(content);
  p.mapUrl=content.directions.mapUrl;
  p.phoneInternational=p.phone.replace(/[^+\d]/g,'').replace(/^0/,'+33');
  if(typeof p.appointmentUrl!=='string'||!p.appointmentUrl||p.appointmentUrl.startsWith('tel:'))p.appointmentUrl='tel:'+p.phoneInternational;
  p.hours.forEach(day=>{day.hours=day.periods.length?day.periods.map(period=>period.join('–')).join(' · '):'Fermé';});
  const working=p.hours.filter(d=>d.periods.length);
  const uniformWeek=working.length===5&&['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].every(name=>working.some(d=>d.day===name))&&working.every(d=>d.hours===working[0].hours);
  p.hoursSummary=uniformWeek?working[0].hours:'Consultez les horaires détaillés';
  p.hoursLabel=uniformWeek?'Du lundi au vendredi':'Nos horaires d’ouverture';
  const placeholders={email:p.email,dentistCount:String(content.team.filter(m=>m.kind==='dentist').length),phone:p.phone,address:p.address,postalCode:p.postalCode,city:p.city,hours:uniformWeek?'du lundi au vendredi, '+working[0].hours:p.hours.map(d=>d.day+' : '+d.hours).join(' ; ')};
  const substitute=text=>String(text).replace(/\{\{(email|dentistCount|phone|address|postalCode|city|hours)\}\}/g,(_,key)=>placeholders[key]);
  content.faq=content.faq.map(f=>({...f,answer:substitute(f.answer)}));
  if(content.pages.team.description)content.pages.team.description=substitute(content.pages.team.description);
  if(content.home.heroCaption)content.home.heroCaption=substitute(content.home.heroCaption);
  if(content.pages.contact.access)content.pages.contact.access=substitute(content.pages.contact.access);
  if(Array.isArray(content.pages.privacy?.sections))content.pages.privacy.sections=content.pages.privacy.sections.map(section=>({...section,paragraphs:section.paragraphs.map(substitute)}));
  return content;
}
