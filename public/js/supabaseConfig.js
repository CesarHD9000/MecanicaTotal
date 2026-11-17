/* ==========================================================================
   supabaseConfig.js — Configuración e inicialización del cliente Supabase
   --------------------------------------------------------------------------
   Las credenciales NO viven en el código fuente. Se leen de `js/env.js`
   (archivo local, excluido del repositorio por .gitignore) o de las variables
   inyectadas por el hosting en tiempo de build (ver scripts/build-env.mjs).

   Ver .env.example y docs/INSTRUCCIONES_SUPABASE.md.
   ========================================================================== */

const SUPABASE_CONFIG = (() => {
  const readEnv = (key) => {
    const value = typeof window !== 'undefined' ? window[key] : undefined;
    return typeof value === 'string' ? value.trim() : '';
  };

  return {
    url: readEnv('__ENV_SUPABASE_URL'),
    anonKey: readEnv('__ENV_SUPABASE_ANON_KEY')
  };
})();

/* Decodifica el payload de un JWT sin verificar la firma.
   Se usa SOLO para rechazar claves privilegiadas en el cliente. */
function readJwtRole(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json).role || null;
  } catch (err) {
    return null;
  }
}

/* Supabase convive con dos generaciones de claves y esta app debe aceptar ambas
   para poder migrar sin romper el sitio:

     legacy  · JWT firmado con el JWT secret del proyecto
               pública   → role "anon"          (empieza por "eyJ")
               privada   → role "service_role"
     nueva   · cadenas opacas, no son JWT
               pública   → "sb_publishable_…"
               privada   → "sb_secret_…"

   La pública es pública por diseño: viaja al navegador y la puede leer
   cualquiera. Lo que protege los datos es la RLS de Postgres, no esta clave.
   La privada omite RLS y nunca debe llegar al cliente. */
const PUBLIC_KEY_PREFIX = 'sb_publishable_';
const SECRET_KEY_PREFIX = 'sb_secret_';

/* Clasifica la clave: 'public' | 'privileged' | 'unknown' | 'missing' */
function classifySupabaseKey(key) {
  const value = String(key || '').trim();
  if (!value) return 'missing';
  if (value.startsWith(SECRET_KEY_PREFIX)) return 'privileged';
  if (value.startsWith(PUBLIC_KEY_PREFIX)) return 'public';
  if (value.startsWith('eyJ')) {
    const role = readJwtRole(value);
    if (role === 'service_role') return 'privileged';
    if (role === 'anon') return 'public';
    return 'unknown';
  }
  return 'unknown';
}

/* Comprueba que la configuración existe y tiene forma válida.
   Devuelve { ok, reason } para poder mostrar un diagnóstico claro. */
function validateSupabaseConfig(config = SUPABASE_CONFIG) {
  if (!config.url || !config.anonKey) {
    return { ok: false, reason: 'MISSING' };
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url)) {
    return { ok: false, reason: 'BAD_URL' };
  }
  const kind = classifySupabaseKey(config.anonKey);
  if (kind === 'privileged') {
    // Nunca debe llegar aquí una clave de servicio: da acceso total a la BD.
    return { ok: false, reason: 'PRIVILEGED_KEY' };
  }
  if (kind !== 'public') {
    return { ok: false, reason: 'BAD_KEY' };
  }
  return { ok: true, reason: null };
}

const isSupabaseConfigured = () => validateSupabaseConfig().ok;

// Inicialización del cliente (solo si la librería y la configuración están listas)
let supabaseClient = null;

if (typeof supabase !== 'undefined') {
  const check = validateSupabaseConfig();

  if (check.ok) {
    try {
      supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    } catch (err) {
      console.error('[Supabase] No se pudo inicializar el cliente.');
    }
  } else if (check.reason === 'PRIVILEGED_KEY') {
    console.error(
      '[Supabase] BLOQUEADO: la clave configurada es privada ("service_role" o "sb_secret_…"). ' +
      'Esa clave omite RLS y nunca debe usarse en el navegador. Usa la clave pública ' +
      '("anon" o "sb_publishable_…").'
    );
  } else if (check.reason === 'MISSING') {
    console.warn(
      '[Supabase] Sin credenciales. Crea js/env.js con __ENV_SUPABASE_URL y ' +
      '__ENV_SUPABASE_ANON_KEY (ver .env.example y docs/INSTRUCCIONES_SUPABASE.md). La web se mostrará sin datos.'
    );
  } else {
    console.error('[Supabase] La configuración tiene un formato inválido. Revisa js/env.js.');
  }
}

// Se expone solo lo necesario; la configuración no se publica en window.
window.isSupabaseConfigured = isSupabaseConfigured;
window.supabaseClient = supabaseClient;
