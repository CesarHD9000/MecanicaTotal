# Mecánica Total

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
│   ├── build-env.mjs    Genera public/js/env.js desde variables de entorno
│   └── dev-server.mjs   Servidor local con la misma CSP que producción
│
├── .env.example         Plantilla de credenciales
├── .gitignore · .vercelignore
├── package.json
├── vercel.json          Build y cabeceras (Vercel)
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

Build command en ambas plataformas: `node scripts/build-env.mjs`. Variables de
entorno: `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

**Cloudflare Workers** — conecta el repositorio, define el build y usa como deploy
command `npx wrangler deploy`. `wrangler.jsonc` publica `public/` y
`public/_headers` aplica la CSP.

**Vercel** — importa el repositorio y define las mismas variables. `vercel.json`
ya declara el build, el directorio de salida y las cabeceras.

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
| `icons.js` / `boot.js` | Catálogo de iconos SVG y su pintado en el DOM |
| `richText.js` | Renderizador del texto enriquecido de la teoría |
| `script.js` | Navbar, hero, cursos, quiz, lightbox, contacto |
| `admin.js` | Panel de administración |

## Licencia

Proyecto educativo. El contenido y el código pertenecen a sus autores.
