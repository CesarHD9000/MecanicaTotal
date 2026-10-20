/* ==========================================================================
   utils.js — Utilidades compartidas de saneamiento y seguridad
   --------------------------------------------------------------------------
   Única fuente de verdad para escapar datos que vienen de la base de datos
   antes de insertarlos en el DOM. Cualquier módulo que construya HTML por
   concatenación DEBE pasar sus valores por estas funciones.

   Se carga ANTES que script.js / admin.js en las tres páginas.
   ========================================================================== */

const Utils = (() => {

  const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /* Escapa texto para insertarlo como CONTENIDO o dentro de un atributo
     entre comillas dobles. Cubre los cinco caracteres peligrosos. */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, c => ENTITIES[c]);
  }

  /* Normaliza un texto quitando caracteres de control, que los navegadores
     ignoran al interpretar esquemas de URL ("java\nscript:" se ejecuta como
     "javascript:" en varios motores). */
  function normalizeForScheme(value) {
    return String(value).replace(/[\u0000-\u0020\u007F]/g, '');
  }

  const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

  /* Devuelve una URL segura o cadena vacía.
     - Rutas relativas y anclas: se permiten tal cual.
     - http/https: permitidos.
     - data: solo si se habilita y con el prefijo indicado (imágenes/video).
     - Cualquier otro esquema (javascript:, vbscript:, file:, ...): rechazado. */
  function safeUrl(value, options = {}) {
    const raw = String(value === null || value === undefined ? '' : value).trim();
    if (!raw) return '';

    const normalized = normalizeForScheme(raw);
    const match = normalized.match(SCHEME_RE);

    // Sin esquema → ruta relativa ("img/foto.jpg", "/cursos", "#inicio").
    if (!match) return raw;

    const protocol = match[1].toLowerCase();
    if (protocol === 'http' || protocol === 'https') return raw;

    if (protocol === 'data' && options.allowData) {
      const prefix = (options.dataPrefix || 'image/').toLowerCase();
      const payload = normalized.slice(normalized.indexOf(':') + 1).toLowerCase();
      if (payload.startsWith(prefix)) return raw;
    }

    return '';
  }

  /* URLs de imagen: admite rutas locales, http(s) y data:image/*. */
  function safeImageUrl(value) {
    return safeUrl(value, { allowData: true, dataPrefix: 'image/' });
  }

  /* URLs de video subido: admite rutas locales, http(s), data:video/* y blob:. */
  function safeMediaUrl(value) {
    const raw = String(value === null || value === undefined ? '' : value).trim();
    if (normalizeForScheme(raw).toLowerCase().startsWith('blob:')) return raw;
    return safeUrl(raw, { allowData: true, dataPrefix: 'video/' });
  }

  // ------------------------------------------------------------------------
  // VIDEO — normalización de enlaces de YouTube / Vimeo
  // ------------------------------------------------------------------------
  const YT_RE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;
  const VIMEO_RE = /vimeo\.com\/(?:video\/)?([0-9]{6,})/;
  const FILE_RE = /\.(mp4|webm|ogg)(\?.*)?$/i;

  /* Convierte cualquier variante de enlace en una URL de incrustación segura.
     Si el valor no es un proveedor conocido ni un archivo de video, devuelve
     cadena vacía: nunca se inyecta una URL arbitraria en un <iframe>. */
  function formatVideoUrl(url) {
    const raw = String(url === null || url === undefined ? '' : url).trim();
    if (!raw) return '';

    const yt = raw.match(YT_RE);
    if (yt && yt[1]) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;

    const vimeo = raw.match(VIMEO_RE);
    if (vimeo && vimeo[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;

    // Archivo directo de video (mp4/webm/ogg), local o remoto.
    if (FILE_RE.test(raw)) return safeMediaUrl(raw);

    // Ya viene como URL de incrustación de un proveedor permitido.
    const safe = safeUrl(raw);
    if (!safe) return '';
    try {
      const parsed = new URL(safe, window.location.href);
      const host = parsed.hostname.toLowerCase();
      const isAllowedHost =
        host === 'www.youtube.com' || host === 'youtube.com' ||
        host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com' ||
        host === 'player.vimeo.com';
      return isAllowedHost ? safe : '';
    } catch (err) {
      return '';
    }
  }

  /* ¿La URL es un archivo de video reproducible con <video>? */
  function isVideoFile(url) {
    return FILE_RE.test(String(url || ''));
  }

  /* Escapa un valor para usarlo en un selector CSS / dataset sin romperlo. */
  function toAttrSelector(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  /* Devuelve el SVG de un icono a partir de una clave que viene de la BD.
     Solo acepta claves propias del catálogo: `constructor`, `__proto__` o
     cualquier otra propiedad heredada cae en el icono por defecto. */
  function safeIcon(key, fallbackKey = 'tools') {
    if (typeof ICONS === 'undefined' || !ICONS) return '';
    const fallback = Object.prototype.hasOwnProperty.call(ICONS, fallbackKey) ? ICONS[fallbackKey] : '';
    const name = String(key || '');
    if (!Object.prototype.hasOwnProperty.call(ICONS, name)) return fallback;
    return typeof ICONS[name] === 'string' ? ICONS[name] : fallback;
  }

  return {
    escapeHtml,
    safeUrl,
    safeImageUrl,
    safeMediaUrl,
    formatVideoUrl,
    isVideoFile,
    toAttrSelector,
    safeIcon
  };
})();

if (typeof window !== 'undefined') window.Utils = Utils;
