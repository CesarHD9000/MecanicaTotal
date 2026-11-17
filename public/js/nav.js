/* ==========================================================================
   nav.js — Menú móvil para las páginas que no cargan script.js
   --------------------------------------------------------------------------
   Las páginas legales y el 404 no necesitan toda la lógica de la app, pero sí
   el botón hamburguesa. Se mantiene aquí, pequeño y sin dependencias, para no
   cargar script.js (y sus consultas a Supabase) solo para abrir un menú.
   ========================================================================== */

(function () {
  'use strict';

  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  const toggle = navbar.querySelector('.nav-toggle');
  const links = navbar.querySelector('.nav-links');
  if (!toggle || !links) return;

  function closeMenu() {
    toggle.classList.remove('is-open');
    links.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    const open = !links.classList.contains('is-open');
    toggle.classList.toggle('is-open', open);
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  links.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
})();
