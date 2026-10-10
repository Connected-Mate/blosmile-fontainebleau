/* Native links, scrolling and content remain usable before enhancement. */
(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';

  function observeMedia(query, listener) {
    // Safari before 14 uses the older MediaQueryList API.
    if (typeof query.addEventListener === 'function') query.addEventListener('change', listener);
    else if (typeof query.addListener === 'function') query.addListener(listener);
  }

  function enhanceNavigation() {
    const button = document.querySelector('.menu-toggle');
    const nav = document.querySelector('#mobile-nav');
    const header = document.querySelector('.site-header');
    if (!button || !nav || !header) return;

    const desktop = window.matchMedia('(min-width: 1151px)');
    const isOpen = () => button.getAttribute('aria-expanded') === 'true';
    function setOpen(open, restoreFocus = false) {
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      nav.hidden = !open;
      if (restoreFocus) button.focus();
    }

    button.addEventListener('click', () => setOpen(!isOpen()));
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) setOpen(false, true);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    document.addEventListener('click', event => {
      if (isOpen() && !header.contains(event.target)) setOpen(false);
    });
    document.addEventListener('focusin', event => {
      if (isOpen() && !header.contains(event.target)) setOpen(false);
    });
    observeMedia(desktop, event => {
      if (!event.matches) return;
      const focusWasInside = nav.contains(document.activeElement) || document.activeElement === button;
      setOpen(false);
      if (focusWasInside) header.querySelector('.brand')?.focus();
    });
    setOpen(false);
    // CSS exposes the mobile navigation until the disclosure is ready.
    header.classList.add('navigation-ready');
  }

  function enhanceTeamRail() {
    const rail = document.querySelector('#team-rail');
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll('.team-card'));
    const previous = document.querySelector('.rail-prev');
    const next = document.querySelector('.rail-next');
    const counter = document.querySelector('.rail-current');
    if (!cards.length || !previous || !next) return;

    let queuedFrame = 0;
    const maxScroll = () => Math.max(0, rail.scrollWidth - rail.clientWidth);
    const position = () => Math.max(0, Math.min(rail.scrollLeft, maxScroll()));
    const cardStarts = () => {
      const firstLeft = cards[0].getBoundingClientRect().left;
      return cards.map(card => card.getBoundingClientRect().left - firstLeft);
    };
    function update() {
      queuedFrame = 0;
      const left = position();
      previous.disabled = left <= 2;
      next.disabled = left >= maxScroll() - 2;
      if (counter) {
        const starts = cardStarts();
        const closest = starts.reduce((best, start, index) => (
          Math.abs(start - left) < Math.abs(starts[best] - left) ? index : best
        ), 0);
        counter.textContent = String(closest + 1).padStart(2, '0');
      }
    }
    function queueUpdate() {
      if (!queuedFrame) queuedFrame = window.requestAnimationFrame(update);
    }
    function scrollTo(left) {
      const target = Math.max(0, Math.min(left, maxScroll()));
      if (typeof rail.scrollTo === 'function') {
        try { rail.scrollTo({ left: target, behavior: scrollBehavior() }); }
        catch { rail.scrollLeft = target; }
      } else rail.scrollLeft = target;
    }
    function move(direction) {
      const left = position();
      const starts = cardStarts();
      const target = direction > 0
        ? starts.find(start => start > left + 3) ?? maxScroll()
        : starts.slice().reverse().find(start => start < left - 3) ?? 0;
      scrollTo(target);
    }

    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    rail.addEventListener('scroll', queueUpdate, { passive: true });
    rail.addEventListener('keydown', event => {
      // Preserve normal keyboard behavior inside links or qualification details.
      if (event.target !== rail || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') scrollTo(0);
      else if (event.key === 'End') scrollTo(maxScroll());
      else move(event.key === 'ArrowRight' ? 1 : -1);
    });
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(queueUpdate);
      observer.observe(rail);
      observer.observe(cards[0]);
    } else window.addEventListener('resize', queueUpdate, { passive: true });
    rail.classList.add('rail-ready');
    update();
  }

  function enhanceGallery() {
    const dialog = document.querySelector('#photo-dialog');
    const buttons = document.querySelectorAll('[data-image]');
    if (!dialog || !buttons.length) return;
    const image = dialog.querySelector('img');
    const caption = dialog.querySelector('p');
    const close = dialog.querySelector('.dialog-close');
    if (!image || !caption || !close) return;
    let trigger = null;

    buttons.forEach(button => button.addEventListener('click', event => {
      if (!button.dataset.image || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      // The original photograph remains available without JavaScript or dialog support.
      if (typeof dialog.showModal !== 'function') return;
      event.preventDefault();
      trigger = button;
      image.src = button.dataset.image;
      image.alt = button.querySelector('img')?.alt || button.dataset.caption || 'Le cabinet Blosmile';
      caption.textContent = button.dataset.caption || 'Le cabinet Blosmile';
      if (!dialog.open) dialog.showModal();
      document.documentElement.classList.add('photo-open');
      close.focus();
    }));
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('photo-open');
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    // Closing is limited to actual backdrop clicks, not image/caption clicks.
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  }

  enhanceNavigation();
  enhanceTeamRail();
  enhanceGallery();
})();
