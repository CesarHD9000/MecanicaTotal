/* ==========================================================================
   icons.js — Iconografía del sitio
   --------------------------------------------------------------------------
   Fuente única de iconos. La librería es Font Awesome 6 (servida por CDN):
   aquí no se dibuja nada a mano, solo se registran los nombres válidos y se
   convierten en marcado.

   · ICON_LIBRARY es además la LISTA BLANCA de `day.icon`, el valor que llega
     de la base de datos. Si un registro trae un nombre que no está aquí,
     Utils.safeIcon() cae en `tools`. Añadir un icono = añadir una línea.
   · No se emite ningún `style=""`: los acentos se resuelven con la clase
     .icon-accent, que ya vive en base/_reset.css.
   · Los iconos son decorativos por defecto (aria-hidden). Si un icono es el
     único contenido de un control, el control necesita su propio aria-label.
   ========================================================================== */

const ICON_LIBRARY = {
  /* --- Categorías de módulo: alimentan el <select> del panel de admin ------ */
  tools:        { name: 'fa-screwdriver-wrench' },
  engine:       { name: 'fa-gears' },
  fluids:       { name: 'fa-oil-can' },
  brake:        { name: 'fa-compact-disc' },
  tire:         { name: 'fa-circle-dot' },
  spark:        { name: 'fa-bolt-lightning', accent: true },
  electrical:   { name: 'fa-car-battery' },
  radiator:     { name: 'fa-fan' },
  obd:          { name: 'fa-microchip' },
  timing:       { name: 'fa-rotate' },
  injection:    { name: 'fa-gas-pump' },
  transmission: { name: 'fa-gear' },

  /* --- Interfaz ---------------------------------------------------------- */
  logo:   { name: 'fa-gears', accent: true },
  close:  { name: 'fa-xmark' },
  up:     { name: 'fa-arrow-up' },
  zoom:   { name: 'fa-magnifying-glass-plus' },
  target: { name: 'fa-bullseye' }
};

const SOCIAL_LIBRARY = {
  facebook:  'fa-facebook-f',
  instagram: 'fa-instagram',
  youtube:   'fa-youtube',
  tiktok:    'fa-tiktok'
};

/* Devuelve el marcado de un icono. `extraClass` sirve para añadir utilidades
   de tamaño o color sin volver a escribir el <i> a mano. */
function icon(key, extraClass = '') {
  const def = ICON_LIBRARY[key] || ICON_LIBRARY.tools;
  const classes = ['fa-solid', def.name];
  if (def.accent) classes.push('icon-accent');
  if (extraClass) classes.push(extraClass);
  return `<i class="${classes.join(' ')}" aria-hidden="true"></i>`;
}

/* Mapa nombre → HTML ya resuelto. Lo consumen Utils.safeIcon(), el pintado de
   [data-icon] y las plantillas que interpolan ${ICONS.zoom}. */
const ICONS = Object.fromEntries(
  Object.keys(ICON_LIBRARY).map(key => [key, icon(key)])
);

const SOCIAL_ICONS = Object.fromEntries(
  Object.entries(SOCIAL_LIBRARY).map(([key, name]) =>
    [key, `<i class="fa-brands ${name}" aria-hidden="true"></i>`])
);

/* --------------------------------------------------------------------------
   MARCA DE MÓDULO
   Sustituye a los antiguos esquemas vectoriales dibujados a mano. Cuando el
   módulo no tiene fotografía de portada se muestra un emblema neutro con el
   icono de su categoría; nunca una ilustración falsa.

   Uso:  ${moduleGlyph(day.icon)}            → portada
         ${moduleGlyph(day.icon, 'sm')}      → miniatura de galería
   -------------------------------------------------------------------------- */
function moduleGlyph(iconKey, size = '') {
  const cls = size === 'sm' ? 'media-glyph media-glyph--sm' : 'media-glyph';
  return `<span class="${cls}" aria-hidden="true">${icon(iconKey)}</span>`;
}

/* --------------------------------------------------------------------------
   PINTADO INICIAL DEL DOM
   Rellena los [data-icon] y los dos controles flotantes que llevan icono.
   Antes vivía en js/boot.js; se fusionó aquí para no cargar un archivo de
   40 líneas cuyo único trabajo era leer este mismo módulo.
   -------------------------------------------------------------------------- */
(function paintStaticIcons() {
  'use strict';

  function paint() {
    document.querySelectorAll('[data-icon]').forEach(el => {
      el.innerHTML = ICONS[el.dataset.icon] || '';
    });

    document.querySelectorAll('[data-social]').forEach(el => {
      el.innerHTML = SOCIAL_ICONS[el.dataset.social] || '';
    });

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
