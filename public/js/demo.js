(() => {
  'use strict';

  const dialog = document.querySelector('#demo-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const triggers = Array.from(document.querySelectorAll('[data-open-demo]'));
  const fallback = document.querySelector('.demo-fallback');
  const storageKey = `blosmile-demo-seen:${dialog.dataset.demoVersion || '1'}`;
  let previousFocus = null;
  let hasSeen = false;

  try { hasSeen = sessionStorage.getItem(storageKey) === '1'; } catch { /* Browsing still works if storage is unavailable. */ }

  function showDemo(trigger) {
    if (dialog.open) return;
    previousFocus = trigger || document.activeElement;
    try {
      dialog.showModal();
      document.documentElement.classList.add('demo-open');
    } catch {
      // Keep the complete native disclosure available if modal dialogs fail.
      if (fallback) {
        fallback.hidden = false;
        fallback.open = true;
        const summary = fallback.querySelector('summary');
        if (summary) summary.focus();
      }
    }
  }

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('demo-open');
    try { sessionStorage.setItem(storageKey, '1'); } catch { /* No cookie or external service is needed. */ }
    const focusTarget = previousFocus && previousFocus !== document.body && document.contains(previousFocus)
      ? previousFocus
      : triggers.find(trigger => !trigger.hidden);
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
  });

  triggers.forEach(trigger => {
    trigger.hidden = false;
    trigger.addEventListener('click', () => showDemo(trigger));
  });
  if (fallback) fallback.hidden = true;
  if (!hasSeen) showDemo();
})();
