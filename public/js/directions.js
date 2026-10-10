/* Optional conveniences only. Maps links, contact download and QR form work without JS. */
(() => {
  'use strict';
  const copy = document.querySelector('[data-copy-address]');
  const status = document.querySelector('[data-directions-status]');
  if (copy && status && navigator.clipboard && window.isSecureContext) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copy.dataset.copyAddress); status.textContent = 'Adresse copiée. Vous pouvez la coller dans votre application.'; }
      catch { status.textContent = 'Copie indisponible : sélectionnez l’adresse ci-dessus pour la copier.'; }
    });
  }
  const transfer = document.querySelector('[data-phone-transfer]');
  if (transfer && window.matchMedia && window.matchMedia('(min-width: 801px)').matches) transfer.open = true;
  const form = document.querySelector('[data-qr-form]');
  if (!form) return;
  const select = form.querySelector('[data-qr-select]');
  const image = document.querySelector('[data-qr-image]');
  const link = document.querySelector('[data-qr-link]');
  const caption = document.querySelector('[data-qr-caption]');
  const download = document.querySelector('[data-qr-download]');
  const qrStatus = document.querySelector('[data-qr-status]');
  const result = document.querySelector('.qr-result');
  if (!select || !image || !link || !caption || !download || !qrStatus || !result) return;
  const submit = form.querySelector('[data-qr-submit]');
  const fallback = form.querySelector('[data-qr-fallback]');
  select.hidden = false;
  const label = form.querySelector('[data-qr-label]');
  if (label) label.hidden = false;
  if (fallback) fallback.hidden = true;
  if (submit) submit.hidden = true;
  let version = 0;
  let ready = {url:link.href,download:download.href,name:caption.textContent};
  image.addEventListener('error',()=>{qrStatus.textContent='QR code indisponible. Utilisez les liens d’itinéraire ci-dessus.';});
  function update() {
    const option = select.options[select.selectedIndex];
    const provider = document.querySelector('[data-provider-id="' + select.value + '"]');
    if (!option || !provider) return;
    const current = ++version;
    const source = provider.dataset.qrSource || '/itineraire/qr.png?app=' + encodeURIComponent(select.value);
    const pending = new Image();
    qrStatus.textContent = 'Préparation du QR code…';
    result.setAttribute('data-loading', 'true');
    result.setAttribute('aria-busy', 'true');
    link.removeAttribute('href'); download.removeAttribute('href');
    // Do not let a slower response replace the user's latest selection.
    pending.onload = () => {
      if (current !== version) return;
      image.src = source; image.alt = 'QR code vers ' + option.text + ' pour le cabinet';
      link.href = provider.href; link.setAttribute('aria-label', 'Ouvrir le même itinéraire dans ' + option.text);
      caption.textContent = option.text; download.href = source;
      ready={url:provider.href,download:source,name:option.text};
      result.removeAttribute('data-loading'); result.removeAttribute('aria-busy'); qrStatus.textContent = 'QR code prêt.';
    };
    pending.onerror = () => {
      if (current !== version) return;
      result.removeAttribute('data-loading'); result.removeAttribute('aria-busy');
      link.href=ready.url; download.href=ready.download;
      qrStatus.textContent = 'Le nouveau QR code n’a pas pu être chargé. Le QR code de '+ready.name+' reste affiché.';
      if (submit) submit.hidden = false;
      if (fallback) fallback.hidden = false;
    };
    pending.src = source;
  }
  select.addEventListener('change', update);
  // The visible submit control remains a real GET form if loading ever fails.
})();
