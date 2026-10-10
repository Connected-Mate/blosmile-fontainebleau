/* The editor uses DOM text nodes for all stored content; no stored HTML is executed. */
(() => {
  'use strict';
  let csrf = '', content = null, updatedAt = '', dirty = false, active = 'practice', changeCount = 0;
  const $ = selector => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const sections = [
    ['practice', 'Votre cabinet', 'Coordonnées, horaires et informations pratiques : les repères essentiels de vos patients.', '⌂'],
    ['copy', 'Textes communs', 'Titres de rubriques, messages d’accueil, boutons et textes de contact partagés dans le site.', '✎'],
    ['home', 'Page d’accueil', 'Soignez votre première impression : titres, textes, photos et étapes du parcours.', '◇'],
    ['team', 'Votre équipe', 'Présentez les membres du cabinet, leurs fonctions, leurs parcours et leurs portraits.', '♧'],
    ['services', 'Les soins', 'Expliquez chaque soin avec des mots clairs. Les pages et leur référencement suivent vos modifications.', '✧'],
    ['faq', 'Questions fréquentes', 'Répondez aux questions que vos patients se posent avant leur visite.', '?'],
    ['pages', 'Pages intérieures', 'Les introductions et informations propres à chaque page du site.', '▤'],
    ['legal', 'Mentions et confidentialité', 'Tenez à jour les informations légales et les coordonnées de contact.', '§'],
    ['seo', 'Référencement', 'Titres, descriptions et domaine officiel. Activez l’indexation uniquement lorsque le site est prêt à être publié.', '↗'],
    ['articles', 'Conseils dentaires', 'Les articles et ressources documentaires disponibles sur votre site.', '≡'],
    ['media', 'Médiathèque', 'Importez une image, puis sélectionnez-la depuis un champ photo de votre contenu.', '▧'],
    ['revisions', 'Historique', 'Chaque enregistrement crée une version. Vous pouvez restaurer l’une des 100 dernières versions.', '↶'],
    ['settings', 'Réglages et sauvegarde', 'Protégez votre accès et conservez une copie de votre contenu.', '⚙']
  ];
  const labels = {
    src:'Photographie',alt:'Description de l’image',caption:'Légende',privacy:'Confidentialité',paragraphs:'Paragraphes',sections:'Rubriques',resources:'Conseils',cabinet:'Le cabinet',
    directions:'Adresse et itinéraires',practice:'Votre cabinet',home:'Accueil',team:'Équipe',services:'Soins',faq:'Questions fréquentes',pages:'Pages',legal:'Informations légales',seo:'Référencement',meta:'Sources et version',articles:'Conseils dentaires',
    name:'Nom',displayName:'Nom complet affiché',title:'Titre',titleAccent:'Suite du titre en accent',accent:'Texte en accent',description:'Description',summary:'Résumé',text:'Texte',body:'Paragraphes',intro:'Introduction',subtitle:'Sous-titre',eyebrow:'Surtitre',
    phone:'Téléphone affiché',phoneInternational:'Téléphone international',email:'Adresse e-mail',address:'Adresse',postalCode:'Code postal',city:'Ville',department:'Département',country:'Pays',hours:'Horaires',hoursSummary:'Horaires résumés',day:'Jour',periods:'Plages horaires',
    appointmentUrl:'Lien de rendez-vous',appointmentMethod:'Mode de rendez-vous',mapUrl:'Ancien lien de plan (itinéraires calculés depuis l’adresse)',siteUrl:'Domaine officiel (https://…)',logo:'Logo',tagline:'Signature',equipment:'Équipements',
    image:'Photographie',photo:'Photographie',heroImage:'Grande photo d’accueil',heroAlt:'Description de la photo d’accueil',heroCaption:'Légende de la photo',images:'Galerie de photos',cabinetImage:'Photo du cabinet',cabinetSecondImage:'Seconde photo du cabinet',
    introductionEyebrow:'Surtitre de bienvenue',introductionTitle:'Titre de bienvenue',introductionAccent:'Accent de bienvenue',introductionText:'Texte de bienvenue',servicesTitle:'Titre des soins',servicesAccent:'Accent des soins',servicesText:'Introduction des soins',teamTitle:'Titre de l’équipe',teamAccent:'Accent de l’équipe',teamText:'Introduction de l’équipe',cabinetTitle:'Titre du cabinet',cabinetAccent:'Accent du cabinet',cabinetText:'Introduction du cabinet',faqTitle:'Titre des questions fréquentes',faqAccent:'Accent des questions fréquentes',steps:'Étapes du parcours',
    id:'Identifiant',slug:'Adresse de la page (slug)',role:'Fonction',focus:'Domaines de pratique',qualifications:'Diplômes et formations',kind:'Catégorie',icon:'Icône',treatments:'Traitements présentés',practitionerIds:'Identifiants des praticiens',educationalLinks:'Ressources complémentaires',url:'Lien',question:'Question',answer:'Réponse',access:'Informations d’accès',preparation:'Préparer sa visite',
    seoTitle:'Titre pour les moteurs de recherche',seoDescription:'Description pour les moteurs de recherche',indexable:'Autoriser l’indexation du site public',indexingEnabled:'Autoriser l’indexation du site public',ogImage:'Image de partage',siteName:'Nom du site',
    editor:'Éditeur',publicationDirector:'Directeur de la publication',legalName:'Dénomination sociale',siret:'SIRET',rpps:'RPPS / inscription ordinale',host:'Hébergeur',contact:'Contact',privacyContact:'Contact confidentialité',notice:'Information générale',rightsNotice:'Droits des contenus',missingFields:'Informations restant à confirmer',
    sourceUrl:'Page source',sourceUrls:'Pages sources',imageSource:'Source de la photographie',logoSource:'Source du logo',contactSourceUrl:'Source des coordonnées',addressNote:'Note sur l’adresse',additionalSourceFacts:'Informations complémentaires sourcées',additionalSourceUrls:'Sources complémentaires',verifiedAt:'Date de vérification',version:'Version'
  };
  const label = key => labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase());
  async function api(path, options = {}) {
    const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type':'application/json' }), ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const response = await fetch(`/api/admin${path}`, { ...options, headers, credentials:'same-origin' });
    const result = await response.json().catch(() => ({ error:'Réponse du serveur illisible.' }));
    if (!response.ok) {
      if (response.status === 401 && path !== '/login') showLogin();
      throw new Error([result.error, ...(result.errors || [])].filter(Boolean).join('\n'));
    }
    return result;
  }
  function notice(message, error = false) {
    $('#notice').textContent = message;
    $('#notice').className = `notice${error ? ' is-error' : ''}`;
    $('#notice').hidden = false;
  }
  function markDirty() {
    changeCount += 1;
    dirty = true;
    $('#save-button').disabled = false;
    $('#save-state').textContent = 'Modifications non enregistrées';
  }
  function markSaved() {
    dirty = false;
    $('#save-button').disabled = true;
    $('#save-state').textContent = `Enregistré le ${new Date(updatedAt).toLocaleString('fr-FR', { dateStyle:'short',timeStyle:'short' })}`;
  }
  function getValue(path) { return path.reduce((obj, key) => obj?.[key], content); }
  function setValue(path, value) {
    let target = content;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    markDirty();
  }
  function makeButton(text, className, onClick) {
    const button = el('button', className, text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }
  const isImage = key => /^(image|photo|avatar|logo|heroImage|cabinetImage|cabinetSecondImage|ogImage|cover|src)$/i.test(key);
  function field(value, path) {
    const key = String(path.at(-1));
    if (path.join('.') === 'practice.hours') return hoursEditor(value, path);
    if (Array.isArray(value)) return arrayEditor(value, path);
    if (value && typeof value === 'object') {
      const details = el('details', 'object-group');
      details.open = path.length < 2;
      details.append(el('summary', '', label(key)));
      const body = el('div', 'object-body');
      for (const [subkey, item] of Object.entries(value)) body.append(field(item, [...path, subkey]));
      details.append(body);
      return details;
    }
    const wrapper = el('div', typeof value === 'boolean' ? 'field checkbox-field' : 'field');
    const id = `field-${path.join('-').replace(/[^\w-]/g,'-')}`;
    const title = el('label', '', /^\d+$/.test(key) ? `Élément ${Number(key) + 1}` : label(key));
    title.htmlFor = id;
    let input;
    if (typeof value === 'boolean') {
      input = el('input'); input.type = 'checkbox'; input.checked = value;
      input.addEventListener('change', () => setValue(path, input.checked));
      wrapper.append(input, title);
    } else if (key === 'kind') {
      input = el('select');
      for (const [optionValue, text] of [['dentist','Chirurgien-dentiste'],['assistant','Assistant(e) dentaire'],['reception','Accueil et coordination']]) {
        const option = el('option', '', text); option.value = optionValue; option.selected = optionValue === value; input.append(option);
      }
      if (value && !['dentist','assistant','reception'].includes(value)) { const option = el('option','',value); option.value=value;option.selected=true;input.append(option); }
      input.addEventListener('change', () => setValue(path, input.value));
      wrapper.append(title, input);
    } else {
      const multiline = !isImage(key) && (String(value || '').length > 145 || /(text|description|answer|intro|notice|access|body)$/i.test(key));
      input = el(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = typeof value === 'number' ? 'number' : 'text';
      if (multiline) input.rows = Math.min(9, Math.max(3, Math.ceil(String(value || '').length / 90)));
      input.value = value ?? '';
      input.maxLength = 30000;
      input.addEventListener('input', () => setValue(path, typeof value === 'number' ? Number(input.value) : input.value));
      wrapper.append(title);
      if (isImage(key) || (path.at(-2) === 'images' && /^\d+$/.test(key))) {
        const row = el('div', 'field-row');
        row.append(input, makeButton('Choisir une image', 'button secondary small', () => openMediaPicker(path)));
        wrapper.append(row);
        if (/^(\/[^/]|https?:\/\/)/.test(value || '')) {
          const preview = el('img', 'image-preview'); preview.src = value; preview.alt = 'Aperçu de l’image sélectionnée'; preview.loading = 'lazy'; wrapper.append(preview);
        }
      } else wrapper.append(input);
    }
    input.id = id;
    if (key === 'slug') wrapper.append(el('p','field-help','Minuscules et tirets uniquement. Exemple : implantologie. Modifier ce champ change l’adresse de cette page.'));
    if (key === 'id') wrapper.append(el('p','field-help','Identifiant utilisé pour relier ce contenu aux autres sections. Conservez-le si des liens existent.'));
    if (key === 'siteUrl') wrapper.append(el('p','field-help','Laissez vide en local. Renseignez le domaine public réellement utilisé avant d’activer l’indexation.'));
    return wrapper;
  }
  function hoursEditor(days, path) {
    const wrapper=el('section','hours-editor'); wrapper.append(el('h2','','Horaires d’ouverture'),el('p','field-help','Les horaires affichés et les données de référencement sont mis à jour ensemble. Aucun créneau signifie : fermé.'));
    days.forEach((day,index)=>{
      const row=el('div','hours-day'); row.append(el('h3','',day.day));
      const periods=el('div','hours-periods');
      (day.periods||[]).forEach((period,i)=>{
        const line=el('div','hours-period');
        ['Ouverture','Fermeture'].forEach((labelText,j)=>{ const fieldWrap=el('label','',labelText); const input=el('input');input.type='time';input.value=period[j];input.setAttribute('aria-label',labelText+' '+day.day+' plage '+(i+1));input.addEventListener('change',()=>{period[j]=input.value;syncPractice();markDirty();});fieldWrap.append(input);line.append(fieldWrap);});
        const remove=makeButton('×','icon-button delete',()=>{day.periods.splice(i,1);syncPractice();markDirty();renderSection();});remove.setAttribute('aria-label','Retirer la plage '+(i+1)+' du '+day.day);line.append(remove);periods.append(line);
      });
      if(!day.periods.length)periods.append(el('span','closed-day','Fermé'));
      periods.append(makeButton('+ Ajouter une plage','button secondary small',()=>{day.periods.push(['08:00','12:00']);syncPractice();markDirty();renderSection();}));row.append(periods);wrapper.append(row);
    });return wrapper;
  }
  function syncPractice(){
    const p=content.practice; if(!p)return;
    if(typeof p.phone==='string'){p.phoneInternational=p.phone.replace(/[^+\d]/g,'').replace(/^0/,'+33');if(p.appointmentUrl===undefined||p.appointmentUrl===''||(typeof p.appointmentUrl==='string'&&p.appointmentUrl.startsWith('tel:')))p.appointmentUrl='tel:'+p.phoneInternational;}
    if(Array.isArray(p.hours)){p.hours.forEach(d=>{d.hours=d.periods.length?d.periods.map(x=>x.join('–')).join(' · '):'Fermé';});const same=p.hours.length===7&&p.hours.slice(0,5).every(d=>d.hours===p.hours[0].hours)&&p.hours.slice(5).every(d=>!d.periods.length);p.hoursSummary=same?p.hours[0].hours:'Consultez les horaires détaillés';p.hoursLabel=same?'Du lundi au vendredi':'Nos horaires d’ouverture';}
  }
  function emptyLike(value) {
    if (Array.isArray(value)) return [];
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key,emptyLike(item)]));
    if (typeof value === 'boolean') return false;
    if (typeof value === 'number') return 0;
    return '';
  }
  function newItem(path, array) {
    if (path.length === 1 && path[0] === 'team') return { id:`membre-${Date.now()}`, name:'Nouveau membre', role:'', focus:'', qualifications:[], image:'', kind:'dentist' };
    if (path.length === 1 && path[0] === 'services') return { id:`soin-${Date.now()}`, slug:`nouveau-soin-${Date.now()}`, title:'Nouveau soin', subtitle:'', summary:'', intro:'', body:[], treatments:[], practitionerIds:[], educationalLinks:[], image:'', icon:'sparkle', seoTitle:'', seoDescription:'' };
    if (path.length === 1 && path[0] === 'faq') return { question:'Nouvelle question', answer:'' };
    if (path.length === 1 && path[0] === 'articles') return { slug:`nouvel-article-${Date.now()}`, title:'Nouvel article', description:'', category:'implantologie', paragraphs:[], image:'', sourceDate:'', sourceUrl:'' };
    if (path.join('.') === 'practice.hours') return {day:'Lundi',hours:'Fermé',periods:[]};
    if (path.join('.') === 'practice.equipment') return {name:'Nouvel équipement',summary:''};
    if (path.join('.') === 'pages.cabinet.images') return {src:'',alt:'',caption:''};
    if (path.join('.') === 'pages.privacy.sections') return {title:'Nouvelle rubrique',paragraphs:[]};
    if (path.join('.') === 'home.steps') return {title:'Nouvelle étape',text:''};
    if (path.at(-1) === 'periods') return ['08:00','12:00'];
    if (array.length) return emptyLike(array[0]);
    if (path.at(-1) === 'educationalLinks') return { title:'', url:'' };
    if (path.at(-1) === 'periods') return ['08:00','12:00'];
    return '';
  }
  function arrayEditor(array, path) {
    const wrapper = el('div', 'array-group');
    const header = el('div','array-header');
    header.append(el('h3','',`${label(String(path.at(-1)))} · ${array.length}`),makeButton('+ Ajouter','button secondary small',() => { array.push(newItem(path,array)); markDirty(); renderSection(); }));
    wrapper.append(header);
    if (!array.length) wrapper.append(el('p','empty-state','Aucun élément pour le moment. Ajoutez-en un pour commencer.'));
    array.forEach((item,index) => {
      const card = el('div','array-card');
      const cardHeader = el('div','array-card-header');
      const caption = item && typeof item === 'object' && !Array.isArray(item) ? item.name || item.title || item.question || item.day || `Élément ${index+1}` : `Élément ${index+1}`;
      cardHeader.append(el('h3','',caption));
      const actions = el('div','card-actions');
      const up = makeButton('↑','icon-button',() => { [array[index-1],array[index]]=[array[index],array[index-1]];markDirty();renderSection(); }); up.disabled=index===0;up.setAttribute('aria-label',`Monter ${caption}`);
      const down = makeButton('↓','icon-button',() => { [array[index+1],array[index]]=[array[index],array[index+1]];markDirty();renderSection(); }); down.disabled=index===array.length-1;down.setAttribute('aria-label',`Descendre ${caption}`);
      const remove = makeButton('×','icon-button delete',() => { if (window.confirm(`Retirer « ${caption} » ? L’enregistrement sera nécessaire pour appliquer cette modification.`)) {array.splice(index,1);markDirty();renderSection();} });remove.setAttribute('aria-label',`Retirer ${caption}`);
      actions.append(up,down,remove);cardHeader.append(actions);card.append(cardHeader);
      if (item && typeof item === 'object' && !Array.isArray(item)) for(const [key,value] of Object.entries(item)) card.append(field(value,[...path,index,key]));
      else card.append(field(item,[...path,index]));
      wrapper.append(card);
    });
    return wrapper;
  }
  function renderNavigation() {
    const navigation=$('#navigation');navigation.replaceChildren();
    for(const [id,title,,icon] of sections) {
      if(id==='articles'&&!content.articles) continue;
      if(id==='media')navigation.append(el('div','nav-separator'));
      const button=makeButton('','nav-item'+(active===id?' active':''),()=>{active=id;renderNavigation();renderSection();});
      if(active===id)button.setAttribute('aria-current','page');
      button.append(el('span','nav-icon',icon),el('span','',title));navigation.append(button);
    }
  }
  function renderSection() {
    const section=sections.find(item=>item[0]===active);
    $('#section-title').textContent=section[1];$('#section-description').textContent=section[2];$('#notice').hidden=true;
    const editor=$('#editor');editor.replaceChildren();
    if(active==='media'){renderMedia(editor);return;}
    if(active==='revisions'){renderRevisions(editor);return;}
    if(active==='settings'){renderSettings(editor);return;}
    const value=content[active];
    if(Array.isArray(value)) editor.append(arrayEditor(value,[active]));
    else if(value&&typeof value==='object') {
      const panel=el('div','editor-panel');if(active==='practice')panel.append(el('p','advanced-note','L’adresse, le code postal et la ville mettent automatiquement à jour Google Maps, Waze, Apple Plans et les QR codes.'));if(active==='seo')panel.append(el('p','advanced-note','Les variables {{address}}, {{postalCode}}, {{city}} et {{phone}} reprennent automatiquement les coordonnées du cabinet dans vos titres et descriptions.'));const advanced=el('details','object-group');advanced.append(el('summary','','Sources et paramètres avancés'));const advancedBody=el('div','object-body');
      for(const [key,item] of Object.entries(value)){if(active==='practice'&&['mapUrl','phoneInternational','hoursSummary','hoursLabel','siteUrl','heroImage','appointmentMethod'].includes(key))continue; if(/source|Note$|verified|version/i.test(key))advancedBody.append(field(item,[active,key]));else panel.append(field(item,[active,key]));} if(advancedBody.childNodes.length){advanced.append(advancedBody);panel.append(advanced);}editor.append(panel);
    } else editor.append(el('p','empty-state','Cette section n’est pas encore renseignée. L’éditeur JSON, dans les réglages, permet d’ajouter une nouvelle section.'));
  }
  async function renderMedia(container, choose) {
    container.replaceChildren();
    const uploadZone=el('form','upload-zone');
    uploadZone.append(el('h3','','Importer une photographie'),el('p','','JPEG, PNG, WebP ou GIF · 8 Mo maximum. Les images SVG ne sont pas acceptées.'));
    const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/gif';input.required=true;input.setAttribute('aria-label','Image à importer');
    const uploadButton=el('button','button primary','Importer l’image');uploadButton.type='submit';
    const uploadStatus=el('p','');uploadStatus.setAttribute('role','status');
    uploadZone.append(input,uploadButton,uploadStatus);container.append(uploadZone);
    uploadZone.addEventListener('submit',async event=>{
      event.preventDefault();if(!input.files[0])return;
      uploadButton.disabled=true;uploadStatus.textContent='Import en cours…';
      try {const form=new FormData();form.append('file',input.files[0]);await api('/media',{method:'POST',body:form});await renderMedia(container,choose);}
      catch(error){uploadStatus.textContent=error.message;uploadStatus.className='error';uploadButton.disabled=false;}
    });
    try {
      const {media}=await api('/media');
      if(!media.length){container.append(el('p','empty-state','Les images importées apparaîtront ici. Les photographies d’origine restent accessibles depuis leurs champs dans le contenu.'));return;}
      const search=el('input','media-search');search.type='search';search.placeholder='Rechercher une photo…';search.setAttribute('aria-label','Rechercher dans la médiathèque');container.append(search);const grid=el('div','media-grid');search.addEventListener('input',()=>{const q=search.value.toLocaleLowerCase('fr');for(const card of grid.children)card.hidden=!card.dataset.name.includes(q);});
      for(const item of media){
        const card=el('div','media-card'),img=el('img');card.dataset.name=item.originalName.toLocaleLowerCase('fr');img.src=item.url;img.alt=item.originalName;img.loading='lazy';
        const info=el('div','media-info');info.append(el('p','',item.originalName));
        info.append(makeButton(choose?'Utiliser cette image':'Copier le chemin','button secondary small',async()=>{
          if(choose){choose(item.url);return;}
          try{await navigator.clipboard.writeText(item.url);notice(`Chemin copié : ${item.url}`);}catch{window.prompt('Copiez ce chemin dans un champ image :',item.url);}
        }));card.append(img,info);grid.append(card);
      }container.append(grid);
    }catch(error){container.append(el('p','error',error.message));}
  }
  function openMediaPicker(path) {
    const dialog=$('#media-dialog');
    renderMedia($('#dialog-media'),url=>{setValue(path,url);dialog.close();renderSection();});
    dialog.showModal();
  }
  async function renderRevisions(container) {
    try {
      const {revisions}=await api('/revisions');
      for(const [index,revision] of revisions.entries()){
        const row=el('div','revision'),info=el('div');
        info.append(el('p','',`Version ${revision.id}${index===0?' · actuelle':''}`),el('small','',`${new Date(revision.createdAt).toLocaleString('fr-FR')} · ${revision.actor}`));
        const button=makeButton('Restaurer','button secondary small',async()=>{
          if(!window.confirm(`Restaurer la version ${revision.id} ? ${dirty?'Vos modifications non enregistrées seront remplacées. ':''}La version actuelle restera disponible dans l’historique.`))return;
          button.disabled=true;
          try{const result=await api(`/revisions/${revision.id}/restore`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:updatedAt})});content=result.content;updatedAt=result.updatedAt;markSaved();renderSection();notice(`La version ${revision.id} a été restaurée.`);}catch(error){notice(error.message,true);button.disabled=false;}
        });button.disabled=index===0;row.append(info,button);container.append(row);
      }
    }catch(error){notice(error.message,true);}
  }
  function downloadDraft() {
    const blob=new Blob([JSON.stringify(content,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');
    link.href=url;link.download=`blosmile-brouillon-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderSettings(container) {
    const backup=el('section','editor-panel');backup.append(el('h2','','Votre sauvegarde'),el('p','advanced-note','L’export JSON contient tous les textes et les chemins des images. Pour une sauvegarde complète, conservez aussi le dossier .local/uploads et le dossier public/assets.'));
    const exportLink=el('a','button secondary','Exporter le contenu enregistré');exportLink.href='/api/admin/export';
    backup.append(exportLink,document.createTextNode(' '),makeButton('Exporter le brouillon','button secondary',downloadDraft));container.append(backup);
    const security=el('section','editor-panel');security.append(el('h2','','Changer le mot de passe'),el('p','advanced-note','Choisissez une phrase de passe d’au moins 12 caractères. Les autres sessions seront déconnectées.'));
    const form=el('form','settings-form');
    for(const [id,title,autocomplete]of[['currentPassword','Mot de passe actuel','current-password'],['newPassword','Nouveau mot de passe','new-password'],['confirmPassword','Confirmer le nouveau mot de passe','new-password']]){
      const wrapper=el('div','field'),labelNode=el('label','',title);labelNode.htmlFor=id;const input=el('input');input.id=id;input.name=id;input.type='password';input.autocomplete=autocomplete;input.required=true;input.maxLength=200;if(id!=='currentPassword')input.minLength=12;wrapper.append(labelNode,input);form.append(wrapper);
    }
    const submit=el('button','button primary','Modifier le mot de passe');submit.type='submit';form.append(submit);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const values=new FormData(form);
      if(values.get('newPassword')!==values.get('confirmPassword')){notice('Les deux nouveaux mots de passe ne correspondent pas.',true);return;}
      submit.disabled=true;
      try{const result=await api('/password',{method:'POST',body:JSON.stringify({currentPassword:values.get('currentPassword'),newPassword:values.get('newPassword')})});csrf=result.csrfToken;form.reset();notice('Votre mot de passe a été modifié. Les autres sessions ont été fermées.');}
      catch(error){notice(error.message,true);}finally{submit.disabled=false;}
    });security.append(form);container.append(security);
    const advanced=el('details','object-group');advanced.append(el('summary','','Éditeur avancé et import JSON'));
    const advancedBody=el('div','object-body');advancedBody.append(el('p','advanced-note','Tous les champs du site sont modifiables ici. Collez une sauvegarde pour la restaurer, puis appliquez-la au brouillon et enregistrez. Les données seront validées par le serveur.'));
    const textarea=el('textarea','json-editor');textarea.value=JSON.stringify(content,null,2);textarea.setAttribute('aria-label','Document JSON complet');textarea.spellcheck=false;
    const importInput=el('input');importInput.type='file';importInput.accept='.json,application/json';importInput.setAttribute('aria-label','Importer une sauvegarde JSON');
    importInput.addEventListener('change',async()=>{if(importInput.files[0]){if(importInput.files[0].size>2*1024*1024){notice('La sauvegarde dépasse la limite de 2 Mo.',true);return;}textarea.value=await importInput.files[0].text();}});
    advancedBody.append(importInput,textarea,makeButton('Appliquer au brouillon','button secondary',()=>{
      try{const candidate=JSON.parse(textarea.value);if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||!candidate.practice||!Array.isArray(candidate.team)||!Array.isArray(candidate.services)||!Array.isArray(candidate.faq))throw new Error('Les sections practice, team, services et faq sont requises.');content=candidate;markDirty();renderNavigation();notice('Document chargé dans le brouillon. Cliquez sur « Enregistrer » pour appliquer les changements.');}
      catch(error){notice(`Import impossible : ${error.message}`,true);}
    }));advanced.append(advancedBody);container.append(advanced);
  }
  async function loadContent() {
    const keepDraft=dirty&&content;const result=await api('/content');
    if(!keepDraft){content=result.content;updatedAt=result.updatedAt;markSaved();}
    $('#login-view').hidden=true;$('#app-view').hidden=false;renderNavigation();renderSection();
    if(keepDraft){$('#save-button').disabled=false;notice('Votre brouillon a été conservé après reconnexion. Vous pouvez l’enregistrer ou l’exporter.');}
  }
  function showLogin() { $('#app-view').hidden=true;$('#login-view').hidden=false; }
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('#login-error').textContent='';
    try{const session=await api('/session');csrf=session.csrfToken;const result=await api('/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});csrf=result.csrfToken;$('#password').value='';await loadContent();}
    catch(error){$('#login-error').textContent=error.message;}finally{button.disabled=false;}
  });
  $('#save-button').addEventListener('click',async()=>{
    $('#save-button').disabled=true;$('#save-state').textContent='Enregistrement…';
    const snapshot=changeCount;
    try{syncPractice();const result=await api('/content',{method:'PUT',body:JSON.stringify({content,expectedUpdatedAt:updatedAt})});updatedAt=result.updatedAt;if(changeCount===snapshot)markSaved();else markDirty();notice(changeCount===snapshot?'Vos modifications sont enregistrées et visibles sur le site.':'Enregistrement effectué. Vos toutes dernières modifications restent à enregistrer.');}
    catch(error){markDirty();notice(error.message,true);}
  });
  $('#logout').addEventListener('click',async()=>{
    if(dirty&&!window.confirm('Quitter sans enregistrer les modifications ?'))return;
    try{await api('/logout',{method:'POST',body:'{}'});dirty=false;content=null;showLogin();const session=await api('/session');csrf=session.csrfToken;}catch(error){notice(error.message,true);}
  });
  $('#close-media').addEventListener('click',()=>$('#media-dialog').close());
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  (async()=>{
    try{const session=await api('/session');csrf=session.csrfToken;if(session.authenticated)await loadContent();else showLogin();}
    catch(error){showLogin();$('#login-error').textContent=error.message;}finally{$('#loading').hidden=true;}
  })();
})();
