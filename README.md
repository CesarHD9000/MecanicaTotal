# MeKa Total

Plataforma educativa gratuita de mecánica automotriz. Sitio estático (HTML, CSS y
JavaScript sin frameworks) con Supabase como base de datos y autenticación.

## Estructura

```
mecanica/
├── public/              ← único contenido publicado
│   ├── index.html       Portada
│   ├── cursos.html      Lecciones interactivas (LMS)
│   ├── admin.html       Panel de administración (requiere sesión)
│   ├── privacidad.html  Política de privacidad
│   ├── terminos.html    Términos y condiciones
│   ├── css/             base/ (tokens, reset, layout, responsive) + pages/
│   ├── js/              módulos de la aplicación · env.js (generado)
│   ├── img/
│   ├── favicon.svg · apple-touch-icon.png
│   ├── robots.txt · sitemap.xml
│   └── _headers         Cabeceras de seguridad para Cloudflare
│
├── scripts/
│   ├── build-env.mjs      Genera public/js/env.js desde variables de entorno
│   ├── dev-server.mjs     Servidor local con la misma CSP que producción
│   └── audit-classes.mjs  Detecta clases usadas sin CSS en la página (npm run audit:css)
│
├── .env.example         Plantilla de credenciales
├── .gitignore
├── package.json
└── wrangler.jsonc       Assets estáticos (Cloudflare Workers)
```

## Puesta en marcha

Requiere Node 20 o superior.

```bash
cp .env.example .env    # SUPABASE_URL y SUPABASE_ANON_KEY
npm run build           # genera public/js/env.js
npm run dev             # http://localhost:4173
```

Las credenciales se obtienen en **Supabase → Project Settings → API**. Se usa la
clave `anon`, nunca la `service_role`: esa última omite las políticas RLS y el
código se niega a inicializar con ella.

## Despliegue

Plataforma: **Cloudflare Workers** (assets estáticos). Es la única configurada:
`wrangler.jsonc` publica `public/`, `public/_headers` aplica la CSP y
`not_found_handling` sirve `public/404.html` con estado 404.

Build command: `node scripts/build-env.mjs`
Deploy command: `npx wrangler deploy`

En **Workers Builds**, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y (opcional)
`CF_ANALYTICS_TOKEN` van en **Settings → Build → Build variables and secrets**,
no en las variables de runtime: el build los necesita para generar
`public/js/env.js` antes de publicar.

**Analítica.** `js/analytics.js` carga el beacon de Cloudflare Web Analytics solo
si `CF_ANALYTICS_TOKEN` está definido en el build. La CSP ya permite
`static.cloudflareinsights.com` en `script-src` y `cloudflareinsights.com` en
`connect-src`; sin esas entradas el beacon se bloquea en silencio. No usa
cookies, así que no hace falta banner de consentimiento.

> Si además activas la inyección automática de Web Analytics en el panel,
> desactívala para no cargar el beacon dos veces: este proyecto lo carga a mano
> para que funcione también en `*.workers.dev`.

## Seguridad

- Las credenciales no se versionan: `public/js/env.js` está en `.gitignore` y se
  genera en el build.
- La escritura en la base de datos está restringida por políticas RLS a usuarios
  con rol `admin`. **Sin esas políticas aplicadas en Supabase, la clave `anon`
  pública permite escribir en todas las tablas.**
- Content-Security-Policy estricta, sin `unsafe-inline` para scripts.
- Todo dato proveniente de la base pasa por `Utils` antes de entrar al DOM.

## Módulos de JavaScript

| Archivo | Responsabilidad |
|---------|-----------------|
| `utils.js` | Saneamiento: `escapeHtml`, `safeUrl`, `formatVideoUrl`, `safeIcon` |
| `supabaseConfig.js` | Lectura de credenciales y creación del cliente |
| `dbService.js` | Consultas y escrituras, sesión y rol de administrador |
| `icons.js` | Registro de iconos (lista blanca de `day.icon`), helper `icon()` y pintado de `[data-icon]` |
| `richText.js` | Renderizador del texto enriquecido de la teoría |
| `script.js` | Navbar, hero, cursos, quiz, lightbox, contacto |
| `admin.js` | Panel de administración |

## Licencia

Proyecto educativo. El contenido y el código pertenecen a sus autores.
