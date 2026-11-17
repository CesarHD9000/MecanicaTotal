#!/usr/bin/env node
/* ==========================================================================
   scripts/build-env.mjs — Genera js/env.js a partir de variables de entorno
   --------------------------------------------------------------------------
   Las credenciales de Supabase no se versionan. En local se crean a mano
   copiando js/env.example.js; en el hosting se inyectan en el build.

   Uso local:
     cp .env.example .env      (rellena los valores)
     node scripts/build-env.mjs

   En Cloudflare Workers Builds: define SUPABASE_URL, SUPABASE_ANON_KEY y
   (opcional) CF_ANALYTICS_TOKEN en Settings → Build → Build variables and
   secrets. Son variables de BUILD: el script las necesita para generar env.js
   antes del deploy. Las variables de runtime no sirven para este paso.
   ========================================================================== */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'public', 'js', 'env.js');

/* Lee .env sin dependencias externas (solo para desarrollo local). */
function loadDotEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function readRole(jwt) {
  try {
    const payload = String(jwt).split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).role || null;
  } catch (err) {
    return null;
  }
}

/* Misma clasificación que public/js/supabaseConfig.js: Supabase convive con
   dos generaciones de claves y el build debe aceptar ambas.
     pública  → "sb_publishable_…"  o JWT con role "anon"
     privada  → "sb_secret_…"       o JWT con role "service_role" */
function classifyKey(key) {
  const value = String(key || '').trim();
  if (!value) return 'missing';
  if (value.startsWith('sb_secret_')) return 'privileged';
  if (value.startsWith('sb_publishable_')) return 'public';
  if (value.startsWith('eyJ')) {
    const role = readRole(value);
    if (role === 'service_role') return 'privileged';
    if (role === 'anon') return 'public';
    return 'unknown';
  }
  return 'unknown';
}

function fail(message) {
  console.error('\n✖ build-env: ' + message + '\n');
  process.exit(1);
}

loadDotEnv();

const url = (process.env.SUPABASE_URL || '').trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
// Opcional: sin token, analytics.js no carga ningún beacon.
const cfToken = (process.env.CF_ANALYTICS_TOKEN || '').trim();

/* En CI no se conserva un env.js viejo: si faltan variables, el build debe
   fallar para no publicar un sitio sin credenciales. En local sí se permite
   conservar el env.js existente para no obligar a tener un .env. */
const isCI = process.env.CI === 'true' || process.env.WORKERS_CI === '1';

if (!url || !anonKey) {
  if (!isCI && existsSync(TARGET)) {
    console.warn('⚠ build-env: sin variables de entorno; se conserva js/env.js existente.');
    process.exit(0);
  }
  fail(
    'faltan SUPABASE_URL y/o SUPABASE_ANON_KEY.\n' +
    '  · En local: crea un .env (ver .env.example) y ejecuta `npm run build`\n' +
    '  · En Cloudflare: Settings → Build → Build variables and secrets'
  );
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  fail(`SUPABASE_URL no tiene el formato esperado (https://<ref>.supabase.co): ${url}`);
}

const keyKind = classifyKey(anonKey);
if (keyKind === 'privileged') {
  fail(
    'SUPABASE_ANON_KEY contiene una clave privada ("service_role" o "sb_secret_…").\n' +
    '  Esa clave omite RLS y da acceso total a la base de datos: nunca debe\n' +
    '  llegar al navegador. Usa la clave pública ("anon" o "sb_publishable_…").'
  );
}
if (keyKind !== 'public') {
  fail('SUPABASE_ANON_KEY no parece una clave pública válida de Supabase.');
}

if (cfToken && !/^[A-Za-z0-9_-]+$/.test(cfToken)) {
  fail('CF_ANALYTICS_TOKEN tiene caracteres inesperados; revisa el token del beacon.');
}

/* JSON.stringify evita que una comilla o un salto de línea en una variable
   rompa el archivo generado (o inyecte código en él). */
const contents = `/* ==========================================================================
   env.js — GENERADO AUTOMÁTICAMENTE por scripts/build-env.mjs
   No editar a mano ni versionar: está en .gitignore.
   ========================================================================== */

window.__ENV_SUPABASE_URL = ${JSON.stringify(url)};
window.__ENV_SUPABASE_ANON_KEY = ${JSON.stringify(anonKey)};
window.__ENV_CF_ANALYTICS_TOKEN = ${JSON.stringify(cfToken)};
`;

writeFileSync(TARGET, contents, 'utf8');
console.log('✔ public/js/env.js generado para ' + url);
console.log(cfToken
  ? '✔ analítica de Cloudflare activada'
  : '· analítica de Cloudflare desactivada (sin CF_ANALYTICS_TOKEN)');
