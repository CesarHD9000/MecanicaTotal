/* ==========================================================================
   boot.js — Pintado de iconos SVG estáticos
   --------------------------------------------------------------------------
   Sustituye los <script> inline que tenía cada página. Mantener el HTML sin
   JavaScript embebido permite una Content-Security-Policy estricta
   (script-src 'self' https://cdn.jsdelivr.net, sin 'unsafe-inline').

   Solo inyecta contenido del catálogo local `ICONS` / `SOCIAL_ICONS`, nunca
   datos de la base de datos.
   ========================================================================== */

(function () {
  'use strict';

  function paint() {
    if (typeof ICONS === 'undefined') return;

    document.querySelectorAll('[data-icon]').forEach(el => {
      el.innerHTML = ICONS[el.dataset.icon] || '';
    });

    if (typeof SOCIAL_ICONS !== 'undefined') {
      document.querySelectorAll('[data-social]').forEach(el => {
        el.innerHTML = SOCIAL_ICONS[el.dataset.social] || '';
      });
    }

    const closeBtn = document.querySelector('[data-lightbox-close]');
    if (closeBtn) closeBtn.innerHTML = ICONS.close;

    const upBtn = document.querySelector('[data-back-to-top]');
    if (upBtn) upBtn.innerHTML = ICONS.up;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }
})();
