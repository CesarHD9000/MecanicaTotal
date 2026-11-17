/* ==========================================================================
   analytics.js — Cloudflare Web Analytics
   --------------------------------------------------------------------------
   Carga el beacon SOLO si hay un token configurado. El token llega desde
   `window.__ENV_CF_ANALYTICS_TOKEN`, que genera scripts/build-env.mjs a partir
   de la variable de entorno CF_ANALYTICS_TOKEN.

   Sin token no se carga nada: en local no hay peticiones a terceros y el sitio
   funciona igual.

   Se usa el beacon manual y no la inyección automática de Cloudflare porque la
   automática solo funciona en zonas proxied (dominio propio), no en
   `*.workers.dev`, que es donde se prueba antes de publicar.

   No usa cookies ni identifica visitantes: no requiere banner de consentimiento
   y no contradice la política de privacidad del sitio.
   ========================================================================== */

const CloudflareAnalytics = (() => {
  'use strict';

  const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

  function init() {
    const token = typeof window.__ENV_CF_ANALYTICS_TOKEN === 'string'
      ? window.__ENV_CF_ANALYTICS_TOKEN.trim()
      : '';

    // Sin token: no se inyecta nada (desarrollo local y previews sin analítica).
    if (!token) return false;

    // Evita duplicarlo si el script se vuelve a evaluar.
    if (document.querySelector('script[data-cf-beacon]')) return true;

    const beacon = document.createElement('script');
    beacon.src = BEACON_SRC;
    beacon.defer = true;
    beacon.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    document.head.appendChild(beacon);
    return true;
  }

  return { init };
})();

CloudflareAnalytics.init();
